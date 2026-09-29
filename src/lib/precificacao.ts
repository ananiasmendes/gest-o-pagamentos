import { addDias, inicioMes, mesKey } from './format';
import { precoVigente } from './precos';
import type { CustoFixo, Entrada, FichaItem, Insumo, Modelo, Oficina, Preco, TabelaPreco } from './types';

export interface ParametrosPreco {
  custosFixos: number;
  vendaMedia: number;   // peças por mês
  imposto: number; comissao: number; frete: number;  // 0.047 = 4,7%
  tabelas: TabelaPreco[];
}

export const rateioPorPeca = (p: ParametrosPreco) => (p.vendaMedia > 0 ? p.custosFixos / p.vendaMedia : 0);

/** Soma dos percentuais que incidem sobre o preço de venda numa tabela (inclui o lucro). */
export const percentualTabela = (t: TabelaPreco, p: ParametrosPreco) =>
  (t.inclui_imposto ? p.imposto : 0) + (t.inclui_comissao ? p.comissao : 0) + (t.inclui_frete ? p.frete : 0) + t.lucro;

/** Custos variáveis sem o lucro (imposto + comissão + frete), usados para medir o lucro no preço atual. */
export const variaveisSemLucro = (p: ParametrosPreco) => p.imposto + p.comissao + p.frete;

export const precoUnitario = (i: Insumo) => (i.preco === null || i.preco === undefined ? null : i.preco / (i.preco_qtd || 1));

export interface ItemCusto { insumo: Insumo; consumo: number; unitario: number | null; valor: number }
export interface CustoModelo {
  modelo: Modelo;
  itens: ItemCusto[];
  materiaPrima: number;
  acabamento: number;
  corte: number;          // mão de obra da ficha (corte)
  costura: number;
  costuraOficina: string | null;
  total: number;
  pendencias: string[];
}

/** Maior preço de costura vigente hoje entre todas as oficinas. */
export function maiorCostura(modelo: Modelo, precos: Preco[], oficinas: Oficina[], data: string) {
  let melhor: { valor: number; oficina: string } | null = null;
  for (const o of oficinas) {
    const p = precoVigente(precos, { oficina_id: o.id, operacao: 'Costura', modelo_id: modelo.id, data });
    if (p && (!melhor || p.valor > melhor.valor)) melhor = { valor: p.valor, oficina: o.nome };
  }
  return melhor;
}

export function custoModelo(
  modelo: Modelo, ficha: FichaItem[], insumos: Insumo[], precos: Preco[], oficinas: Oficina[], data: string,
): CustoModelo {
  const itens: ItemCusto[] = [];
  const pendencias: string[] = [];
  let materiaPrima = 0, acabamento = 0, corte = 0;
  for (const f of ficha) {
    if (f.modelo_id !== modelo.id) continue;
    const insumo = insumos.find((i) => i.id === f.insumo_id);
    if (!insumo) continue;
    const unitario = precoUnitario(insumo);
    const valor = unitario === null ? 0 : unitario * f.consumo;
    if (unitario === null) pendencias.push(`sem preço: ${insumo.nome}`);
    itens.push({ insumo, consumo: f.consumo, unitario, valor });
    if (insumo.categoria === 'Acabamento') acabamento += valor;
    else if (insumo.categoria === 'M.O') corte += valor;
    else materiaPrima += valor;
  }
  if (!itens.length) pendencias.push('sem ficha técnica');
  const cost = modelo.sem_costura ? null : maiorCostura(modelo, precos, oficinas, data);
  if (!modelo.sem_costura && !cost) pendencias.push('sem preço de costura');
  const costura = cost?.valor ?? 0;
  itens.sort((a, b) => b.valor - a.valor);
  return {
    modelo, itens, materiaPrima, acabamento, corte, costura, costuraOficina: cost?.oficina ?? null,
    total: materiaPrima + acabamento + corte + costura, pendencias,
  };
}

/** Preço de venda para cobrir o custo, o rateio dos fixos e os percentuais da tabela. */
export function precoSugerido(custo: number, tabela: TabelaPreco, p: ParametrosPreco) {
  const pct = percentualTabela(tabela, p);
  return pct >= 1 ? null : (custo + rateioPorPeca(p)) / (1 - pct);
}

/** Lucro (em % do preço) que sobra vendendo pelo preço atual, depois de imposto, comissão, frete, custo e rateio. */
export function lucroNoPreco(preco: number | null | undefined, custo: number, p: ParametrosPreco) {
  if (!preco) return null;
  return 1 - variaveisSemLucro(p) - (custo + rateioPorPeca(p)) / preco;
}

/** Peças costuradas por modelo nos últimos N dias (para ponderar as margens). */
export function producaoRecente(entradas: Entrada[], hoje: string, dias = 90) {
  const de = addDias(hoje, -dias);
  const m = new Map<string, number>();
  for (const e of entradas) if (e.operacao === 'Costura' && e.modelo_id && e.data >= de) m.set(e.modelo_id, (m.get(e.modelo_id) ?? 0) + e.quantidade);
  return m;
}

/** Média de peças costuradas por mês nos últimos meses completos (sugestão para a venda média mensal). */
export function mediaMensalProduzida(entradas: Entrada[], hoje: string, meses = 6) {
  const ate = inicioMes(hoje); // exclui o mês corrente, incompleto
  const d = new Date(Number(ate.slice(0, 4)), Number(ate.slice(5, 7)) - 1 - meses, 1);
  const de = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const porMes = new Map<string, number>();
  for (const e of entradas) if (e.operacao === 'Costura' && e.data >= de && e.data < ate) porMes.set(mesKey(e.data), (porMes.get(mesKey(e.data)) ?? 0) + e.quantidade);
  return porMes.size ? Array.from(porMes.values()).reduce((s, v) => s + v, 0) / porMes.size : null;
}

export const somaCustosFixos = (cf: CustoFixo[]) => cf.reduce((s, c) => s + (c.valor || 0), 0);
