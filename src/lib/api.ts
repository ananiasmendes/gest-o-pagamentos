'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Chama uma rota do próprio sistema (src/app/api) já com o login do usuário. */
export async function api<T = unknown>(caminho: string, opcoes?: { method?: string; body?: unknown }): Promise<T> {
  const { data } = await supabase.auth.getSession();
  let r: Response;
  try {
    r = await fetch(caminho, {
      method: opcoes?.method ?? (opcoes?.body !== undefined ? 'POST' : 'GET'),
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
      body: opcoes?.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.');
  }
  const j = (await r.json().catch(() => null)) as (T & { erro?: string; codigo?: string }) | null;
  if (!r.ok) throw Object.assign(new Error(j?.erro ?? `O servidor respondeu com erro ${r.status}.`), { codigo: j?.codigo });
  return j as T;
}

export interface SituacaoBling { id: number; nome: string; idHerdado?: number | null }
export interface StatusBling {
  /** variáveis de ambiente que faltam na Vercel */
  faltando: string[];
  conectado: boolean; conectado_em?: string | null;
  situacoes: SituacaoBling[]; situacoes_abertas: number[]; situacao_separado: number | null;
  ultima_sync: string | null; ultimo_erro: string | null;
}

/** Estado da conexão com o Bling. `status` fica nulo enquanto carrega. */
export function useStatusBling() {
  const [status, setStatus] = useState<StatusBling | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = useCallback(async () => {
    try { setStatus(await api<StatusBling>('/api/bling/status')); setErro(null); }
    catch (e) { setErro((e as Error).message); }
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);
  return { status, erro, recarregar };
}

/** Roda a sincronização com o Bling até não sobrar pedido na fila. Devolve quantos pedidos foram atualizados. */
export async function sincronizarBling(): Promise<number> {
  let total = 0;
  for (let volta = 0; volta < 15; volta++) {
    const r = await api<{ atualizados: number; restantes: number }>('/api/bling/sincronizar', { method: 'POST' });
    total += r.atualizados;
    if (!r.restantes) break;
  }
  return total;
}
