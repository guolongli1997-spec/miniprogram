import { Env, Application, ChatMessage, User } from './types';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const unauthorized = () => json({ ok: false, error: 'Unauthorized: invalid admin password' }, 401);

function checkAuth(request: Request, env: Env): boolean {
  const url = new URL(request.url);
  const key =
    url.searchParams.get('key') ||
    request.headers.get('x-admin-key') ||
    '';
  const expected = env.ADMIN_PASSWORD || 'flytrip-admin-2026';
  return key === expected;
}

// GET /api/admin/summary?key=...  -> overview stats
export async function getSummary(request: Request, env: Env): Promise<Response> {
  if (!checkAuth(request, env)) return unauthorized();

  const [users, apps, msgs] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS c FROM users').first<{ c: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM applications').first<{ c: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM chat_messages').first<{ c: number }>(),
  ]);

  return json({
    ok: true,
    data: {
      users: users?.c ?? 0,
      applications: apps?.c ?? 0,
      chat_messages: msgs?.c ?? 0,
    },
  });
}

// GET /api/admin/applications?key=...
export async function listApplications(request: Request, env: Env): Promise<Response> {
  if (!checkAuth(request, env)) return unauthorized();
  const { results } = await env.DB.prepare(
    'SELECT * FROM applications ORDER BY created_at DESC LIMIT 100'
  ).all<Application>();
  return json({ ok: true, data: results });
}

// GET /api/admin/users?key=...
export async function listUsers(request: Request, env: Env): Promise<Response> {
  if (!checkAuth(request, env)) return unauthorized();
  const { results } = await env.DB.prepare(
    'SELECT id, email, name, created_at FROM users ORDER BY created_at DESC LIMIT 100'
  ).all<Omit<User, 'password_hash'>>();
  return json({ ok: true, data: results });
}

// GET /api/admin/messages?key=...
export async function listMessages(request: Request, env: Env): Promise<Response> {
  if (!checkAuth(request, env)) return unauthorized();
  const { results } = await env.DB.prepare(
    'SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 100'
  ).all<ChatMessage>();
  return json({ ok: true, data: results });
}

// PATCH /api/admin/applications?id=1&status=approved
export async function updateApplicationStatus(request: Request, env: Env): Promise<Response> {
  if (!checkAuth(request, env)) return unauthorized();
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const status = url.searchParams.get('status');
  const allowed = ['pending', 'processing', 'approved', 'rejected'];
  if (!id || !status || !allowed.includes(status)) {
    return json({ ok: false, error: 'Invalid id or status' }, 400);
  }
  await env.DB.prepare('UPDATE applications SET status = ?1 WHERE id = ?2')
    .bind(status, Number(id))
    .run();
  return json({ ok: true });
}
