import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigurado = Boolean(url && key);
export const LOGIN_EMAIL = process.env.NEXT_PUBLIC_LOGIN_EMAIL ?? '';

export const supabase: SupabaseClient = createClient(
  url || 'https://exemplo.supabase.co',
  key || 'chave-ausente',
  { auth: { persistSession: true, autoRefreshToken: true } },
);

/** Traduz erros comuns do Postgres/Supabase para mensagens úteis. */
export function mensagemErro(e: unknown): string {
  const err = e as { message?: string; code?: string; details?: string } | null;
  const msg = err?.message ?? String(e);
  if (err?.code === '23503') return 'Este registro está em uso (há entradas ou pagamentos ligados a ele). Desative em vez de excluir.';
  if (err?.code === '23505') return 'Já existe um registro igual.';
  if (/Invalid login credentials/i.test(msg)) return 'PIN incorreto.';
  if (/Failed to fetch/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  return msg;
}
