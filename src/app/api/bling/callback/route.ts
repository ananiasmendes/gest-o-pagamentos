import { NextResponse } from 'next/server';
import { concluirConexao } from '@/lib/servidor/bling';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** O Bling manda o usuário de volta para cá depois que ele autoriza o aplicativo. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const destino = new URL('/bling', u.origin);
  try {
    const code = u.searchParams.get('code'), state = u.searchParams.get('state');
    if (!code || !state) throw new Error(u.searchParams.get('error_description') ?? 'O Bling não devolveu a autorização.');
    await concluirConexao(code, state);
    destino.searchParams.set('ok', '1');
  } catch (e) {
    destino.searchParams.set('erro', (e as Error).message);
  }
  return NextResponse.redirect(destino);
}
