import { ErroBling, carregarSituacoes, exigirLogin, gravarConfig, respostaErro } from '@/lib/servidor/bling';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 30;

/** Grava quais situações viram cards e qual é a de "Separado". Com { recarregar: true }, relê as situações da conta. */
export async function POST(req: Request) {
  try {
    await exigirLogin(req);
    const b = (await req.json().catch(() => ({}))) as { situacoes_abertas?: unknown; situacao_separado?: unknown; recarregar?: boolean };
    if (b.recarregar) {
      const situacoes = await carregarSituacoes();
      await gravarConfig({ situacoes });
      return Response.json({ ok: true, situacoes });
    }
    const abertas = Array.isArray(b.situacoes_abertas) ? b.situacoes_abertas.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    const separado = b.situacao_separado == null || b.situacao_separado === '' ? null : Number(b.situacao_separado);
    if (!abertas.length) throw new ErroBling('config', 'Escolha pelo menos uma situação para aparecer na separação.');
    if (separado !== null && (!Number.isInteger(separado) || separado <= 0)) throw new ErroBling('config', 'Situação de "Separado" inválida.');
    if (separado !== null && abertas.includes(separado)) throw new ErroBling('config', 'A situação de "Separado" não pode ser uma das que aparecem na separação.');
    await gravarConfig({ situacoes_abertas: abertas, situacao_separado: separado });
    return Response.json({ ok: true });
  } catch (e) { return respostaErro(e); }
}
