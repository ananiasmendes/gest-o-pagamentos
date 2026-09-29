'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useData, corOficina } from '@/lib/data';
import { calcularPecas, calcularRetornos, kgPorFolhaDoRisco } from '@/lib/cortes/calc';
import { dataBR, dec, hoje, inicioMes, num, pct } from '@/lib/format';
import type { StatusCorte } from '@/lib/types';
import { Cabecalho, Carregando, Painel, Pilulas, Vazio, classeBotao } from '@/components/ui';
import { AvisoMigracao, ChipStatus } from '@/components/cortes/comum';

type Filtro = 'andamento' | 'planejado' | 'concluido' | 'todos';

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="min-w-0 py-2 md:px-5 md:py-1">
      <div className="text-[13px] font-semibold text-linha">{rotulo}</div>
      <div className="num font-display text-[26px] font-bold leading-tight">{valor}</div>
      {detalhe && <div className="text-xs text-linha">{detalhe}</div>}
    </div>
  );
}

export default function CortesPage() {
  const { cortes, corteModelos, corteCores, entradas, oficinas, carregando, cortesProntos, nomeOficina } = useData();
  const [filtro, setFiltro] = useState<Filtro>('andamento');

  const calc = useMemo(() => {
    const porCorte = new Map(cortes.map((c) => {
      const cms = corteModelos.filter((m) => m.corte_id === c.id);
      const ccs = corteCores.filter((x) => x.corte_id === c.id);
      return [c.id, { cms, pecas: calcularPecas(cms, ccs) }];
    }));
    const ret = calcularRetornos(cortes, corteModelos, corteCores, entradas);
    const h = hoje(), mes = inicioMes(h);
    const doMes = cortes.filter((c) => c.status !== 'planejado' && (c.data_cortado ?? c.data) >= mes);
    const pecasMes = doMes.reduce((s, c) => s + (porCorte.get(c.id)?.pecas.total ?? 0), 0);
    let comOficinas = 0;
    for (const c of cortes) if (c.status === 'enviado' || c.status === 'cortado') { const r = ret.porCorte.get(c.id); if (r) comOficinas += r.esperado - r.recebido; }
    const comRisco = cortes.filter((c) => c.aproveitamento);
    const aprov = comRisco.length ? comRisco.reduce((s, c) => s + (c.aproveitamento ?? 0), 0) / comRisco.length : null;
    let kg = 0, pecasKg = 0;
    for (const c of cortes) {
      const k = kgPorFolhaDoRisco(c), p = porCorte.get(c.id)?.pecas;
      if (k && p?.total) { kg += k * p.totalFolhas; pecasKg += p.total; }
    }
    return { porCorte, ret, pecasMes, comOficinas, aprov, gramasPorPeca: pecasKg ? (kg / pecasKg) * 1000 : null };
  }, [cortes, corteModelos, corteCores, entradas]);

  if (carregando) return <Carregando />;
  if (!cortesProntos) return <><Cabecalho titulo="Cortes" /><AvisoMigracao /></>;

  const grupos: Record<Filtro, StatusCorte[]> = {
    andamento: ['cortado', 'enviado'], planejado: ['planejado'], concluido: ['concluido'],
    todos: ['planejado', 'cortado', 'enviado', 'concluido'],
  };
  const lista = cortes.filter((c) => grupos[filtro].includes(c.status)).sort((a, b) => b.data.localeCompare(a.data) || b.numero - a.numero);
  const contagem = (f: Filtro) => cortes.filter((c) => grupos[f].includes(c.status)).length;

  return (
    <>
      <Cabecalho titulo="Cortes" acoes={<Link href="/cortes/novo" className={classeBotao('destaque')}><Plus size={18} />Novo corte</Link>} />

      {cortes.length > 0 && (
        <Painel className="mb-5">
          <div className="grid grid-cols-2 divide-borda md:grid-cols-4 md:divide-x">
            <Numero rotulo="Cortado este mês" valor={num(calc.pecasMes)} detalhe="peças" />
            <Numero rotulo="Com as oficinas" valor={num(calc.comOficinas)} detalhe="peças cortadas que ainda não voltaram" />
            <Numero rotulo="Corte até o retorno" valor={calc.ret.prazoMedioDias === null ? '—' : `${Math.round(calc.ret.prazoMedioDias)} dias`} detalhe="média por peça" />
            <Numero rotulo="Aproveitamento médio" valor={calc.aprov === null ? '—' : `${dec(calc.aprov).replace(/,00$/, '')}%`}
              detalhe={calc.gramasPorPeca ? `${Math.round(calc.gramasPorPeca)} g de tecido por peça` : 'dos riscos'} />
          </div>
        </Painel>
      )}

      <div className="mb-4">
        <Pilulas rotulo="Filtro" valor={filtro} onChange={setFiltro} opcoes={[
          { valor: 'andamento', rotulo: `Em andamento (${contagem('andamento')})` },
          { valor: 'planejado', rotulo: `Planejados (${contagem('planejado')})` },
          { valor: 'concluido', rotulo: `Concluídos (${contagem('concluido')})` },
          { valor: 'todos', rotulo: 'Todos' },
        ]} />
      </div>

      {!cortes.length ? (
        <Vazio titulo="Nenhum corte ainda"><Link href="/cortes/novo" className="font-semibold text-framboesa underline">Crie o primeiro a partir do PDF do risco</Link>.</Vazio>
      ) : !lista.length ? (
        <Vazio titulo="Nenhum corte neste filtro" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {lista.map((c) => {
            const info = calc.porCorte.get(c.id)!;
            const r = calc.ret.porCorte.get(c.id);
            const progresso = r && r.esperado ? r.recebido / r.esperado : 0;
            return (
              <li key={c.id}>
                <Link href={`/cortes/${c.id}`} className="block rounded-xl border border-borda bg-tecido p-4 transition-colors hover:border-linha/50">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-display text-lg font-bold">{c.nome}</div>
                      <div className="text-[13px] text-linha">{dataBR(c.data)}, corte: {nomeOficina(c.cortador_id)}</div>
                    </div>
                    <ChipStatus status={c.status} />
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="num font-display text-2xl font-bold">{num(info.pecas.total)} <span className="font-sans text-sm font-medium text-linha">peças</span></span>
                    <span className="text-[13px] text-linha">{info.cms.length} modelos, {num(info.pecas.totalFolhas)} folhas</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                    {Array.from(info.pecas.porOficina).map(([of, q]) => (
                      <span key={of ?? 'x'}>
                        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: corOficina(oficinas, of) }} />
                        {of ? nomeOficina(of) : 'Sem oficina'} <span className="num text-linha">{num(q)}</span>
                      </span>
                    ))}
                  </div>
                  {r && c.status !== 'planejado' && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[12px] text-linha">
                        <span>Retorno da costura</span><span className="num">{num(r.recebido)} de {num(r.esperado)} ({pct(progresso)})</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-papel">
                        <div className="h-full rounded-full bg-agua" style={{ width: `${Math.min(100, progresso * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
