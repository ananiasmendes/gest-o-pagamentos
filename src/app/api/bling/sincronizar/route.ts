import { ErroBling, exigirLogin, gravarConfig, respostaErro, sincronizar } from '@/lib/servidor/bling';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

/** Traz do Bling os pedidos novos e o que mudou. A tela chama de novo enquanto "restantes" for maior que zero. */
export async function POST(req: Request) {
  try {
    await exigirLogin(req);
    return Response.json(await sincronizar(40000));
  } catch (e) {
    if (!(e instanceof ErroBling) || e.codigo === 'bling') await gravarConfig({ ultimo_erro: (e as Error).message }).catch(() => {});
    return respostaErro(e);
  }
}
