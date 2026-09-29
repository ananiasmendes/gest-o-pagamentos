'use client';

import { useMemo } from 'react';
import { useData } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { calcularPecas, type Pecas } from '@/lib/cortes/calc';
import { dataBR } from '@/lib/format';
import type { Corte, CorteModelo, Modelo, StatusCorte, Tipo } from '@/lib/types';
import { cx } from '@/components/ui';

export const ROTULO_STATUS: Record<StatusCorte, string> = {
  planejado: 'Planejado', cortado: 'Cortado', enviado: 'Nas oficinas', concluido: 'Concluído',
};
const COR_STATUS: Record<StatusCorte, string> = {
  planejado: 'bg-ambar-claro text-ambar', cortado: 'bg-indigo-claro text-indigo',
  enviado: 'bg-framboesa-claro text-framboesa-escuro', concluido: 'bg-agua-claro text-agua',
};

export function ChipStatus({ status, className }: { status: StatusCorte; className?: string }) {
  return <span className={cx('inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold', COR_STATUS[status], className)}>{ROTULO_STATUS[status]}</span>;
}

export function AvisoMigracao() {
  return (
    <div className="rounded-xl border border-ambar/40 bg-ambar-claro px-5 py-4 text-[15px]">
      <p className="font-display text-lg font-bold">Falta criar as tabelas de cortes no banco</p>
      <p className="mt-1">
        No Supabase, abra o SQL Editor e rode, nesta ordem, os arquivos <strong>supabase/cortes.sql</strong> e{' '}
        <strong>supabase/cortes_seed.sql</strong> do projeto. Depois recarregue esta página.
      </p>
    </div>
  );
}

export const numeroCorte = (n: number) => String(n).padStart(3, '0');
export const nomePadrao = (numero: number, data: string) => `Corte ${numeroCorte(numero)} · ${dataBR(data).slice(0, 6)}${data.slice(2, 4)}`;

export interface CorteDetalhe { corte: Corte; cms: CorteModelo[]; ccs: ReturnType<typeof useData>['corteCores']; pecas: Pecas }

/** Junta tudo de um corte e calcula as peças. */
export function useCorte(id: string | null): CorteDetalhe | null {
  const { cortes, corteModelos, corteCores } = useData();
  return useMemo(() => {
    const corte = cortes.find((c) => c.id === id);
    if (!corte) return null;
    const cms = corteModelos.filter((m) => m.corte_id === corte.id).sort((a, b) => a.ordem - b.ordem);
    const ccs = corteCores.filter((c) => c.corte_id === corte.id).sort((a, b) => a.ordem - b.ordem);
    return { corte, cms, ccs, pecas: calcularPecas(cms, ccs) };
  }, [cortes, corteModelos, corteCores, id]);
}

/** Peças do corte agrupadas pelo tipo do modelo (o corte é pago por calcinha/conjunto/body). */
export function pecasPorTipo(cms: CorteModelo[], pecas: Pecas, modelos: Modelo[]) {
  const out = new Map<Tipo, number>();
  for (const m of cms) {
    const tipo = modelos.find((x) => x.id === m.modelo_id)?.tipo ?? 'Calcinha';
    out.set(tipo, (out.get(tipo) ?? 0) + (pecas.porModelo.get(m.modelo_id)?.total ?? 0));
  }
  return out;
}

/**
 * Mantém o pagamento do corte em dia: se o corte já foi cortado e o cortador é um parceiro (não a fábrica),
 * lança as peças cortadas para ele em Entradas (o preço vem da tabela de corte). Se não, apaga o que havia.
 * Primeiro grava o novo e só depois apaga o antigo, para não perder nada se faltar preço.
 */
export async function sincronizarPagamentoCorte(corte: Corte, cms: CorteModelo[], pecas: Pecas, modelos: Modelo[]) {
  const deveTer = corte.status !== 'planejado' && !!corte.cortador_id;
  let novos: string[] = [];
  if (deveTer) {
    const linhas = Array.from(pecasPorTipo(cms, pecas, modelos)).filter(([, q]) => q > 0).map(([tipo, quantidade]) => ({
      data: corte.data_cortado ?? corte.data, oficina_id: corte.cortador_id, operacao: 'Corte', tipo, modelo_id: null,
      tamanho: null, quantidade, valor_unitario: null, observacao: corte.nome, corte_id: corte.id,
    }));
    if (linhas.length) {
      const { data, error } = await supabase.from('entradas').insert(linhas).select('id');
      if (error) throw error;
      novos = (data ?? []).map((r: { id: string }) => r.id);
    }
  }
  let q = supabase.from('entradas').delete().eq('corte_id', corte.id);
  if (novos.length) q = q.not('id', 'in', `(${novos.join(',')})`);
  const { error } = await q;
  if (error) throw error;
}
