import type { Operacao, Preco, Tipo } from './types';

export interface AlvoPreco {
  oficina_id: string; operacao: Operacao; modelo_id?: string | null; tipo?: Tipo | null; data: string;
}

const casa = (p: Preco, a: AlvoPreco) =>
  p.oficina_id === a.oficina_id && p.operacao === a.operacao &&
  (a.operacao === 'Costura' ? p.modelo_id === a.modelo_id : p.tipo === a.tipo);

/** Preço vigente na data (o registro mais recente com vigente_desde <= data). */
export function precoVigente(precos: Preco[], a: AlvoPreco): Preco | null {
  let melhor: Preco | null = null;
  for (const p of precos) {
    if (!casa(p, a) || p.vigente_desde > a.data) continue;
    if (!melhor || p.vigente_desde > melhor.vigente_desde) melhor = p;
  }
  return melhor;
}

/** Histórico de um alvo, do mais recente para o mais antigo. */
export function historicoPreco(precos: Preco[], a: Omit<AlvoPreco, 'data'>): Preco[] {
  return precos.filter((p) => casa(p, { ...a, data: '9999-12-31' }))
    .sort((x, y) => y.vigente_desde.localeCompare(x.vigente_desde));
}
