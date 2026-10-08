import { ErroBling, exigirLogin, marcarPronto, reabrirPedido, respostaErro } from '@/lib/servidor/bling';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 30;

/** { id, acao: 'pronto' | 'reabrir' } */
export async function POST(req: Request) {
  try {
    await exigirLogin(req);
    const b = (await req.json().catch(() => ({}))) as { id?: unknown; acao?: string };
    const id = Number(b.id);
    if (!Number.isInteger(id) || id <= 0) throw new ErroBling('pedido', 'Pedido inválido.');
    if (b.acao === 'pronto') return Response.json(await marcarPronto(id));
    if (b.acao === 'reabrir') return Response.json(await reabrirPedido(id));
    throw new ErroBling('pedido', 'Ação desconhecida.');
  } catch (e) { return respostaErro(e); }
}
