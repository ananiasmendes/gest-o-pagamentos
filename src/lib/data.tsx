'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import type { Entrada, Modelo, Oficina, Pagamento, Preco } from './types';

type Tabela = 'oficinas' | 'modelos' | 'precos' | 'entradas' | 'pagamentos';

interface Dados {
  oficinas: Oficina[]; modelos: Modelo[]; precos: Preco[]; entradas: Entrada[]; pagamentos: Pagamento[];
}

interface Ctx extends Dados {
  carregando: boolean;
  erro: string | null;
  recarregar: (tabelas?: Tabela[]) => Promise<void>;
  oficina: (id: string) => Oficina | undefined;
  modelo: (id: string | null) => Modelo | undefined;
  nomeOficina: (id: string) => string;
  nomeModelo: (e: { modelo_id: string | null; operacao: string; tipo: string }) => string;
}

const DataCtx = createContext<Ctx | null>(null);

const ORDEM: Record<Tabela, string> = {
  oficinas: 'nome', modelos: 'nome', precos: 'vigente_desde', entradas: 'data', pagamentos: 'data',
};

/** O Supabase devolve no máximo 1000 linhas por vez; aqui buscamos tudo em páginas. */
async function buscarTudo<T>(tabela: Tabela): Promise<T[]> {
  const passo = 1000;
  const out: T[] = [];
  for (let de = 0; ; de += passo) {
    const { data, error } = await supabase.from(tabela).select('*')
      .order(ORDEM[tabela], { ascending: true }).order('id', { ascending: true })
      .range(de, de + passo - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < passo) break;
  }
  return out;
}

const numeros = <T extends object>(rows: T[], campos: (keyof T)[]) =>
  rows.map((r) => { const c = { ...r }; for (const k of campos) (c as Record<string, unknown>)[k as string] = Number(c[k] ?? 0); return c; });

export function DataProvider({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<Dados>({ oficinas: [], modelos: [], precos: [], entradas: [], pagamentos: [] });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async (tabelas?: Tabela[]) => {
    const alvo: Tabela[] = tabelas ?? ['oficinas', 'modelos', 'precos', 'entradas', 'pagamentos'];
    try {
      const res = await Promise.all(alvo.map((t) => buscarTudo<Record<string, unknown>>(t)));
      setDados((d) => {
        const n = { ...d } as Dados;
        alvo.forEach((t, i) => {
          const rows = res[i];
          if (t === 'precos') n.precos = numeros(rows as unknown as Preco[], ['valor']);
          else if (t === 'entradas') n.entradas = numeros(rows as unknown as Entrada[], ['quantidade', 'valor_unitario', 'valor_total']);
          else if (t === 'pagamentos') n.pagamentos = numeros(rows as unknown as Pagamento[], ['valor']);
          else if (t === 'oficinas') n.oficinas = rows as unknown as Oficina[];
          else n.modelos = rows as unknown as Modelo[];
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
      ...dados, carregando, erro, recarregar,
      oficina: (id) => ofi.get(id),
      modelo: (id) => (id ? mod.get(id) : undefined),
      nomeOficina: (id) => ofi.get(id)?.nome ?? '—',
      nomeModelo: (e) => (e.operacao === 'Corte' ? `Corte de ${e.tipo.toLowerCase()}` : mod.get(e.modelo_id ?? '')?.nome ?? '—'),
    };
  }, [dados, carregando, erro, recarregar]);

  return <DataCtx.Provider value={valor}>{children}</DataCtx.Provider>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useData fora do DataProvider');
  return c;
}

/** Cor fixa por oficina (pela ordem alfabética), usada nos gráficos e etiquetas. */
export const CORES_OFICINA = ['#3D348B', '#B8235A', '#1F7A6A', '#A8671A', '#6D597A', '#2E6FA7'];
export function corOficina(oficinas: Oficina[], id: string) {
  const i = oficinas.findIndex((o) => o.id === id);
  return CORES_OFICINA[(i < 0 ? 0 : i) % CORES_OFICINA.length];
}
