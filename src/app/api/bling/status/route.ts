import { exigirLogin, lerConfig, respostaErro, variaveisFaltando, SITUACOES_PADRAO } from '@/lib/servidor/bling';

export const dynamic = 'force-dynamic';

/** Estado da conexão com o Bling, sem nenhum token. */
export async function GET(req: Request) {
  try {
    const faltando = variaveisFaltando();
    if (faltando.includes('SUPABASE_SERVICE_ROLE_KEY') || faltando.includes('NEXT_PUBLIC_SUPABASE_URL')) {
      return Response.json({ faltando, conectado: false, situacoes: [], situacoes_abertas: [], situacao_separado: null, ultima_sync: null, ultimo_erro: null });
    }
    await exigirLogin(req);
    const c = await lerConfig();
    return Response.json({
      faltando, conectado: Boolean(c.refresh_token), conectado_em: c.conectado_em,
      situacoes: c.situacoes.length ? c.situacoes : SITUACOES_PADRAO,
      situacoes_abertas: c.situacoes_abertas, situacao_separado: c.situacao_separado,
      ultima_sync: c.ultima_sync, ultimo_erro: c.ultimo_erro,
    });
  } catch (e) { return respostaErro(e); }
}
