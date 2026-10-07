/**
 * Integração com o Bling (API v3). Este arquivo só roda no servidor (rotas em src/app/api/bling):
 * usa o client secret do aplicativo e a chave service_role do Supabase, que nunca vão para o navegador.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mapaCodigos, mapaSkus, resolverSku } from '../separacao';
import type { StatusPedido } from '../types';

const API = 'https://api.bling.com.br/Api/v3';
const OAUTH = 'https://www.bling.com.br/Api/v3/oauth';

export class ErroBling extends Error {
  constructor(public codigo: string, mensagem: string, public status = 400) { super(mensagem); }
}

export interface Situacao { id: number; nome: string; idHerdado?: number | null }
export interface Config {
  access_token: string | null; refresh_token: string | null; expira_em: string | null; conectado_em: string | null;
  oauth_state: string | null; oauth_state_em: string | null;
  situacoes: Situacao[]; situacoes_abertas: number[]; situacao_separado: number | null;
  ultima_sync: string | null; ultimo_erro: string | null;
}

/** Situações padrão de pedidos de venda do Bling, usadas se a lista não puder ser lida da conta. */
export const SITUACOES_PADRAO: Situacao[] = [
  { id: 6, nome: 'Em aberto' }, { id: 9, nome: 'Atendido' }, { id: 12, nome: 'Cancelado' }, { id: 15, nome: 'Em andamento' },
  { id: 18, nome: 'Venda agenciada' }, { id: 21, nome: 'Em digitação' }, { id: 24, nome: 'Verificado' },
];
const ID_CANCELADO = 12, ID_DIGITACAO = 21;

// ---------------- Ambiente e banco ---------------------------------------

export const variaveisFaltando = () =>
  ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BLING_CLIENT_ID', 'BLING_CLIENT_SECRET'].filter((v) => !process.env[v]);

let _admin: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new ErroBling('config', 'Falta cadastrar SUPABASE_SERVICE_ROLE_KEY na Vercel.', 500);
  if (!_admin) _admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

/** Só quem está logado no sistema (com o PIN) pode chamar as rotas do Bling. */
export async function exigirLogin(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new ErroBling('login', 'Entre no sistema de novo.', 401);
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new ErroBling('login', 'Entre no sistema de novo.', 401);
  return data.user;
}

const numerosDe = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)) : []);

export async function lerConfig(): Promise<Config> {
  const { data, error } = await admin().from('bling_config').select('*').eq('id', 1).maybeSingle();
  if (error) {
    if (/does not exist|could not find the table/i.test(error.message)) throw new ErroBling('sem_tabelas', 'Falta rodar o arquivo supabase/separacao.sql no Supabase.', 500);
    throw new ErroBling('banco', error.message, 500);
  }
  const c = (data ?? {}) as Record<string, unknown>;
  return {
    access_token: (c.access_token as string) ?? null, refresh_token: (c.refresh_token as string) ?? null,
    expira_em: (c.expira_em as string) ?? null, conectado_em: (c.conectado_em as string) ?? null,
    oauth_state: (c.oauth_state as string) ?? null, oauth_state_em: (c.oauth_state_em as string) ?? null,
    situacoes: Array.isArray(c.situacoes) ? (c.situacoes as Situacao[]) : [],
    situacoes_abertas: numerosDe(c.situacoes_abertas),
    situacao_separado: c.situacao_separado == null ? null : Number(c.situacao_separado),
    ultima_sync: (c.ultima_sync as string) ?? null, ultimo_erro: (c.ultimo_erro as string) ?? null,
  };
}

export async function gravarConfig(campos: Partial<Config>) {
  const { error } = await admin().from('bling_config').update(campos).eq('id', 1);
  if (error) throw new ErroBling('banco', error.message, 500);
}

// ---------------- OAuth ---------------------------------------------------

const basic = () => 'Basic ' + Buffer.from(`${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`).toString('base64');

async function pedirToken(corpo: Record<string, string>) {
  const r = await fetch(`${OAUTH}/token`, {
    method: 'POST', cache: 'no-store',
    headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: '1.0', 'enable-jwt': '1' },
    body: new URLSearchParams(corpo).toString(),
  });
  const j = (await r.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: { description?: string; message?: string } | string } | null;
  if (!r.ok || !j?.access_token) {
    const d = typeof j?.error === 'string' ? j.error : j?.error?.description ?? j?.error?.message ?? `HTTP ${r.status}`;
    throw new ErroBling('token', `O Bling recusou a autorização (${d}).`, 502);
  }
  const campos = {
    access_token: j.access_token, refresh_token: j.refresh_token ?? corpo.refresh_token ?? null,
    expira_em: new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString(),
  };
  await gravarConfig(campos);
  return campos.access_token;
}

/** Monta o endereço de autorização e guarda o "state" (vale 10 minutos, um uso). */
export async function iniciarConexao() {
  const state = randomBytes(24).toString('hex');
  await gravarConfig({ oauth_state: state, oauth_state_em: new Date().toISOString() });
  const u = new URL(`${OAUTH}/authorize`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', process.env.BLING_CLIENT_ID ?? '');
  u.searchParams.set('state', state);
  return u.toString();
}

export async function concluirConexao(code: string, state: string) {
  const cfg = await lerConfig();
  const idade = cfg.oauth_state_em ? Date.now() - Date.parse(cfg.oauth_state_em) : Infinity;
  if (!cfg.oauth_state || cfg.oauth_state !== state || idade > 10 * 60 * 1000) {
    throw new ErroBling('state', 'O pedido de conexão expirou. Toque em "Conectar ao Bling" de novo.');
  }
  await gravarConfig({ oauth_state: null, oauth_state_em: null });
  await pedirToken({ grant_type: 'authorization_code', code });
  const situacoes = await carregarSituacoes();
  const achar = (re: RegExp) => situacoes.filter((s) => re.test(s.nome)).map((s) => s.id);
  await gravarConfig({
    conectado_em: new Date().toISOString(), ultimo_erro: null, situacoes,
    situacoes_abertas: cfg.situacoes_abertas.length ? cfg.situacoes_abertas : achar(/^em (aberto|andamento)$/i),
    situacao_separado: cfg.situacao_separado ?? achar(/separad/i)[0] ?? null,
  });
}

export async function desconectar() {
  await gravarConfig({ access_token: null, refresh_token: null, expira_em: null, conectado_em: null });
}

async function tokenValido(forcar = false): Promise<string> {
  const cfg = await lerConfig();
  if (!cfg.refresh_token) throw new ErroBling('nao_conectado', 'O sistema ainda não está conectado ao Bling.');
  const falta = cfg.expira_em ? Date.parse(cfg.expira_em) - Date.now() : 0;
  if (!forcar && cfg.access_token && falta > 5 * 60 * 1000) return cfg.access_token;
  try {
    return await pedirToken({ grant_type: 'refresh_token', refresh_token: cfg.refresh_token });
  } catch (e) {
    // outra chamada pode ter renovado o token ao mesmo tempo (o Bling troca o refresh token a cada uso)
    const de_novo = await lerConfig();
    if (de_novo.access_token && de_novo.refresh_token !== cfg.refresh_token) return de_novo.access_token;
    await gravarConfig({ ultimo_erro: 'A autorização do Bling venceu. Conecte de novo.' });
    throw new ErroBling('nao_conectado', 'A autorização do Bling venceu. Conecte de novo em Integração Bling.');
  }
}

// ---------------- Chamadas à API ------------------------------------------

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ultimaChamada = 0;

/** O Bling aceita 3 chamadas por segundo; aqui cada chamada espera 350 ms da anterior. */
export async function bling<T = unknown>(caminho: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let token = await tokenValido();
  for (let tentativa = 0; ; tentativa++) {
    const agora = Date.now(), aguardar = ultimaChamada + 350 - agora;
    if (aguardar > 0) await espera(aguardar);
    ultimaChamada = Date.now();
    const r = await fetch(`${API}${caminho}`, {
      method: init?.method ?? 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'enable-jwt': '1', ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (r.status === 429 && tentativa < 3) { await espera(1200); continue; }
    if (r.status === 401 && tentativa < 1) { token = await tokenValido(true); continue; }
    const texto = await r.text();
    let j: { data?: unknown; error?: { description?: string; message?: string; fields?: { msg?: string }[] } } | null = null;
    try { j = texto ? JSON.parse(texto) : null; } catch { j = null; }
    if (!r.ok) {
      const d = [j?.error?.description ?? j?.error?.message, ...(j?.error?.fields ?? []).map((f) => f.msg)].filter(Boolean).join(' ');
      throw new ErroBling(r.status === 404 ? 'nao_encontrado' : 'bling', d || `O Bling respondeu com erro ${r.status}.`, r.status === 404 ? 404 : 502);
    }
    return (j ?? {}) as T;
  }
}

/** Situações do módulo de Vendas da conta (inclui as criadas pelo usuário, como "Separado"). */
export async function carregarSituacoes(): Promise<Situacao[]> {
  try {
    const mods = await bling<{ data: { id: number; nome: string }[] }>('/situacoes/modulos');
    const vendas = mods.data.find((m) => /^vendas?$/i.test(m.nome.trim())) ?? mods.data.find((m) => /venda/i.test(m.nome) && !/compra|proposta/i.test(m.nome));
    if (!vendas) return SITUACOES_PADRAO;
    const r = await bling<{ data: { id: number; nome: string; idHerdado?: number }[] }>(`/situacoes/modulos/${vendas.id}`);
    const lista = r.data.map((s) => ({ id: Number(s.id), nome: s.nome, idHerdado: s.idHerdado ? Number(s.idHerdado) : null }));
    return lista.length ? lista : SITUACOES_PADRAO;
  } catch (e) {
    if (e instanceof ErroBling && e.codigo === 'nao_conectado') throw e;
    return SITUACOES_PADRAO;
  }
}

// ---------------- Pedidos --------------------------------------------------

interface PedidoLista { id: number; numero?: number; data: string; total?: number; totalProdutos?: number; contato?: { nome?: string }; situacao?: { id: number } }
interface PedidoDetalhe extends PedidoLista {
  observacoes?: string;
  itens?: { id: number; codigo?: string; quantidade: number; descricao?: string }[];
}
interface PedidoBanco {
  id: number; status: StatusPedido; situacao_id: number | null; total: number | null; total_produtos: number | null;
  bling_marcado: boolean; sincronizado_em: string; data: string;
}

type Classe = StatusPedido | 'rascunho';
/** Em que pé o pedido está para a fábrica, pela situação dele no Bling. */
export function classificar(situacaoId: number | null | undefined, cfg: Pick<Config, 'situacoes' | 'situacoes_abertas' | 'situacao_separado'>): Classe {
  if (situacaoId == null) return 'enviado';
  if (cfg.situacoes_abertas.includes(situacaoId)) return 'aberto';
  if (cfg.situacao_separado === situacaoId) return 'pronto';
  const s = cfg.situacoes.find((x) => x.id === situacaoId);
  const base = s?.idHerdado || situacaoId;
  if (base === ID_CANCELADO || /cancel/i.test(s?.nome ?? '')) return 'cancelado';
  if (base === ID_DIGITACAO || /digita/i.test(s?.nome ?? '')) return 'rascunho';
  return 'enviado';
}

async function tudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new ErroBling('banco', error.message, 500);
    const linhas = (data ?? []) as T[];
    out.push(...linhas);
    if (linhas.length < 1000) return out;
  }
}

interface Contexto { cfg: Config; skus: Map<string, { modelo_id: string; tamanho: string }>; codigos: Map<string, string>; inicio: string }

export async function contexto(cfg?: Config): Promise<Contexto> {
  const db = admin();
  const [c, skus, modelos, est] = await Promise.all([
    cfg ? Promise.resolve(cfg) : lerConfig(),
    tudo<{ sku: string; modelo_id: string; tamanho: string }>((a, b) => db.from('sku_bling').select('*').order('sku').range(a, b)),
    tudo<{ id: string; codigo: string | null; ativo: boolean }>((a, b) => db.from('modelos').select('id,codigo,ativo').order('id').range(a, b)),
    db.from('estoque_config').select('inicio').eq('id', 1).maybeSingle(),
  ]);
  return { cfg: c, skus: mapaSkus(skus), codigos: mapaCodigos(modelos), inicio: (est.data?.inicio as string | undefined) ?? new Date().toISOString() };
}

/** Data (AAAA-MM-DD) no fuso de São Paulo, que é o que o Bling usa. */
const diaSP = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

/**
 * Grava um pedido do Bling no banco e ajusta a sacola conforme a situação:
 * cancelado devolve as peças; enviado dá baixa no que faltava; aberto vira card.
 * Devolve falso quando o pedido não interessa (ex.: antigo, já atendido antes do início do controle).
 */
export async function gravarPedido(d: PedidoDetalhe, ctx: Contexto, existente?: PedidoBanco | null): Promise<boolean> {
  const db = admin();
  const classe = classificar(d.situacao?.id, ctx.cfg);
  if (!existente) {
    if (classe === 'cancelado' || classe === 'rascunho') return false;
    // saiu sem nunca ter aparecido como aberto: só conta se for venda feita depois do início do controle
    if (classe === 'enviado' && d.data < diaSP(new Date(ctx.inicio))) return false;
  }
  let status: StatusPedido = classe === 'rascunho' ? 'cancelado' : classe;
  // "Pedido pronto" tocado aqui, mas o Bling ainda não foi avisado: continua pronto até o aviso passar
  if (status === 'aberto' && existente?.status === 'pronto' && !existente.bling_marcado) status = 'pronto';

  const linha: Record<string, unknown> = {
    id: d.id, numero: d.numero ?? null, cliente: d.contato?.nome ?? '', data: d.data,
    situacao_id: d.situacao?.id ?? null, status, total: d.total ?? null, total_produtos: d.totalProdutos ?? null,
    observacoes: d.observacoes || null, sincronizado_em: new Date().toISOString(),
  };
  if (classe === 'pronto') { linha.bling_marcado = true; if (existente?.status !== 'pronto') linha.pronto_em = new Date().toISOString(); }
  if (classe === 'aberto' && status === 'aberto') { linha.bling_marcado = false; linha.pronto_em = null; }
  if (!existente && status === 'enviado') linha.baixa_direta = true;
  const up = await db.from('pedidos').upsert(linha);
  if (up.error) throw new ErroBling('banco', up.error.message, 500);

  const itens = (d.itens ?? []).map((i, ordem) => {
    const r = resolverSku(i.codigo, ctx.skus, ctx.codigos);
    return { id: i.id, pedido_id: d.id, sku: i.codigo?.trim() || null, descricao: i.descricao ?? '', quantidade: Math.max(0, Math.round(Number(i.quantidade) || 0)), modelo_id: r?.modelo_id ?? null, tamanho: r?.tamanho ?? null, ordem, _aprendido: r?.aprendido ?? false };
  });
  const novos = itens.filter((i) => i._aprendido && i.sku && i.modelo_id && i.tamanho).map((i) => ({ sku: i.sku!, modelo_id: i.modelo_id!, tamanho: i.tamanho! }));
  if (novos.length) {
    await db.from('sku_bling').upsert(novos, { onConflict: 'sku', ignoreDuplicates: true });
    for (const n of novos) ctx.skus.set(n.sku, { modelo_id: n.modelo_id, tamanho: n.tamanho });
  }
  if (itens.length) {
    const ins = await db.from('pedido_itens').upsert(itens.map(({ _aprendido, ...i }) => i));
    if (ins.error) throw new ErroBling('banco', ins.error.message, 500);
  }
  // itens tirados do pedido no Bling somem daqui (e o que estava na sacola deles volta para a prateleira)
  const apagar = db.from('pedido_itens').delete().eq('pedido_id', d.id);
  const del = await (itens.length ? apagar.not('id', 'in', `(${itens.map((i) => i.id).join(',')})`) : apagar);
  if (del.error) throw new ErroBling('banco', del.error.message, 500);

  if (status === 'cancelado') {
    const r = await db.from('sacola').delete().eq('pedido_id', d.id);
    if (r.error) throw new ErroBling('banco', r.error.message, 500);
  } else if (status === 'enviado' && existente?.status !== 'enviado') {
    await completarSacola(d.id);
  }
  return true;
}

/** O pedido saiu da fábrica: tudo que era dele e ainda não estava na sacola sai da prateleira agora. */
async function completarSacola(pedidoId: number) {
  const db = admin();
  const [it, sa] = await Promise.all([
    db.from('pedido_itens').select('id,modelo_id,tamanho,quantidade').eq('pedido_id', pedidoId),
    db.from('sacola').select('item_id,modelo_id,tamanho,quantidade').eq('pedido_id', pedidoId),
  ]);
  if (it.error || sa.error) throw new ErroBling('banco', (it.error ?? sa.error)!.message, 500);
  const porItem = new Map<number, number>();
  for (const s of sa.data ?? []) porItem.set(Number(s.item_id), (porItem.get(Number(s.item_id)) ?? 0) + Number(s.quantidade));
  const linhas: Record<string, unknown>[] = [];
  for (const i of it.data ?? []) {
    if (!i.modelo_id || !i.tamanho) continue;
    const falta = Number(i.quantidade) - (porItem.get(Number(i.id)) ?? 0);
    if (falta <= 0) continue;
    const ja = (sa.data ?? []).find((s) => Number(s.item_id) === Number(i.id) && s.modelo_id === i.modelo_id && s.tamanho === i.tamanho);
    linhas.push({ pedido_id: pedidoId, item_id: i.id, modelo_id: i.modelo_id, tamanho: i.tamanho, quantidade: Number(ja?.quantidade ?? 0) + falta, updated_at: new Date().toISOString() });
  }
  if (!linhas.length) return;
  const r = await db.from('sacola').upsert(linhas, { onConflict: 'item_id,modelo_id,tamanho' });
  if (r.error) throw new ErroBling('banco', r.error.message, 500);
}

const buscarDetalhe = async (id: number) => (await bling<{ data: PedidoDetalhe }>(`/pedidos/vendas/${id}`)).data;

async function existenteNoBanco(id: number): Promise<PedidoBanco | null> {
  const { data, error } = await admin().from('pedidos').select('id,status,situacao_id,total,total_produtos,bling_marcado,sincronizado_em,data').eq('id', id).maybeSingle();
  if (error) throw new ErroBling('banco', error.message, 500);
  return data ? ({ ...data, id: Number(data.id), situacao_id: data.situacao_id == null ? null : Number(data.situacao_id) } as PedidoBanco) : null;
}

/** Pedido apagado no Bling (ou que não existe mais): as peças voltam para a prateleira. */
export async function cancelarPedido(id: number) {
  const db = admin();
  await db.from('sacola').delete().eq('pedido_id', id);
  await db.from('pedidos').update({ status: 'cancelado', sincronizado_em: new Date().toISOString() }).eq('id', id);
}

/** Busca um pedido no Bling e atualiza o banco (usado pelo webhook e pela sincronização). */
export async function processarPedido(id: number, ctx: Contexto) {
  const existente = await existenteNoBanco(id);
  try {
    return await gravarPedido(await buscarDetalhe(id), ctx, existente);
  } catch (e) {
    if (e instanceof ErroBling && e.codigo === 'nao_encontrado') { if (existente) await cancelarPedido(id); return false; }
    throw e;
  }
}

async function listar(params: string): Promise<PedidoLista[]> {
  const out: PedidoLista[] = [];
  for (let pagina = 1; pagina <= 50; pagina++) {
    const r = await bling<{ data: PedidoLista[] }>(`/pedidos/vendas?pagina=${pagina}&limite=100&${params}`);
    out.push(...(r.data ?? []));
    if ((r.data ?? []).length < 100) break;
  }
  return out;
}

const diferente = (a: number | null | undefined, b: number | null | undefined) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) > 0.005;

/**
 * Traz do Bling o que mudou. Trabalha por até `orcamentoMs` e devolve quantos pedidos ficaram para a próxima
 * chamada (a tela chama de novo até zerar), porque cada pedido custa uma chamada e o Bling limita a 3 por segundo.
 */
export async function sincronizar(orcamentoMs = 40000) {
  const fim = Date.now() + orcamentoMs;
  const cfg = await lerConfig();
  if (!cfg.refresh_token) throw new ErroBling('nao_conectado', 'O sistema ainda não está conectado ao Bling.');
  if (!cfg.situacoes_abertas.length) throw new ErroBling('sem_situacoes', 'Escolha em Integração Bling quais situações de pedido aparecem na separação.');
  const ctx = await contexto(cfg);
  const db = admin();

  const monitoradas = [...cfg.situacoes_abertas, ...(cfg.situacao_separado ? [cfg.situacao_separado] : [])];
  const noBling = await listar(monitoradas.map((s) => `idsSituacoes[]=${s}`).join('&'));
  // vendas dos últimos dias em qualquer situação: pega o que foi direto para "Atendido" sem passar pela separação
  const recentes = await listar(`dataInicial=${diaSP(new Date(Date.now() - 3 * 86400000))}`);

  const banco = await tudo<PedidoBanco>((a, b) => db.from('pedidos').select('id,status,situacao_id,total,total_produtos,bling_marcado,sincronizado_em,data').in('status', ['aberto', 'pronto']).order('id').range(a, b));
  const noBanco = new Map(banco.map((p) => [Number(p.id), { ...p, id: Number(p.id), situacao_id: p.situacao_id == null ? null : Number(p.situacao_id) }]));
  const conhecidos = new Set<number>();
  if (recentes.length) {
    const ids = recentes.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from('pedidos').select('id').in('id', ids.slice(i, i + 200));
      for (const p of data ?? []) conhecidos.add(Number(p.id));
    }
  }

  const fila = new Set<number>();
  const vistos = new Set<number>();
  for (const p of noBling) {
    vistos.add(p.id);
    const b = noBanco.get(p.id);
    const velho = b ? Date.now() - Date.parse(b.sincronizado_em) > 6 * 3600 * 1000 : true;
    if (!b || velho || b.situacao_id !== (p.situacao?.id ?? null) || diferente(b.total, p.total) || diferente(b.total_produtos, p.totalProdutos)) fila.add(p.id);
  }
  // estavam abertos aqui e saíram das situações acompanhadas (atendidos, cancelados...)
  noBanco.forEach((_b, id) => { if (!vistos.has(id)) fila.add(id); });
  for (const p of recentes) {
    if (vistos.has(p.id) || conhecidos.has(p.id)) continue;
    const c = classificar(p.situacao?.id, cfg);
    if (c === 'enviado' && p.data >= diaSP(new Date(ctx.inicio))) fila.add(p.id);
  }

  // aviso de "separado" que não chegou ao Bling: tenta de novo
  if (cfg.situacao_separado) {
    for (const b of banco) {
      if (b.status !== 'pronto' || b.bling_marcado || Date.now() > fim) continue;
      try { await marcarNoBling(Number(b.id), cfg.situacao_separado); fila.delete(Number(b.id)); } catch { /* fica para a próxima */ }
    }
  }

  const ids = Array.from(fila);
  let feitos = 0;
  for (const id of ids) {
    if (Date.now() > fim) break;
    await processarPedido(id, ctx);
    feitos++;
  }
  const restantes = ids.length - feitos;
  await gravarConfig(restantes ? { ultimo_erro: null } : { ultima_sync: new Date().toISOString(), ultimo_erro: null });
  return { atualizados: feitos, restantes };
}

async function marcarNoBling(pedidoId: number, situacaoId: number) {
  await bling(`/pedidos/vendas/${pedidoId}/situacoes/${situacaoId}`, { method: 'PATCH', body: {} });
  const r = await admin().from('pedidos').update({ situacao_id: situacaoId, bling_marcado: true }).eq('id', pedidoId);
  if (r.error) throw new ErroBling('banco', r.error.message, 500);
}

/** "Pedido pronto": fecha a sacola aqui e muda a situação no Bling para "Separado". */
export async function marcarPronto(pedidoId: number) {
  const db = admin();
  const cfg = await lerConfig();
  const p = await db.from('pedidos').select('id,status,situacao_id').eq('id', pedidoId).maybeSingle();
  if (p.error || !p.data) throw new ErroBling('nao_encontrado', 'Pedido não encontrado.', 404);
  const anterior = p.data.status === 'aberto' ? p.data.situacao_id : undefined;
  const r = await db.from('pedidos').update({ status: 'pronto', pronto_em: new Date().toISOString(), bling_marcado: false, ...(anterior !== undefined ? { situacao_anterior: anterior } : {}) }).eq('id', pedidoId);
  if (r.error) throw new ErroBling('banco', r.error.message, 500);
  if (!cfg.situacao_separado) return { aviso: 'Pedido fechado aqui. Falta escolher a situação "Separado" em Integração Bling para o Bling ser avisado.' };
  try {
    await marcarNoBling(pedidoId, cfg.situacao_separado);
    return { aviso: null };
  } catch (e) {
    return { aviso: `Pedido fechado aqui, mas o Bling não aceitou a mudança de situação: ${(e as Error).message} O sistema tenta de novo na próxima atualização.` };
  }
}

/** Desfaz o "Pedido pronto": volta a ser um card e o Bling volta para a situação em que estava. */
export async function reabrirPedido(pedidoId: number) {
  const db = admin();
  const cfg = await lerConfig();
  const p = await db.from('pedidos').select('id,status,situacao_anterior,bling_marcado').eq('id', pedidoId).maybeSingle();
  if (p.error || !p.data) throw new ErroBling('nao_encontrado', 'Pedido não encontrado.', 404);
  const volta = Number(p.data.situacao_anterior ?? 0) || cfg.situacoes_abertas[0];
  let aviso: string | null = null;
  if (p.data.bling_marcado && volta) {
    try { await bling(`/pedidos/vendas/${pedidoId}/situacoes/${volta}`, { method: 'PATCH', body: {} }); }
    catch (e) { aviso = `Reaberto aqui, mas o Bling não aceitou voltar a situação: ${(e as Error).message} Mude a situação do pedido no Bling.`; }
  }
  const r = await db.from('pedidos').update({ status: 'aberto', pronto_em: null, bling_marcado: false, ...(aviso ? {} : { situacao_id: volta ?? null }) }).eq('id', pedidoId);
  if (r.error) throw new ErroBling('banco', r.error.message, 500);
  return { aviso };
}

// ---------------- Webhook --------------------------------------------------

/** Confere a assinatura que o Bling manda no cabeçalho X-Bling-Signature-256 (HMAC-SHA256 do corpo com o client secret). */
export function assinaturaValida(corpo: string, cabecalho: string | null) {
  const segredo = process.env.BLING_CLIENT_SECRET;
  if (!segredo || !cabecalho) return false;
  const esperado = Buffer.from('sha256=' + createHmac('sha256', segredo).update(corpo, 'utf8').digest('hex'));
  const recebido = Buffer.from(cabecalho.trim());
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

/** Resposta padrão de erro das rotas. */
export function respostaErro(e: unknown) {
  const erro = e instanceof ErroBling ? e : new ErroBling('interno', (e as Error)?.message ?? String(e), 500);
  return Response.json({ erro: erro.message, codigo: erro.codigo }, { status: erro.status });
}
