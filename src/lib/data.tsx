'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import type {
  Cor, Corte, CorteCor, CorteItem, CorteModelo, CustoFixo, Entrada, EstoqueMov, FichaItem, Insumo, Modelo, Oficina, Pagamento, Parametro,
  Pedido, PedidoItem, Preco, SacolaItem, SkuBling, TabelaPreco,
} from './types';

export type Tabela =
  | 'oficinas' | 'modelos' | 'precos' | 'entradas' | 'pagamentos'
  | 'cores' | 'insumos' | 'ficha_tecnica' | 'cortes' | 'corte_modelos' | 'corte_cores' | 'corte_itens'
  | 'custos_fixos' | 'parametros' | 'tabelas_preco'
  | 'pedidos' | 'pedido_itens' | 'sacola' | 'estoque_mov' | 'sku_bling' | 'estoque_config';

const TABELAS_PAGAMENTO: Tabela[] = ['oficinas', 'modelos', 'precos', 'entradas', 'pagamentos'];
const TABELAS_CORTE: Tabela[] = ['cores', 'insumos', 'ficha_tecnica', 'cortes', 'corte_modelos', 'corte_cores', 'corte_itens'];
const TABELAS_PRECO: Tabela[] = ['custos_fixos', 'parametros', 'tabelas_preco'];
export const TABELAS_DA_PRECIFICACAO = TABELAS_PRECO;
const TABELAS_SEPARACAO: Tabela[] = ['pedidos', 'pedido_itens', 'sacola', 'estoque_mov', 'sku_bling', 'estoque_config'];
/** O que muda quando se separa um pedido ou chega peça: recarregue isto, não tudo. */
export const TABELAS_DA_SEPARACAO: Tabela[] = ['pedidos', 'pedido_itens', 'sacola', 'estoque_mov', 'entradas'];
export const TABELAS_DO_CORTE: Tabela[] = ['cortes', 'corte_modelos', 'corte_cores', 'corte_itens'];

interface Dados {
  oficinas: Oficina[]; modelos: Modelo[]; precos: Preco[]; entradas: Entrada[]; pagamentos: Pagamento[];
  cores: Cor[]; insumos: Insumo[]; ficha: FichaItem[];
  cortes: Corte[]; corteModelos: CorteModelo[]; corteCores: CorteCor[]; corteItens: CorteItem[];
  custosFixos: CustoFixo[]; parametros: Parametro[]; tabelasPreco: TabelaPreco[];
  pedidos: Pedido[]; pedidoItens: PedidoItem[]; sacola: SacolaItem[]; estoqueMov: EstoqueMov[]; skusBling: SkuBling[];
  /** a partir de quando as entradas somam no estoque */
  estoqueInicio: string | null;
}

interface Ctx extends Dados {
  carregando: boolean;
  erro: string | null;
  /** falso enquanto o cortes.sql ainda não foi rodado no Supabase */
  cortesProntos: boolean;
  /** falso enquanto o precificacao.sql ainda não foi rodado */
  precificacaoPronta: boolean;
  /** falso enquanto o separacao.sql ainda não foi rodado */
  separacaoPronta: boolean;
  parametro: (chave: string, padrao?: number) => number;
  recarregar: (tabelas?: Tabela[]) => Promise<void>;
  oficina: (id: string) => Oficina | undefined;
  modelo: (id: string | null) => Modelo | undefined;
  nomeOficina: (id: string | null) => string;
  nomeModelo: (e: { modelo_id: string | null; operacao: string; tipo: string }) => string;
}

const DataCtx = createContext<Ctx | null>(null);

const ORDEM: Record<Tabela, string[]> = {
  oficinas: ['nome', 'id'], modelos: ['nome', 'id'], precos: ['vigente_desde', 'id'], entradas: ['data', 'id'], pagamentos: ['data', 'id'],
  cores: ['nome', 'id'], insumos: ['nome', 'id'], ficha_tecnica: ['modelo_id', 'insumo_id'],
  cortes: ['numero'], corte_modelos: ['corte_id', 'ordem', 'id'], corte_cores: ['corte_id', 'ordem', 'id'], corte_itens: ['corte_id', 'chave'],
  custos_fixos: ['ordem', 'id'], parametros: ['chave'], tabelas_preco: ['ordem', 'nome'],
  pedidos: ['data', 'id'], pedido_itens: ['pedido_id', 'ordem', 'id'], sacola: ['pedido_id', 'id'],
  estoque_mov: ['criado_em', 'id'], sku_bling: ['sku'], estoque_config: ['id'],
};

/** O Supabase devolve no máximo 1000 linhas por vez; aqui buscamos tudo em páginas. */
async function buscarTudo<T>(tabela: Tabela): Promise<T[]> {
  const passo = 1000;
  const out: T[] = [];
  for (let de = 0; ; de += passo) {
    let q = supabase.from(tabela).select('*');
    for (const col of ORDEM[tabela]) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(de, de + passo - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < passo) break;
  }
  return out;
}

/** Tabela ainda não criada (o cortes.sql não foi rodado). */
const tabelaInexistente = (e: unknown) => {
  const err = e as { code?: string; message?: string };
  return err?.code === '42P01' || err?.code === 'PGRST205' || /does not exist|could not find the table/i.test(err?.message ?? '');
};

const numeros = <T extends object>(rows: T[], campos: (keyof T)[]) =>
  rows.map((r) => { const c = { ...r }; for (const k of campos) { const v = c[k]; (c as Record<string, unknown>)[k as string] = v === null || v === undefined ? v : Number(v); } return c; });

const VAZIO: Dados = {
  oficinas: [], modelos: [], precos: [], entradas: [], pagamentos: [],
  cores: [], insumos: [], ficha: [], cortes: [], corteModelos: [], corteCores: [], corteItens: [],
  custosFixos: [], parametros: [], tabelasPreco: [],
  pedidos: [], pedidoItens: [], sacola: [], estoqueMov: [], skusBling: [], estoqueInicio: null,
};

export function DataProvider({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<Dados>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [cortesProntos, setCortesProntos] = useState(true);
  const [precificacaoPronta, setPrecificacaoPronta] = useState(true);
  const [separacaoPronta, setSeparacaoPronta] = useState(true);

  const recarregar = useCallback(async (tabelas?: Tabela[]) => {
    const alvo: Tabela[] = tabelas ?? [...TABELAS_PAGAMENTO, ...TABELAS_CORTE, ...TABELAS_PRECO, ...TABELAS_SEPARACAO];
    try {
      const res = await Promise.all(alvo.map(async (t) => {
        try { return await buscarTudo<Record<string, unknown>>(t); }
        catch (e) {
          if (TABELAS_CORTE.includes(t) && tabelaInexistente(e)) { setCortesProntos(false); return []; }
          if (TABELAS_PRECO.includes(t) && tabelaInexistente(e)) { setPrecificacaoPronta(false); return []; }
          if (TABELAS_SEPARACAO.includes(t) && tabelaInexistente(e)) { setSeparacaoPronta(false); return []; }
          throw e;
        }
      }));
      setDados((d) => {
        const n = { ...d };
        alvo.forEach((t, i) => {
          const rows = res[i] as unknown[];
          switch (t) {
            case 'precos': n.precos = numeros(rows as Preco[], ['valor']); break;
            case 'entradas': n.entradas = numeros(rows as Entrada[], ['quantidade', 'valor_unitario', 'valor_total']); break;
            case 'pagamentos': n.pagamentos = numeros(rows as Pagamento[], ['valor']).map((p) => ({ ...p, tipo: p.tipo ?? 'pagamento' })); break;
            case 'oficinas': n.oficinas = (rows as Oficina[]).map((o) => ({ ...o, faz_costura: o.faz_costura ?? true, faz_corte: o.faz_corte ?? false })); break;
            case 'modelos': n.modelos = numeros(rows as Modelo[], ['preco_venda']); break;
            case 'cores': n.cores = rows as Cor[]; break;
            case 'insumos': n.insumos = numeros(rows as Insumo[], ['fator', 'multiplo', 'preco', 'preco_qtd'])
              .map((i) => ({ ...i, categoria: i.categoria ?? 'M.P', preco_qtd: i.preco_qtd || 1 })); break;
            case 'ficha_tecnica': n.ficha = numeros(rows as FichaItem[], ['consumo']); break;
            case 'cortes': n.cortes = numeros(rows as Corte[], ['comprimento_m', 'largura_m', 'gramatura_kg_m2', 'aproveitamento']); break;
            case 'corte_modelos': n.corteModelos = rows as CorteModelo[]; break;
            case 'corte_cores': n.corteCores = rows as CorteCor[]; break;
            case 'corte_itens': n.corteItens = rows as CorteItem[]; break;
            case 'custos_fixos': n.custosFixos = numeros(rows as CustoFixo[], ['valor']); break;
            case 'parametros': n.parametros = numeros(rows as Parametro[], ['valor']); break;
            case 'tabelas_preco': n.tabelasPreco = numeros(rows as TabelaPreco[], ['lucro']); break;
            case 'pedidos': n.pedidos = numeros(rows as Pedido[], ['id', 'numero', 'situacao_id', 'situacao_anterior', 'total', 'total_produtos']); break;
            case 'pedido_itens': n.pedidoItens = numeros(rows as PedidoItem[], ['id', 'pedido_id', 'quantidade', 'ordem']); break;
            case 'sacola': n.sacola = numeros(rows as SacolaItem[], ['pedido_id', 'item_id', 'quantidade']); break;
            case 'estoque_mov': n.estoqueMov = numeros(rows as EstoqueMov[], ['quantidade']); break;
            case 'sku_bling': n.skusBling = rows as SkuBling[]; break;
            case 'estoque_config': n.estoqueInicio = (rows[0] as { inicio?: string } | undefined)?.inicio ?? null; break;
          }
        });
        return n;
      });
      setErro(null);
    } catch (e) {
      setErro((e as Error).message ?? String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  const valor = useMemo<Ctx>(() => {
    const ofi = new Map(dados.oficinas.map((o) => [o.id, o]));
    const mod = new Map(dados.modelos.map((m) => [m.id, m]));
    return {
      ...dados, carregando, erro, cortesProntos, precificacaoPronta, separacaoPronta, recarregar,
      parametro: (chave, padrao = 0) => dados.parametros.find((p) => p.chave === chave)?.valor ?? padrao,
      oficina: (id) => ofi.get(id),
      modelo: (id) => (id ? mod.get(id) : undefined),
      nomeOficina: (id) => (id ? ofi.get(id)?.nome ?? '—' : 'Fábrica'),
      nomeModelo: (e) => (e.operacao === 'Corte' ? `Corte de ${e.tipo.toLowerCase()}` : mod.get(e.modelo_id ?? '')?.nome ?? '—'),
    };
  }, [dados, carregando, erro, cortesProntos, precificacaoPronta, separacaoPronta, recarregar]);

  return <DataCtx.Provider value={valor}>{children}</DataCtx.Provider>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useData fora do DataProvider');
  return c;
}

/** Cor fixa por oficina (pela ordem alfabética), usada nos gráficos e etiquetas. */
// paleta da marca Pinho; a ordem segue a ordem alfabética das oficinas (Antônio, Fabiano, Marcelo...)
export const CORES_OFICINA = ['#C27219', '#5E6B3A', '#911C19', '#8C4A5E', '#3F5E6B', '#6B3F2A'];
export function corOficina(oficinas: Oficina[], id: string | null) {
  const i = oficinas.findIndex((o) => o.id === id);
  return i < 0 ? '#7A625C' : CORES_OFICINA[i % CORES_OFICINA.length];
}
