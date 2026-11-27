// Shared types & Cloudflare Workers bindings for FlyTripVisa

export interface Env {
  DB: D1Database;            // D1 binding (see wrangler.jsonc)
  AI: any;                   // Workers AI binding
  ASSETS: Fetcher;           // Static assets binding
  APP_NAME: string;
  WHATSAPP_LINK: string;
  ADMIN_PASSWORD?: string;   // wrangler secret
  OPENAI_API_KEY?: string;   // optional fallback LLM
}

export interface User {
  id?: number;
  email: string;
  name: string;
  password_hash: string;
  created_at?: string;
}

export interface Application {
  id?: number;
  user_email: string;
  service: string;
  details: string;
  status: 'pending' | 'processing' | 'approved' | 'rejected';
  created_at?: string;
}

export interface ChatMessage {
  id?: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export interface ChatRequest {
  message: string;
  session_id?: string;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
