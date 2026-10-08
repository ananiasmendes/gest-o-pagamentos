import { ErroBling, desconectar, exigirLogin, iniciarConexao, respostaErro, variaveisFaltando } from '@/lib/servidor/bling';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Devolve o endereço do Bling para onde o navegador deve ir para autorizar o aplicativo. */
export async function POST(req: Request) {
  try {
    await exigirLogin(req);
    const faltando = variaveisFaltando();
    if (faltando.length) throw new ErroBling('config', `Falta cadastrar na Vercel: ${faltando.join(', ')}.`, 500);
    return Response.json({ url: await iniciarConexao() });
  } catch (e) { return respostaErro(e); }
}

/** Desconecta: apaga os tokens guardados. */
export async function DELETE(req: Request) {
  try {
    await exigirLogin(req);
    await desconectar();
    return Response.json({ ok: true });
  } catch (e) { return respostaErro(e); }
}
