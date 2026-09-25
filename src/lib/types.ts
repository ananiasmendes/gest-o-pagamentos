export type Operacao = 'Costura' | 'Corte';
export type Tipo = 'Calcinha' | 'Conjunto' | 'Body';

export const TIPOS: Tipo[] = ['Calcinha', 'Conjunto', 'Body'];
export const OPERACOES: Operacao[] = ['Costura', 'Corte'];
export const TAMANHOS = ['P', 'M', 'G', 'GG'] as const;

export interface Oficina { id: string; nome: string; ativa: boolean }
export interface Modelo { id: string; nome: string; tipo: Tipo; codigo: string | null; ativo: boolean }
export interface Preco {
  id: string; oficina_id: string; operacao: Operacao;
  modelo_id: string | null; tipo: Tipo | null; valor: number; vigente_desde: string;
}
export interface Entrada {
  id: string; data: string; oficina_id: string; operacao: Operacao; tipo: Tipo;
  modelo_id: string | null; tamanho: string | null; quantidade: number;
  valor_unitario: number; valor_total: number; observacao: string | null;
}
export interface Pagamento { id: string; data: string; oficina_id: string; valor: number; observacao: string | null }

export type NovaEntrada = Omit<Entrada, 'id' | 'valor_total'>;
export type NovoPagamento = Omit<Pagamento, 'id'>;
