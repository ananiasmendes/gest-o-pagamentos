export type Operacao = 'Costura' | 'Corte';
export type Tipo = 'Calcinha' | 'Conjunto' | 'Body';

export const TIPOS: Tipo[] = ['Calcinha', 'Conjunto', 'Body'];
export const OPERACOES: Operacao[] = ['Costura', 'Corte'];
export const TAMANHOS = ['P', 'M', 'G', 'GG'] as const;

export interface Oficina { id: string; nome: string; ativa: boolean; faz_costura: boolean; faz_corte: boolean }
export interface Modelo { id: string; nome: string; tipo: Tipo; codigo: string | null; ativo: boolean }
export interface Preco {
  id: string; oficina_id: string; operacao: Operacao;
  modelo_id: string | null; tipo: Tipo | null; valor: number; vigente_desde: string;
}
export interface Entrada {
  id: string; data: string; oficina_id: string; operacao: Operacao; tipo: Tipo;
  modelo_id: string | null; tamanho: string | null; quantidade: number;
  valor_unitario: number; valor_total: number; observacao: string | null;
  corte_id?: string | null;
}
export interface Pagamento { id: string; data: string; oficina_id: string; valor: number; observacao: string | null }

export type NovaEntrada = Omit<Entrada, 'id' | 'valor_total' | 'corte_id'>;
export type NovoPagamento = Omit<Pagamento, 'id'>;

// ---------------- Cortes ------------------------------------------------

export type StatusCorte = 'planejado' | 'cortado' | 'enviado' | 'concluido';
export const STATUS_CORTE: { valor: StatusCorte; rotulo: string }[] = [
  { valor: 'planejado', rotulo: 'Planejado' },
  { valor: 'cortado', rotulo: 'Cortado' },
  { valor: 'enviado', rotulo: 'Enviado às oficinas' },
  { valor: 'concluido', rotulo: 'Concluído' },
];

export interface Cor { id: string; nome: string; ativa: boolean }
export interface Insumo {
  id: string; nome: string; unidade_consumo: string; unidade_compra: string;
  fator: number; multiplo: number | null; por_cor: boolean; no_pedido: boolean; ativo: boolean;
}
export interface FichaItem { modelo_id: string; insumo_id: string; consumo: number }

export type Grade = Record<string, number>;

export interface Corte {
  id: string; numero: number; nome: string; data: string; status: StatusCorte;
  cortador_id: string | null; data_cortado: string | null; data_enviado: string | null;
  tecido: string | null; comprimento_m: number | null; largura_m: number | null;
  gramatura_kg_m2: number | null; aproveitamento: number | null; tecido_insumo_id: string | null;
  observacao: string | null;
}
export interface CorteModelo { id: string; corte_id: string; modelo_id: string; oficina_id: string | null; grade: Grade; ordem: number }
export interface CorteCor { id: string; corte_id: string; cor_id: string; folhas: number; ordem: number }
export interface CorteItem { corte_id: string; chave: string; incluido: boolean | null; feito: boolean }
