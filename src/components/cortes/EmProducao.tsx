'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { useData, corOficina } from '@/lib/data';
import { ordenarTamanhos, pecasEmProducao } from '@/lib/cortes/calc';
import { baixarPlanilha } from '@/lib/exportar';
import { num, pct } from '@/lib/format';
import { TIPOS } from '@/lib/types';
import { Botao, Campo, Painel, Pilulas, Selecao, cx } from '@/components/ui';

type Visao = 'modelo' | 'oficina' | 'tamanho';
type Medida = 'falta' | 'cortado';

/**
 * Tudo o que está em produção agora: peças de cortes já cortados ou enviados que ainda não voltaram
 * das oficinas (o retorno é abatido pelas entradas de costura).
 */
export default function EmProducao() {
  const { cortes, corteModelos, corteCores, entradas, oficinas, modelos, nomeOficina } = useData();
  const [visao, setVisao] = useState<Visao>('modelo');
  const [medida, setMedida] = useState<Medida>('falta');
  const [oficinaFiltro, setOficinaFiltro] = useState('');
  const [tipo, setTipo] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);

  const linhas = useMemo(() => pecasEmProducao(cortes, corteModelos, corteCores, entradas), [cortes, corteModelos, corteCores, entradas]);
  const modelo = (id: string) => modelos.find((m) => m.id === id);
  const nomeMod = (id: string) => modelo(id)?.nome ?? '—';
  const nomeCorte = (id: string) => cortes.find((c) => c.id === id)?.nome ?? '';

  const filtradas = linhas.filter((l) => (!oficinaFiltro || (l.oficina_id ?? '') === oficinaFiltro) && (!tipo || modelo(l.modelo_id)?.tipo === tipo));
  const valor = (l: (typeof linhas)[number]) => (medida === 'falta' ? l.falta : l.cortado);
  const ativas = filtradas.filter((l) => valor(l) > 0);

  const tamanhos = ordenarTamanhos(ativas.map((l) => l.tam));
  const ofsPresentes = Array.from(new Set(ativas.map((l) => l.oficina_id)))
    .sort((a, b) => (a ? nomeOficina(a) : 'zz').localeCompare(b ? nomeOficina(b) : 'zz'));

  // agregações
  const porModelo = new Map<string, { total: number; cortado: number; recebido: number; porOf: Map<string | null, number>; porTam: Record<string, number>; cortes: Set<string> }>();
  for (const l of filtradas) {
    const a = porModelo.get(l.modelo_id) ?? { total: 0, cortado: 0, recebido: 0, porOf: new Map(), porTam: {}, cortes: new Set<string>() };
    a.cortado += l.cortado; a.recebido += l.recebido;
    const v = valor(l);
    if (v > 0) {
      a.total += v; a.porOf.set(l.oficina_id, (a.porOf.get(l.oficina_id) ?? 0) + v);
      a.porTam[l.tam] = (a.porTam[l.tam] ?? 0) + v; a.cortes.add(l.corte_id);
    }
    porModelo.set(l.modelo_id, a);
  }
  const modelosOrd = Array.from(porModelo).filter(([, a]) => a.total > 0).sort((a, b) => b[1].total - a[1].total);
  const total = modelosOrd.reduce((s, [, a]) => s + a.total, 0);
  const totalOf = (of: string | null) => ativas.filter((l) => l.oficina_id === of).reduce((s, l) => s + valor(l), 0);
  const totalTam = (t: string) => ativas.filter((l) => l.tam === t).reduce((s, l) => s + valor(l), 0);
  const maior = Math.max(1, ...modelosOrd.map(([, a]) => a.total));

  if (!linhas.length) return null;

  function exportar() {
    baixarPlanilha('em-producao.xlsx', [{
      nome: 'Em produção',
      linhas: ativas.map((l) => ({
        Corte: nomeCorte(l.corte_id), Modelo: nomeMod(l.modelo_id), Tipo: modelo(l.modelo_id)?.tipo ?? '',
        Oficina: l.oficina_id ? nomeOficina(l.oficina_id) : 'Sem oficina', Tamanho: l.tam,
        Cortado: l.cortado, Voltou: l.recebido, 'Falta voltar': l.falta,
      })),
    }]);
  }

  const rotuloMedida = medida === 'falta' ? 'peças com as oficinas' : 'peças cortadas';

  return (
    <Painel className="mb-5"
      titulo={<span>Em produção agora <span className="num ml-1 font-sans text-base font-semibold text-linha">{num(total)} {rotuloMedida}</span></span>}
      acao={<Botao variante="fantasma" className="h-9 px-3 text-sm" onClick={exportar} disabled={!ativas.length}><Download size={15} />Excel</Botao>}>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Pilulas rotulo="Ver por" valor={visao} onChange={setVisao} opcoes={[
          { valor: 'modelo', rotulo: 'Por modelo' }, { valor: 'oficina', rotulo: 'Por oficina' }, { valor: 'tamanho', rotulo: 'Por tamanho' },
        ]} />
        <Campo rotulo="Contar" className="w-48">
          <Selecao value={medida} onChange={(e) => setMedida(e.target.value as Medida)}>
            <option value="falta">Falta voltar</option>
            <option value="cortado">Total cortado</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Oficina" className="w-40">
          <Selecao value={oficinaFiltro} onChange={(e) => setOficinaFiltro(e.target.value)}>
            <option value="">Todas</option>
            {oficinas.filter((o) => linhas.some((l) => l.oficina_id === o.id)).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Tipo" className="w-36">
          <Selecao value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>{TIPOS.map((t) => <option key={t}>{t}</option>)}
          </Selecao>
        </Campo>
      </div>

      {/* resumo por oficina, sempre visível */}
      <div className="mb-4 flex flex-wrap gap-2">
        {ofsPresentes.map((of) => {
          const v = totalOf(of);
          return (
            <div key={of ?? 'x'} className="rounded-xl border border-borda px-3 py-2">
              <div className="text-[12px] font-semibold text-linha">
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: corOficina(oficinas, of) }} />
                {of ? nomeOficina(of) : 'Sem oficina'}
              </div>
              <div className="num font-display text-lg font-bold">{num(v)} <span className="font-sans text-xs font-medium text-linha">{pct(total ? v / total : 0)}</span></div>
            </div>
          );
        })}
      </div>

      {!ativas.length ? (
        <p className="text-[15px] text-linha">Nada em produção com esses filtros.</p>
      ) : visao === 'modelo' ? (
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead><tr className="text-left text-[12px] text-linha">
              <th className="pb-2 font-semibold">Modelo</th>
              {ofsPresentes.map((of) => <th key={of ?? 'x'} className="pb-2 text-right font-semibold">{of ? nomeOficina(of) : 'Sem oficina'}</th>)}
              <th className="pb-2 text-right font-semibold">Total</th>
              {medida === 'falta' && <th className="w-28 pb-2 pl-3 font-semibold">Já voltou</th>}
            </tr></thead>
            <tbody className="num">
              {modelosOrd.map(([id, a]) => (
                <Fragment key={id}>
                  <tr className="cursor-pointer border-t border-borda hover:bg-papel/60" onClick={() => setAberto(aberto === id ? null : id)}>
                    <td className="py-2 pr-2">
                      <span className="flex items-center gap-1.5 font-semibold">
                        {aberto === id ? <ChevronDown size={15} className="text-linha" /> : <ChevronRight size={15} className="text-linha" />}
                        {nomeMod(id)}
                      </span>
                      <span className="ml-5 block h-1.5 max-w-[160px] rounded-full bg-papel">
                        <span className="block h-full rounded-full bg-framboesa/70" style={{ width: `${(a.total / maior) * 100}%` }} />
                      </span>
                    </td>
                    {ofsPresentes.map((of) => <td key={of ?? 'x'} className="py-2 text-right">{a.porOf.get(of) ? num(a.porOf.get(of)!) : ''}</td>)}
                    <td className="py-2 text-right font-bold">{num(a.total)}</td>
                    {medida === 'falta' && (
                      <td className="py-2 pl-3">
                        <span className="block h-2 overflow-hidden rounded-full bg-papel" title={`${num(a.recebido)} de ${num(a.cortado)}`}>
                          <span className="block h-full rounded-full bg-agua" style={{ width: `${a.cortado ? (a.recebido / a.cortado) * 100 : 0}%` }} />
                        </span>
                        <span className="text-[11px] text-linha">{pct(a.cortado ? a.recebido / a.cortado : 0)}</span>
                      </td>
                    )}
                  </tr>
                  {aberto === id && (
                    <tr className="bg-papel/50">
                      <td colSpan={ofsPresentes.length + 3} className="px-5 py-2.5 text-[13px]">
                        <div className="flex flex-wrap gap-1.5">
                          {ordenarTamanhos(Object.keys(a.porTam)).map((t) => (
                            <span key={t} className="rounded-lg bg-tecido px-2 py-0.5"><strong>{t}</strong> {num(a.porTam[t])}</span>
                          ))}
                        </div>
                        <div className="mt-1.5 text-linha">
                          Cortes: {Array.from(a.cortes).map(nomeCorte).join(', ')}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr className="border-t-2 border-borda font-bold">
                <td className="py-2">Total</td>
                {ofsPresentes.map((of) => <td key={of ?? 'x'} className="py-2 text-right">{num(totalOf(of))}</td>)}
                <td className="py-2 text-right">{num(total)}</td>
                {medida === 'falta' && <td />}
              </tr>
            </tbody>
          </table>
        </div>
      ) : visao === 'oficina' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ofsPresentes.map((of) => {
            const doOf = new Map<string, number>();
            for (const l of ativas) if (l.oficina_id === of) doOf.set(l.modelo_id, (doOf.get(l.modelo_id) ?? 0) + valor(l));
            const lista = Array.from(doOf).sort((a, b) => b[1] - a[1]);
            return (
              <div key={of ?? 'x'} className="rounded-xl border border-borda p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="font-display text-[16px] font-bold">
                    <span className="mr-1.5 inline-block h-3 w-3 rounded-full align-middle" style={{ background: corOficina(oficinas, of) }} />
                    {of ? nomeOficina(of) : 'Sem oficina'}
                  </span>
                  <span className="num font-bold">{num(totalOf(of))}</span>
                </div>
                <ul className="num divide-y divide-borda text-[14px]">
                  {lista.map(([id, v]) => (
                    <li key={id} className="flex justify-between py-1.5"><span>{nomeMod(id)}</span><span className="font-semibold">{num(v)}</span></li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <table className="w-full min-w-[480px] text-[14px]">
            <thead><tr className="text-left text-[12px] text-linha">
              <th className="pb-2 font-semibold">Modelo</th>
              {tamanhos.map((t) => <th key={t} className="pb-2 text-right font-semibold">{t}</th>)}
              <th className="pb-2 text-right font-semibold">Total</th>
            </tr></thead>
            <tbody className="num">
              {modelosOrd.map(([id, a]) => (
                <tr key={id} className="border-t border-borda">
                  <td className="py-2 font-semibold">{nomeMod(id)}</td>
                  {tamanhos.map((t) => <td key={t} className={cx('py-2 text-right', !a.porTam[t] && 'text-linha')}>{a.porTam[t] ? num(a.porTam[t]) : '·'}</td>)}
                  <td className="py-2 text-right font-bold">{num(a.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-borda font-bold">
                <td className="py-2">Total</td>
                {tamanhos.map((t) => <td key={t} className="py-2 text-right">{num(totalTam(t))}</td>)}
                <td className="py-2 text-right">{num(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-linha">
        Conta os cortes marcados como cortados ou enviados. O que volta é abatido pelas entradas de costura de cada oficina, modelo e tamanho.
      </p>
    </Painel>
  );
}
