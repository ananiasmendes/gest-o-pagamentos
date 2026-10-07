import type { Entrada, EstoqueMov, Modelo, Pedido, PedidoItem, SacolaItem, SkuBling } from './types';

/** Último dígito do código do Bling -> tamanho. Ex.: 10201 = modelo 1020, tamanho P. */
export const DIGITO_TAMANHO: Record<string, string> = { '0': 'U', '1': 'P', '2': 'M', '3': 'G', '4': 'GG' };
export const TAMANHOS_ESTOQUE = ['U', 'P', 'M', 'G', 'GG'];
export const ordemTamanho = (t: string) => { const i = TAMANHOS_ESTOQUE.indexOf(t); return i < 0 ? 99 : i; };

export const chaveSku = (modelo_id: string, tamanho: string) => `${modelo_id}|${tamanho}`;

export interface Resolvido { modelo_id: string; tamanho: string; aprendido: boolean }

/**
 * Descobre o modelo e o tamanho de um código do Bling.
 * 1º a tabela de correspondência; 2º a regra "código do modelo + dígito do tamanho",
 * que só vale quando o código do modelo existe no cadastro.
 */
export function resolverSku(
  sku: string | null | undefined,
  tabela: Map<string, { modelo_id: string; tamanho: string }>,
  modeloPorCodigo: Map<string, string>,
): Resolvido | null {
  const s = (sku ?? '').trim();
  if (!s) return null;
  const t = tabela.get(s);
  if (t) return { ...t, aprendido: false };
  // o próprio código de um modelo (o "pai") não movimenta estoque
  if (modeloPorCodigo.has(s)) return null;
  const tamanho = DIGITO_TAMANHO[s.slice(-1)];
  const modelo_id = modeloPorCodigo.get(s.slice(0, -1));
  return tamanho && modelo_id ? { modelo_id, tamanho, aprendido: true } : null;
}

export const mapaSkus = (skus: SkuBling[]) => new Map(skus.map((s) => [s.sku, { modelo_id: s.modelo_id, tamanho: s.tamanho }]));
export const mapaCodigos = (modelos: Pick<Modelo, 'id' | 'codigo' | 'ativo'>[]) => {
  const m = new Map<string, string>();
  // em caso de código repetido, o modelo ativo ganha
  for (const x of [...modelos].sort((a, b) => Number(a.ativo) - Number(b.ativo))) if (x.codigo) m.set(x.codigo.trim(), x.id);
  return m;
};

/**
 * Peças na prateleira por modelo e tamanho:
 * contagens e ajustes + entradas de costura lançadas depois do início do controle − tudo que foi para sacolas.
 */
export function calcularPrateleira(p: {
  entradas: Entrada[]; movimentos: EstoqueMov[]; sacola: SacolaItem[]; inicio: string | null;
}): Map<string, number> {
  const m = new Map<string, number>();
  const soma = (k: string, q: number) => m.set(k, (m.get(k) ?? 0) + q);
  for (const x of p.movimentos) soma(chaveSku(x.modelo_id, x.tamanho), x.quantidade);
  if (p.inicio) {
    const ini = Date.parse(p.inicio);
    for (const e of p.entradas) {
      if (e.operacao !== 'Costura' || !e.modelo_id || !e.tamanho || !e.created_at) continue;
      if (Date.parse(e.created_at) >= ini) soma(chaveSku(e.modelo_id, e.tamanho), e.quantidade);
    }
  }
  for (const s of p.sacola) soma(chaveSku(s.modelo_id, s.tamanho), -s.quantidade);
  return m;
}

export interface SituacaoItem {
  item: PedidoItem;
  /** quanto já está na sacola */
  sacola: number;
  /** quanto dá para pegar na prateleira agora, respeitando os pedidos mais antigos */
  pegar: number;
  /** quanto ainda não existe em estoque */
  produzir: number;
  /** item manual: quanto falta escolher */
  escolher: number;
  completo: boolean;
}
export interface SituacaoPedido {
  pedido: Pedido; itens: SituacaoItem[];
  total: number; sacola: number; pegar: number; produzir: number; escolher: number; completo: boolean;
}
export interface SituacaoSku {
  /** peças soltas na prateleira */
  prateleira: number;
  /** nas sacolas de pedidos que ainda não saíram */
  nasSacolas: number;
  /** na prateleira, mas já prometidas a um pedido em aberto */
  reservado: number;
  /** prateleira − reservado: o que dá para vender hoje */
  livre: number;
  /** pedidos em aberto esperando peça que não existe */
  produzir: number;
}

/** Pedido mais antigo primeiro; empate pelo número. */
export const ordemPedidos = (a: Pedido, b: Pedido) => a.data.localeCompare(b.data) || (a.numero ?? a.id) - (b.numero ?? b.id);

/**
 * Distribui a prateleira entre os pedidos em aberto, do mais antigo para o mais novo.
 * Um pedido novo só "pode pegar" o que sobra depois de atender os mais antigos.
 */
export function alocar(p: {
  pedidos: Pedido[]; itens: PedidoItem[]; sacola: SacolaItem[]; prateleira: Map<string, number>;
}): { pedidos: SituacaoPedido[]; skus: Map<string, SituacaoSku> } {
  const itensDe = new Map<number, PedidoItem[]>();
  for (const i of p.itens) { const l = itensDe.get(i.pedido_id); if (l) l.push(i); else itensDe.set(i.pedido_id, [i]); }
  const naSacola = new Map<number, number>();
  for (const s of p.sacola) naSacola.set(s.item_id, (naSacola.get(s.item_id) ?? 0) + s.quantidade);

  const skus = new Map<string, SituacaoSku>();
  const sku = (k: string) => {
    let s = skus.get(k);
    if (!s) { s = { prateleira: p.prateleira.get(k) ?? 0, nasSacolas: 0, reservado: 0, livre: 0, produzir: 0 }; skus.set(k, s); }
    return s;
  };
  p.prateleira.forEach((_q, k) => { sku(k); });

  const vivos = new Set(p.pedidos.filter((x) => x.status === 'aberto' || x.status === 'pronto').map((x) => x.id));
  for (const s of p.sacola) if (vivos.has(s.pedido_id)) sku(chaveSku(s.modelo_id, s.tamanho)).nasSacolas += s.quantidade;

  const resto = new Map<string, number>();
  const disponivel = (k: string) => (resto.has(k) ? resto.get(k)! : Math.max(0, p.prateleira.get(k) ?? 0));

  const saida: SituacaoPedido[] = [];
  for (const pedido of p.pedidos.filter((x) => x.status === 'aberto').sort(ordemPedidos)) {
    const itens: SituacaoItem[] = [];
    for (const item of (itensDe.get(pedido.id) ?? []).sort((a, b) => a.ordem - b.ordem || a.id - b.id)) {
      const sac = naSacola.get(item.id) ?? 0;
      const falta = Math.max(0, item.quantidade - sac);
      if (!item.modelo_id || !item.tamanho) {
        itens.push({ item, sacola: sac, pegar: 0, produzir: 0, escolher: falta, completo: falta === 0 });
        continue;
      }
      const k = chaveSku(item.modelo_id, item.tamanho);
      const pegar = Math.min(falta, disponivel(k));
      resto.set(k, disponivel(k) - pegar);
      const produzir = falta - pegar;
      const s = sku(k); s.reservado += pegar; s.produzir += produzir;
      itens.push({ item, sacola: sac, pegar, produzir, escolher: 0, completo: falta === 0 });
    }
    const soma = (f: (i: SituacaoItem) => number) => itens.reduce((t, i) => t + f(i), 0);
    saida.push({
      pedido, itens,
      total: soma((i) => i.item.quantidade), sacola: soma((i) => Math.min(i.sacola, i.item.quantidade)),
      pegar: soma((i) => i.pegar), produzir: soma((i) => i.produzir), escolher: soma((i) => i.escolher),
      completo: itens.length > 0 && itens.every((i) => i.completo),
    });
  }
  skus.forEach((s) => { s.livre = s.prateleira - s.reservado; });
  return { pedidos: saida, skus };
}

/** "Calcinha Fábia P" -> "Calcinha Fábia" (o tamanho aparece separado, em destaque). */
export function nomeSemTamanho(descricao: string, tamanho: string | null) {
  const d = descricao.trim();
  return tamanho && d.toUpperCase().endsWith(` ${tamanho}`) ? d.slice(0, -tamanho.length - 1).trim() : d;
}
