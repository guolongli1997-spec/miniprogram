// FlyTripVisa Worker — API routes + static assets
// Routes:
//   POST /api/chat      -> AI assistant (Workers AI)
//   POST /api/signup    -> create account (D1)
//   POST /api/login     -> login (D1)
//   POST /api/apply     -> submit visa/flight/eSIM application
//   GET  /api/applications?email=...
//   /api/admin/*        -> admin dashboard API (see admin.ts)
//   /*                  -> static files from /public

import { Env, ChatRequest, Application, User } from './types';
import * as admin from './admin';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type,x-admin-key',
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    },
  });

const readBody = async <T>(request: Request): Promise<T | null> => {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
};

async function hashPassword(password: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('flytrip::' + password)
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- AI chat ----------
const SYSTEM_PROMPT = `You are the FlyTripVisa AI assistant.
FlyTripVisa provides: visa consultancy (Dubai/GCC, China, Malaysia, Saudi Arabia, Europe),
flight ticketing, hotel bookings, instant travel eSIMs (150+ countries), and business setup
in UAE, China and Malaysia. Pricing examples: UAE 10GB/30d eSIM $29, China 15GB eSIM $35,
Saudi 20GB eSIM $32, Asia regional 50GB $49, Dubai 30-day tourist visa from $59.
Be concise, friendly and helpful. For applications, payments and document submission,
direct users to tap "Apply" or connect via WhatsApp: https://wa.me/message/SD44CN7CQKC7K1`;

const FAQ_FALLBACK: Array<[RegExp, string]> = [
  [/dubai.*visa|uae.*visa/i, 'Dubai tourist visa: 30 days from $59, 60 days available. Processing 24-72h. Tap Apply or WhatsApp us at https://wa.me/message/SD44CN7CQKC7K1'],
  [/esim|sim|data/i, 'We offer instant eSIMs for 150+ countries with QR delivery: UAE 10GB $29, China 15GB $35, Saudi 20GB $32, Asia regional 50GB $49.'],
  [/flight|ticket|air/i, 'We book worldwide flights (economy & business) at the best price. Share your route and dates via WhatsApp and we will send options in minutes.'],
  [/hotel|stay|room/i, 'We book luxury & budget hotels worldwide. Tell us your destination, dates and budget and we will arrange it.'],
  [/business|company|setup/i, 'We handle business setup & corporate establishment in UAE, China and Malaysia, including licensing, visas and bank accounts.'],
  [/china.*visa|m.?visa/i, 'China M-Visa & trade/exhibition invitations from $1,120 processed cases of experience. Apply via WhatsApp with your passport scan.'],
  [/price|cost|fee|how much/i, 'Typical pricing: Dubai visa $59+, eSIMs from $29, flights quoted live. Ask about anything specific and we will quote instantly.'],
];

function fallbackAnswer(message: string): string {
  for (const [re, answer] of FAQ_FALLBACK) {
    if (re.test(message)) return answer;
  }
  return "Hello! 👋 I can help with visas, flights, hotels, eSIMs and business setup. Ask me something specific (e.g. 'Dubai visa price') or connect with a consultant on WhatsApp: https://wa.me/message/SD44CN7CQKC7K1";
}

async function handleChat(request: Request, env: Env): Promise<Response> {
  const body = await readBody<ChatRequest>(request);
  if (!body?.message) return json({ ok: false, error: 'message is required' }, 400);
  const sessionId = body.session_id || crypto.randomUUID();

  let reply = '';
  try {
    const result: any = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: body.message },
      ],
      max_tokens: 512,
    });
    reply = (result?.response || '').trim() || fallbackAnswer(body.message);
  } catch {
    reply = fallbackAnswer(body.message);
  }

  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO chat_messages (session_id, role, content) VALUES (?1, ?2, ?3)'
      ).bind(sessionId, 'user', body.message),
      env.DB.prepare(
        'INSERT INTO chat_messages (session_id, role, content) VALUES (?1, ?2, ?3)'
      ).bind(sessionId, 'assistant', reply),
    ]);
  } catch {
    // chat log failures must not break the reply
  }

  return json({ ok: true, data: { reply, session_id: sessionId } });
}

// ---------- Auth ----------
async function handleSignup(request: Request, env: Env): Promise<Response> {
  const body = await readBody<{ email: string; password: string; name?: string }>(request);
  if (!body?.email || !body.password) return json({ ok: false, error: 'email and password are required' }, 400);
  if (body.password.length < 8) return json({ ok: false, error: 'Password must be at least 8 characters' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1')
    .bind(body.email.toLowerCase())
    .first();
  if (existing) return json({ ok: false, error: 'This email is already registered' }, 409);

  const name = body.name?.trim() || body.email.split('@')[0];
  const passwordHash = await hashPassword(body.password);
  await env.DB.prepare(
    'INSERT INTO users (email, name, password_hash) VALUES (?1, ?2, ?3)'
  )
    .bind(body.email.toLowerCase(), name, passwordHash)
    .run();

  return json({ ok: true, data: { email: body.email.toLowerCase(), name } });
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await readBody<{ email: string; password: string }>(request);
  if (!body?.email || !body.password) return json({ ok: false, error: 'email and password are required' }, 400);

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?1')
    .bind(body.email.toLowerCase())
    .first<User>();
  const passwordHash = await hashPassword(body.password);
  if (!user || user.password_hash !== passwordHash) {
    return json({ ok: false, error: 'Invalid email or password' }, 401);
  }
  return json({ ok: true, data: { email: user.email, name: user.name } });
}

// ---------- Applications ----------
async function handleApply(request: Request, env: Env): Promise<Response> {
  const body = await readBody<{ email: string; service: string; details?: string }>(request);
  if (!body?.service) return json({ ok: false, error: 'service is required' }, 400);

  const app: Application = {
    user_email: body.email || 'guest@flytripvisa.site',
    service: body.service,
    details: body.details || '',
    status: 'pending',
  };
  const result = await env.DB.prepare(
    'INSERT INTO applications (user_email, service, details, status) VALUES (?1, ?2, ?3, ?4)'
  )
    .bind(app.user_email, app.service, app.details, app.status)
    .run();

  return json({ ok: true, data: { id: result.meta.last_row_id, ...app } });
}

async function listApplications(request: Request, env: Env): Promise<Response> {
  const email = new URL(request.url).searchParams.get('email');
  if (!email) return json({ ok: false, error: 'email is required' }, 400);
  const { results } = await env.DB.prepare(
    'SELECT * FROM applications WHERE user_email = ?1 ORDER BY created_at DESC LIMIT 50'
  )
    .bind(email)
    .all<Application>();
  return json({ ok: true, data: results });
}

// ---------- Router ----------
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    try {
      if (path === '/api/chat' && request.method === 'POST') return await handleChat(request, env);
      if (path === '/api/signup' && request.method === 'POST') return await handleSignup(request, env);
      if (path === '/api/login' && request.method === 'POST') return await handleLogin(request, env);
      if (path === '/api/apply' && request.method === 'POST') return await handleApply(request, env);
      if (path === '/api/applications' && request.method === 'GET') return await listApplications(request, env);

      if (path.startsWith('/api/admin/')) {
        switch (path) {
          case '/api/admin/summary':
            return await admin.getSummary(request, env);
          case '/api/admin/applications':
            if (request.method === 'PATCH') return await admin.updateApplicationStatus(request, env);
            return await admin.listApplications(request, env);
          case '/api/admin/users':
            return await admin.listUsers(request, env);
          case '/api/admin/messages':
            return await admin.listMessages(request, env);
          default:
            return json({ ok: false, error: 'Unknown admin route' }, 404);
        }
      }

      // Everything else: static assets from /public
      return env.ASSETS.fetch(request);
    } catch (err: any) {
      return json({ ok: false, error: err?.message || 'Internal server error' }, 500);
    }
  },
};
