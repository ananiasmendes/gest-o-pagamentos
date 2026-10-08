import { assinaturaValida, cancelarPedido, contexto, processarPedido } from '@/lib/servidor/bling';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 30;

/**
 * Aviso do Bling quando um pedido de venda é criado, alterado ou apagado.
 * Só é aceito com a assinatura do aplicativo. O Bling espera uma resposta 2xx em até 5 segundos.
 */
export async function POST(req: Request) {
  const corpo = await req.text();
  if (!assinaturaValida(corpo, req.headers.get('x-bling-signature-256'))) return new Response('assinatura inválida', { status: 401 });
  try {
    const m = JSON.parse(corpo) as { event?: string; data?: { id?: number | string } };
    const id = Number(m.data?.id);
    if (m.event?.startsWith('order.') && Number.isInteger(id) && id > 0) {
      if (m.event === 'order.deleted') await cancelarPedido(id);
      else await processarPedido(id, await contexto());
    }
  } catch (e) {
    // erro nosso: responde 200 mesmo assim (a próxima sincronização corrige) para o Bling não desligar o webhook
    console.error('webhook bling', e);
  }
  return Response.json({ ok: true });
}
