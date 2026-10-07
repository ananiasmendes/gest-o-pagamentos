export type Operacao = 'Costura' | 'Corte';
export type Tipo = 'Calcinha' | 'Conjunto' | 'Body' | 'Pijama';

export const TIPOS: Tipo[] = ['Calcinha', 'Conjunto', 'Body', 'Pijama'];
export const OPERACOES: Operacao[] = ['Costura', 'Corte'];
export const TAMANHOS = ['P', 'M', 'G', 'GG'] as const;

export interface Oficina { id: string; nome: string; ativa: boolean; faz_costura: boolean; faz_corte: boolean }
export interface Modelo {
  id: string; nome: string; tipo: Tipo; codigo: string | null; ativo: boolean;
  preco_venda?: number | null; sem_costura?: boolean;
}
export interface Preco {
  id: string; oficina_id: string; operacao: Operacao;
  modelo_id: string | null; tipo: Tipo | null; valor: number; vigente_desde: string;
}
export interface Entrada {
  id: string; data: string; oficina_id: string; operacao: Operacao; tipo: Tipo;
  modelo_id: string | null; tamanho: string | null; quantidade: number;
  valor_unitario: number; valor_total: number; observacao: string | null;
  corte_id?: string | null;
  /** quando o lançamento foi gravado (define o que entra no estoque) */
  created_at?: string;
}
export type TipoPagamento = 'pagamento' | 'ajuste';
export interface Pagamento { id: string; data: string; oficina_id: string; valor: number; observacao: string | null; tipo?: TipoPagamento }

export type NovaEntrada = Omit<Entrada, 'id' | 'valor_total' | 'corte_id' | 'created_at'>;
export type NovoPagamento = Omit<Pagamento, 'id'>;

// ---------------- Cortes ------------------------------------------------

export type StatusCorte = 'planejado' | 'cortado' | 'enviado' | 'concluido';
export const STATUS_CORTE: { valor: StatusCorte; rotulo: string }[] = [
  { valor: 'planejado', rotulo: 'Planejado' },
  { valor: 'cortado', rotulo: 'Cortado' },
  { valor: 'enviado', rotulo: 'Enviado às oficinas' },
  { valor: 'concluido', rotulo: 'Concluído' },
];

export type CategoriaInsumo = 'M.P' | 'Acabamento' | 'M.O';
export const CATEGORIAS_INSUMO: { valor: CategoriaInsumo; rotulo: string }[] = [
  { valor: 'M.P', rotulo: 'Matéria-prima' }, { valor: 'Acabamento', rotulo: 'Acabamento' }, { valor: 'M.O', rotulo: 'Mão de obra' },
];

export interface Cor { id: string; nome: string; ativa: boolean }
export interface Insumo {
  id: string; nome: string; unidade_consumo: string; unidade_compra: string;
  fator: number; multiplo: number | null; por_cor: boolean; no_pedido: boolean; ativo: boolean;
  preco?: number | null; preco_qtd?: number; preco_atualizado_em?: string | null; categoria?: CategoriaInsumo;
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

// ---------------- Precificação -------------------------------------------

export interface CustoFixo { id: string; nome: string; valor: number; ordem: number }
export interface Parametro { chave: string; valor: number }
export interface TabelaPreco {
  id: string; nome: string; lucro: number; inclui_imposto: boolean; inclui_comissao: boolean; inclui_frete: boolean; ordem: number;
}

// ---------------- Separação de pedidos e estoque ---------------------------

export type StatusPedido = 'aberto' | 'pronto' | 'enviado' | 'cancelado';
export interface Pedido {
  id: number; numero: number | null; cliente: string; data: string;
  situacao_id: number | null; situacao_anterior: number | null; status: StatusPedido;
  total: number | null; total_produtos: number | null; observacoes: string | null;
  pronto_em: string | null; bling_marcado: boolean; baixa_direta: boolean; sincronizado_em: string;
}
export interface PedidoItem {
  id: number; pedido_id: number; sku: string | null; descricao: string; quantidade: number;
  /** nulo = item manual ("Diversos" ou código que o sistema não conhece) */
  modelo_id: string | null; tamanho: string | null; ordem: number;
}
export interface SacolaItem { id: string; pedido_id: number; item_id: number; modelo_id: string; tamanho: string; quantidade: number }
export interface EstoqueMov { id: string; criado_em: string; modelo_id: string; tamanho: string; quantidade: number; motivo: 'contagem' | 'ajuste'; observacao: string | null }
export interface SkuBling { sku: string; modelo_id: string; tamanho: string }
