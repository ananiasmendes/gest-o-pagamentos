import { diffDias } from '../format';
import type { Corte, CorteCor, CorteModelo, Entrada, FichaItem, Grade, Insumo } from '../types';

/** Folhas de etiqueta: quantas etiquetas cabem em cada folha impressa. */
export const TAGS_POR_FOLHA = 3;
export const COMPOSICAO_POR_FOLHA = 5;

const ORDEM_TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EGG', 'U'];
export const ordenarTamanhos = (ts: Iterable<string>) =>
  Array.from(new Set(ts)).sort((a, b) => {
    const ia = ORDEM_TAMANHOS.indexOf(a), ib = ORDEM_TAMANHOS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

export const somaGrade = (g: Grade) => Object.values(g).reduce((s, v) => s + (Number(v) || 0), 0);

// ---------------- Peças ---------------------------------------------------

export interface Pecas {
  tamanhos: string[];
  totalFolhas: number;
  total: number;
  /** peças por modelo_id -> cor_id -> tamanho */
  mct: Map<string, Map<string, Record<string, number>>>;
  porModelo: Map<string, { total: number; porTam: Record<string, number>; porCor: Map<string, number> }>;
  porCor: Map<string, number>;
  porTam: Record<string, number>;
  porOficina: Map<string | null, number>;
}

export function calcularPecas(cms: CorteModelo[], ccs: CorteCor[]): Pecas {
  const tamanhos = ordenarTamanhos(cms.flatMap((m) => Object.keys(m.grade).filter((t) => (m.grade[t] || 0) > 0)));
  const totalFolhas = ccs.reduce((s, c) => s + (c.folhas || 0), 0);
  const mct: Pecas['mct'] = new Map();
  const porModelo: Pecas['porModelo'] = new Map();
  const porCor = new Map<string, number>();
  const porTam: Record<string, number> = {};
  const porOficina = new Map<string | null, number>();
  let total = 0;
  for (const m of cms) {
    const pm = { total: 0, porTam: {} as Record<string, number>, porCor: new Map<string, number>() };
    const mc = new Map<string, Record<string, number>>();
    for (const c of ccs) {
      const linha: Record<string, number> = {};
      let tc = 0;
      for (const t of tamanhos) {
        const q = (m.grade[t] || 0) * (c.folhas || 0);
        if (!q) continue;
        linha[t] = q; tc += q;
        pm.porTam[t] = (pm.porTam[t] ?? 0) + q;
        porTam[t] = (porTam[t] ?? 0) + q;
      }
      mc.set(c.cor_id, linha);
      pm.porCor.set(c.cor_id, tc);
      porCor.set(c.cor_id, (porCor.get(c.cor_id) ?? 0) + tc);
      pm.total += tc;
    }
    mct.set(m.modelo_id, mc);
    porModelo.set(m.modelo_id, pm);
    porOficina.set(m.oficina_id, (porOficina.get(m.oficina_id) ?? 0) + pm.total);
    total += pm.total;
  }
  return { tamanhos, totalFolhas, total, mct, porModelo, porCor, porTam, porOficina };
}

// ---------------- Materiais -----------------------------------------------

/** Converte consumo em unidade de compra, arredondando para cima no múltiplo da embalagem. */
export function quantidadeCompra(consumo: number, ins: Pick<Insumo, 'fator' | 'multiplo'>) {
  const emUnidades = consumo / (ins.fator || 1);
  if (!ins.multiplo) return emUnidades;
  return Math.ceil(emUnidades / ins.multiplo - 1e-9) * ins.multiplo;
}

export interface LinhaMaterial {
  insumo: Insumo;
  /** consumo (na unidade de consumo) por cor */
  consumoPorCor: Map<string, number>;
  consumoTotal: number;
  /** quantidade a comprar (unidade de compra): por cor, ou só '*' quando o insumo não é por cor */
  compra: Map<string, number>;
  compraTotal: number;
  /** tecido calculado pelo risco do Audaces em vez da ficha técnica */
  peloRisco: boolean;
}

export const kgPorFolhaDoRisco = (c: Pick<Corte, 'comprimento_m' | 'largura_m' | 'gramatura_kg_m2'>) =>
  c.comprimento_m && c.largura_m && c.gramatura_kg_m2 ? c.comprimento_m * c.largura_m * c.gramatura_kg_m2 : null;

export function calcularMateriais(
  corte: Corte, cms: CorteModelo[], ccs: CorteCor[], ficha: FichaItem[], insumos: Insumo[], pecas: Pecas,
  filtroOficina?: string | null,
): LinhaMaterial[] {
  const porInsumo = new Map<string, Map<string, number>>();
  const modelosAlvo = filtroOficina === undefined ? cms : cms.filter((m) => m.oficina_id === filtroOficina);
  const fichaPorModelo = new Map<string, FichaItem[]>();
  for (const f of ficha) (fichaPorModelo.get(f.modelo_id) ?? fichaPorModelo.set(f.modelo_id, []).get(f.modelo_id)!).push(f);

  const kgFolha = kgPorFolhaDoRisco(corte);
  const tecidoPeloRisco = kgFolha !== null && corte.tecido_insumo_id ? corte.tecido_insumo_id : null;

  for (const m of modelosAlvo) {
    const pm = pecas.porModelo.get(m.modelo_id);
    if (!pm) continue;
    for (const f of fichaPorModelo.get(m.modelo_id) ?? []) {
      if (f.insumo_id === tecidoPeloRisco) continue;
      const mapa = porInsumo.get(f.insumo_id) ?? porInsumo.set(f.insumo_id, new Map()).get(f.insumo_id)!;
      for (const c of ccs) mapa.set(c.cor_id, (mapa.get(c.cor_id) ?? 0) + f.consumo * (pm.porCor.get(c.cor_id) ?? 0));
    }
  }
  // tecido do risco: comprimento x largura x gramatura x folhas da cor (só no corte inteiro)
  if (tecidoPeloRisco && filtroOficina === undefined) {
    porInsumo.set(tecidoPeloRisco, new Map(ccs.map((c) => [c.cor_id, kgFolha! * (c.folhas || 0)])));
  }

  const linhas: LinhaMaterial[] = [];
  for (const [insumoId, consumoPorCor] of porInsumo) {
    const insumo = insumos.find((i) => i.id === insumoId);
    if (!insumo || insumo.categoria === 'M.O') continue; // mão de obra (ex.: corte) não se compra
    const consumoTotal = Array.from(consumoPorCor.values()).reduce((s, v) => s + v, 0);
    if (consumoTotal <= 0) continue;
    const compra = new Map<string, number>();
    if (insumo.por_cor) {
      for (const [cor, q] of consumoPorCor) if (q > 0) compra.set(cor, quantidadeCompra(q, insumo));
    } else compra.set('*', quantidadeCompra(consumoTotal, insumo));
    linhas.push({
      insumo, consumoPorCor, consumoTotal, compra,
      compraTotal: Array.from(compra.values()).reduce((s, v) => s + v, 0),
      peloRisco: insumoId === tecidoPeloRisco,
    });
  }
  return linhas.sort((a, b) => a.insumo.nome.localeCompare(b.insumo.nome, 'pt-BR'));
}

const fmt = (n: number, casas = 2) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
export const textoCompra = (q: number, ins: Insumo) => `${fmt(q, ins.multiplo ? 2 : 1)} ${ins.unidade_compra}`;
export const textoConsumo = (q: number, ins: Insumo) => `${fmt(q, ins.unidade_consumo === 'un' ? 0 : 2)} ${ins.unidade_consumo}`;

// ---------------- Etiquetas -----------------------------------------------

export interface LinhaTag { modelo_id: string; porTam: Record<string, { qtd: number; folhas: number }>; qtd: number; folhas: number }

export function calcularEtiquetas(cms: CorteModelo[], pecas: Pecas) {
  const tags: LinhaTag[] = cms.map((m) => {
    const porTam: LinhaTag['porTam'] = {};
    let qtd = 0, folhas = 0;
    for (const t of pecas.tamanhos) {
      const q = (m.grade[t] || 0) * pecas.totalFolhas;
      if (!q) continue;
      const f = Math.ceil(q / TAGS_POR_FOLHA);
      porTam[t] = { qtd: q, folhas: f }; qtd += q; folhas += f;
    }
    return { modelo_id: m.modelo_id, porTam, qtd, folhas };
  });
  const composicao = pecas.tamanhos.map((t) => {
    const qtd = pecas.porTam[t] ?? 0;
    return { tamanho: t, qtd, folhas: Math.ceil(qtd / COMPOSICAO_POR_FOLHA) };
  });
  const totais = {
    tags: tags.reduce((s, x) => s + x.qtd, 0),
    folhasTag: tags.reduce((s, x) => s + x.folhas, 0),
    composicao: composicao.reduce((s, x) => s + x.qtd, 0),
    folhasComposicao: composicao.reduce((s, x) => s + x.folhas, 0),
  };
  return { tags, composicao, totais };
}

// ---------------- Retorno das oficinas (FIFO) ------------------------------

export interface RetornoCorte {
  esperado: number;
  recebido: number;
  /** por modelo_id -> tamanho: [esperado, recebido] */
  detalhe: Map<string, Record<string, [number, number]>>;
  ultimaEntrada: string | null;
}

export const dataReferencia = (c: Corte) => c.data_enviado ?? c.data_cortado ?? c.data;

/**
 * As entradas de costura de cada oficina/modelo/tamanho abatem, na ordem, o corte mais antigo
 * que ainda tem peças em aberto (e que já tinha sido cortado na data da entrada).
 */
export function calcularRetornos(cortes: Corte[], cms: CorteModelo[], ccs: CorteCor[], entradas: Entrada[]) {
  const ativos = cortes.filter((c) => c.status !== 'planejado').sort((a, b) => dataReferencia(a).localeCompare(dataReferencia(b)) || a.numero - b.numero);
  const folhasPorCorte = new Map<string, number>();
  for (const c of ccs) folhasPorCorte.set(c.corte_id, (folhasPorCorte.get(c.corte_id) ?? 0) + (c.folhas || 0));

  const res = new Map<string, RetornoCorte>();
  type Pend = { corte: Corte; modelo_id: string; tam: string; resta: number };
  const filas = new Map<string, Pend[]>();
  for (const c of ativos) {
    const r: RetornoCorte = { esperado: 0, recebido: 0, detalhe: new Map(), ultimaEntrada: null };
    res.set(c.id, r);
    const folhas = folhasPorCorte.get(c.id) ?? 0;
    for (const m of cms.filter((x) => x.corte_id === c.id)) {
      const det: Record<string, [number, number]> = {};
      for (const [t, g] of Object.entries(m.grade)) {
        const q = (g || 0) * folhas;
        if (!q) continue;
        det[t] = [q, 0]; r.esperado += q;
        if (!m.oficina_id) continue;
        const k = `${m.oficina_id}|${m.modelo_id}|${t}`;
        (filas.get(k) ?? filas.set(k, []).get(k)!).push({ corte: c, modelo_id: m.modelo_id, tam: t, resta: q });
      }
      r.detalhe.set(m.modelo_id, det);
    }
  }

  let somaDias = 0, pecasComPrazo = 0;
  const costura = entradas.filter((e) => e.operacao === 'Costura' && e.modelo_id).sort((a, b) => a.data.localeCompare(b.data));
  for (const e of costura) {
    const fila = filas.get(`${e.oficina_id}|${e.modelo_id}|${(e.tamanho ?? '').toUpperCase()}`);
    if (!fila) continue;
    let q = e.quantidade;
    for (const p of fila) {
      if (q <= 0) break;
      if (p.resta <= 0 || dataReferencia(p.corte) > e.data) continue;
      const usado = Math.min(q, p.resta);
      p.resta -= usado; q -= usado;
      const r = res.get(p.corte.id)!;
      r.recebido += usado;
      r.detalhe.get(p.modelo_id)![p.tam][1] += usado;
      if (!r.ultimaEntrada || e.data > r.ultimaEntrada) r.ultimaEntrada = e.data;
      somaDias += usado * diffDias(dataReferencia(p.corte), e.data);
      pecasComPrazo += usado;
    }
  }
  return { porCorte: res, prazoMedioDias: pecasComPrazo ? somaDias / pecasComPrazo : null };
}
