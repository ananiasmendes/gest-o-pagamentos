import { addDias, diffDias, fimMes, fromISO, inicioMes, mesCurto, mesKey } from './format';
import type { Entrada, Modelo, Oficina, Pagamento } from './types';

export interface Filtro { de: string; ate: string; oficinaId: string | null }

const noPeriodo = (d: string, f: Filtro) => d >= f.de && d <= f.ate;
const daOficina = (id: string, f: Filtro) => !f.oficinaId || f.oficinaId === id;

export const filtrarEntradas = (es: Entrada[], f: Filtro) => es.filter((e) => noPeriodo(e.data, f) && daOficina(e.oficina_id, f));
export const filtrarPagamentos = (ps: Pagamento[], f: Filtro) => ps.filter((p) => noPeriodo(p.data, f) && daOficina(p.oficina_id, f));

export interface Resumo {
  pecasCostura: number; valorCostura: number; pecasCorte: number; valorCorte: number;
  valorTotal: number; pago: number; custoMedioCostura: number; entregas: number; pecasPorEntrega: number;
}

export function resumo(es: Entrada[], ps: Pagamento[]): Resumo {
  let pecasCostura = 0, valorCostura = 0, pecasCorte = 0, valorCorte = 0;
  const entregas = new Set<string>();
  for (const e of es) {
    if (e.operacao === 'Costura') { pecasCostura += e.quantidade; valorCostura += e.valor_total; entregas.add(e.data + e.oficina_id); }
    else { pecasCorte += e.quantidade; valorCorte += e.valor_total; }
  }
  const pago = ps.reduce((s, p) => s + p.valor, 0);
  return {
    pecasCostura, valorCostura, pecasCorte, valorCorte, valorTotal: valorCostura + valorCorte, pago,
    custoMedioCostura: pecasCostura ? valorCostura / pecasCostura : 0,
    entregas: entregas.size, pecasPorEntrega: entregas.size ? pecasCostura / entregas.size : 0,
  };
}

/** Período imediatamente anterior, com o mesmo número de dias (ou o mês anterior inteiro). */
export function periodoAnterior(f: Filtro): Filtro {
  const ehMesInteiro = f.de === inicioMes(f.de) && f.ate === fimMes(f.de);
  if (ehMesInteiro) {
    const d = fromISO(f.de); d.setMonth(d.getMonth() - 1);
    const de = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    return { ...f, de, ate: fimMes(de) };
  }
  const dias = diffDias(f.de, f.ate) + 1;
  return { ...f, de: addDias(f.de, -dias), ate: addDias(f.de, -1) };
}

export const variacao = (atual: number, anterior: number) => (anterior ? (atual - anterior) / anterior : null);

// ---------------- Saldo e prazo de pagamento --------------------------

export interface SaldoOficina {
  oficina: Oficina; produzido: number; pago: number; saldo: number;
  ultimaEntrega: string | null; ultimoPagamento: string | null;
  diasSemPagamento: number | null; prazoMedio: number | null; emAbertoDesde: string | null;
}

/**
 * Casa pagamentos com a produção mais antiga ainda não paga (FIFO).
 * Prazo médio = média, ponderada pelo valor, de dias entre a entrega e o pagamento que a cobriu.
 */
function fifo(es: Entrada[], ps: Pagamento[]) {
  const porDia = new Map<string, number>();
  for (const e of es) porDia.set(e.data, (porDia.get(e.data) ?? 0) + e.valor_total);
  const fila = Array.from(porDia, ([data, valor]) => ({ data, restante: valor })).sort((a, b) => a.data.localeCompare(b.data));
  let somaPonderada = 0, somaValor = 0, credito = 0, i = 0;
  const pags = [...ps].sort((a, b) => a.data.localeCompare(b.data));
  for (const p of pags) {
    if (p.valor < 0) { fila.push({ data: p.data, restante: -p.valor }); fila.sort((a, b) => a.data.localeCompare(b.data)); continue; }
    let v = p.valor;
    while (v > 0.005 && i < fila.length) {
      const item = fila[i];
      if (item.data > p.data) break; // não pagamos produção futura: vira crédito
      const usado = Math.min(v, item.restante);
      somaPonderada += usado * diffDias(item.data, p.data); somaValor += usado;
      item.restante -= usado; v -= usado;
      if (item.restante <= 0.005) i++;
    }
    credito += v;
  }
  // crédito antecipado abate a produção seguinte
  while (credito > 0.005 && i < fila.length) {
    const usado = Math.min(credito, fila[i].restante);
    fila[i].restante -= usado; credito -= usado; somaValor += usado;
    if (fila[i].restante <= 0.005) i++;
  }
  const aberto = fila.find((f) => f.restante > 0.005);
  return { prazoMedio: somaValor ? somaPonderada / somaValor : null, emAbertoDesde: aberto?.data ?? null };
}

export function saldos(oficinas: Oficina[], es: Entrada[], ps: Pagamento[], hojeIso: string): SaldoOficina[] {
  return oficinas.map((o) => {
    const eo = es.filter((e) => e.oficina_id === o.id);
    const po = ps.filter((p) => p.oficina_id === o.id);
    const produzido = eo.reduce((s, e) => s + e.valor_total, 0);
    const pago = po.reduce((s, p) => s + p.valor, 0);
    const ultimaEntrega = eo.reduce<string | null>((m, e) => (!m || e.data > m ? e.data : m), null);
    const ultimoPagamento = po.reduce<string | null>((m, p) => (!m || p.data > m ? p.data : m), null);
    const { prazoMedio, emAbertoDesde } = fifo(eo, po);
    return {
      oficina: o, produzido, pago, saldo: produzido - pago, ultimaEntrega, ultimoPagamento,
      diasSemPagamento: ultimoPagamento ? diffDias(ultimoPagamento, hojeIso) : null,
      prazoMedio, emAbertoDesde: produzido - pago > 0.005 ? emAbertoDesde : null,
    };
  });
}

// ---------------- Séries e rankings -----------------------------------

export function serieMensal(es: Entrada[], oficinas: Oficina[], ate: string, meses = 12, campo: 'pecas' | 'valor' = 'pecas') {
  const chaves: string[] = [];
  const d = fromISO(inicioMes(ate));
  for (let k = meses - 1; k >= 0; k--) {
    const x = new Date(d.getFullYear(), d.getMonth() - k, 1);
    chaves.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  const linhas = chaves.map((k) => {
    const l: Record<string, number | string> = { mes: mesCurto(k), chave: k };
    for (const o of oficinas) l[o.nome] = 0;
    return l;
  });
  const idx = new Map(chaves.map((k, i) => [k, i]));
  const nome = new Map(oficinas.map((o) => [o.id, o.nome]));
  for (const e of es) {
    if (e.operacao !== 'Costura') continue;
    const i = idx.get(mesKey(e.data));
    const n = nome.get(e.oficina_id);
    if (i === undefined || !n) continue;
    linhas[i][n] = (linhas[i][n] as number) + (campo === 'pecas' ? e.quantidade : e.valor_total);
  }
  // corta meses vazios do começo
  const primeiro = linhas.findIndex((l) => oficinas.some((o) => (l[o.nome] as number) > 0));
  return primeiro > 0 ? linhas.slice(primeiro) : linhas;
}

export function rankingModelos(es: Entrada[], modelos: Modelo[], top = 10) {
  const nome = new Map(modelos.map((m) => [m.id, m.nome]));
  const acc = new Map<string, { nome: string; pecas: number; valor: number }>();
  for (const e of es) {
    if (e.operacao !== 'Costura' || !e.modelo_id) continue;
    const a = acc.get(e.modelo_id) ?? { nome: nome.get(e.modelo_id) ?? '—', pecas: 0, valor: 0 };
    a.pecas += e.quantidade; a.valor += e.valor_total; acc.set(e.modelo_id, a);
  }
  return Array.from(acc.values()).sort((a, b) => b.pecas - a.pecas).slice(0, top);
}

export function porTamanho(es: Entrada[]) {
  const ordem = ['P', 'M', 'G', 'GG'];
  const acc = new Map<string, number>();
  for (const e of es) if (e.operacao === 'Costura' && e.tamanho) acc.set(e.tamanho, (acc.get(e.tamanho) ?? 0) + e.quantidade);
  const total = Array.from(acc.values()).reduce((s, v) => s + v, 0);
  const pos = (t: string) => (ordem.includes(t) ? ordem.indexOf(t) : 99);
  return Array.from(acc, ([tamanho, pecas]) => ({ tamanho, pecas, parte: total ? pecas / total : 0 }))
    .sort((a, b) => pos(a.tamanho) - pos(b.tamanho));
}

export function porOficina(es: Entrada[], oficinas: Oficina[]) {
  const total = es.filter((e) => e.operacao === 'Costura').reduce((s, e) => s + e.quantidade, 0);
  return oficinas.map((o) => {
    const r = resumo(es.filter((e) => e.oficina_id === o.id), []);
    return { oficina: o, ...r, parte: total ? r.pecasCostura / total : 0 };
  }).filter((x) => x.pecasCostura > 0 || x.pecasCorte > 0);
}

export function porTipo(es: Entrada[]) {
  const acc = new Map<string, { pecas: number; valor: number }>();
  for (const e of es) {
    if (e.operacao !== 'Costura') continue;
    const a = acc.get(e.tipo) ?? { pecas: 0, valor: 0 };
    a.pecas += e.quantidade; a.valor += e.valor_total; acc.set(e.tipo, a);
  }
  return Array.from(acc, ([tipo, v]) => ({ tipo, ...v, medio: v.pecas ? v.valor / v.pecas : 0 }));
}

/** Projeção linear do mês corrente: o que foi produzido até hoje, no ritmo atual, até o fim do mês. */
export function projecaoMes(es: Entrada[], hojeIso: string, oficinaId: string | null) {
  const de = inicioMes(hojeIso), fim = fimMes(hojeIso);
  const r = resumo(filtrarEntradas(es, { de, ate: hojeIso, oficinaId }), []);
  const decorridos = diffDias(de, hojeIso) + 1, total = diffDias(de, fim) + 1;
  return { ate: r.valorTotal, projetado: decorridos ? (r.valorTotal / decorridos) * total : 0, decorridos, total };
}
