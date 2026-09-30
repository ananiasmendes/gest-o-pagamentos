'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData, corOficina } from '@/lib/data';
import { brl, dataCurta, dec, hoje, inicioMes, num, pct } from '@/lib/format';
import {
  filtrarEntradas, filtrarPagamentos, periodoAnterior, porOficina, porTamanho, porTipo,
  projecaoMes, rankingModelos, resumo, saldos, serieMensal, variacao,
} from '@/lib/kpis';
import { BarraFiltro, useFiltro } from '@/components/FiltroPeriodo';
import { Cabecalho, Carregando, Etiqueta, Painel, Vazio, cx } from '@/components/ui';

function Variacao({ v }: { v: number | null }) {
  if (v === null || !Number.isFinite(v)) return null;
  const sobe = v >= 0;
  return (
    <span className={cx('text-xs font-semibold', sobe ? 'text-agua' : 'text-framboesa')}>
      {sobe ? '+' : '−'}{Math.abs(v * 100).toFixed(0)}% vs anterior
    </span>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: React.ReactNode }) {
  return (
    <div className="min-w-0 py-3 md:px-5 md:py-1">
      <div className="text-[13px] font-semibold text-linha">{rotulo}</div>
      <div className="num font-display text-[26px] font-bold leading-tight md:text-[28px]">{valor}</div>
      <div className="min-h-[18px]">{detalhe}</div>
    </div>
  );
}

const tooltipEstilo = { borderRadius: 10, border: '1px solid #EADFD8', fontSize: 13 };

export default function PainelPage() {
  const { oficinas, modelos, entradas, pagamentos, carregando } = useData();
  const f = useFiltro('mes');
  const h = hoje();

  const calc = useMemo(() => {
    const es = filtrarEntradas(entradas, f.filtro);
    const ps = filtrarPagamentos(pagamentos, f.filtro);
    const ant = periodoAnterior(f.filtro);
    const r = resumo(es, ps);
    const ra = resumo(filtrarEntradas(entradas, ant), filtrarPagamentos(pagamentos, ant));
    const ofs = f.filtro.oficinaId ? oficinas.filter((o) => o.id === f.filtro.oficinaId) : oficinas;
    return {
      r, ra, es,
      saldos: saldos(oficinas.filter((o) => o.ativa || entradas.some((e) => e.oficina_id === o.id)), entradas, pagamentos, h),
      serie: serieMensal(entradas.filter((e) => !f.filtro.oficinaId || e.oficina_id === f.filtro.oficinaId), ofs, h, 12),
      ofs,
      participacao: porOficina(es, oficinas),
      ranking: rankingModelos(es, modelos, 10),
      tamanhos: porTamanho(es),
      tipos: porTipo(es),
      projecao: projecaoMes(entradas, h, f.filtro.oficinaId),
    };
  }, [entradas, pagamentos, oficinas, modelos, f.filtro, h]);

  if (carregando) return <Carregando />;
  if (!entradas.length) {
    return (
      <>
        <Cabecalho titulo="Painel" />
        <Vazio titulo="Nenhuma entrada ainda">
          <Link className="font-semibold text-framboesa underline" href="/lancar">Lance a primeira entrega</Link> ou{' '}
          <Link className="font-semibold text-framboesa underline" href="/importar">importe sua planilha</Link>.
        </Vazio>
      </>
    );
  }

  const { r, ra } = calc;
  const comparar = f.preset !== 'tudo';
  const mesCorrente = f.filtro.de === inicioMes(h) && f.filtro.ate >= h;
  const maxModelo = Math.max(1, ...calc.ranking.map((m) => m.pecas));
  const totalAberto = calc.saldos.reduce((s, x) => s + Math.max(0, x.saldo), 0);

  return (
    <>
      <Cabecalho
        titulo="Painel"
        sub={totalAberto > 0.005 ? <>Você deve <strong className="text-tinta">{brl(totalAberto)}</strong> às oficinas hoje.</> : 'Todas as oficinas estão quitadas.'}
      />

      {/* Saldos: sempre o acumulado de todo o histórico, independente do filtro */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {calc.saldos.map((s) => {
          const cor = corOficina(oficinas, s.oficina.id);
          const situacao = s.saldo > 0.005 ? 'A pagar' : s.saldo < -0.005 ? 'Crédito com a oficina' : 'Quitado';
          return (
            <Link key={s.oficina.id} href={`/extrato?oficina=${s.oficina.id}`} className="block rounded-etiqueta focus-visible:outline-offset-4">
              <Etiqueta cor={cor}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-lg font-bold">{s.oficina.nome}</span>
                  <span className="text-[13px] font-semibold opacity-85">{situacao}</span>
                </div>
                <div className="num mt-1 font-display text-[34px] font-extrabold leading-none">{brl(Math.abs(s.saldo))}</div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px] opacity-90">
                  <span>{s.emAbertoDesde ? `Em aberto desde ${dataCurta(s.emAbertoDesde)}` : `Última entrega ${s.ultimaEntrega ? dataCurta(s.ultimaEntrega) : '—'}`}</span>
                  <span>{s.diasSemPagamento === null ? 'Sem pagamentos' : s.diasSemPagamento === 0 ? 'Pago hoje' : `Pago há ${s.diasSemPagamento} dias`}</span>
                  <span className="col-span-2">{s.prazoMedio === null ? 'Prazo médio de pagamento: —' : `Prazo médio de pagamento: ${Math.round(s.prazoMedio)} dias`}</span>
                </div>
              </Etiqueta>
            </Link>
          );
        })}
      </div>

      <BarraFiltro f={f} oficinas={oficinas} />

      <Painel className="mb-4">
        <div className="grid grid-cols-2 divide-borda md:grid-cols-4 md:divide-x">
          <Numero rotulo="Peças costuradas" valor={num(r.pecasCostura)} detalhe={comparar && <Variacao v={variacao(r.pecasCostura, ra.pecasCostura)} />} />
          <Numero rotulo="Valor produzido" valor={brl(r.valorTotal)} detalhe={comparar && <Variacao v={variacao(r.valorTotal, ra.valorTotal)} />} />
          <Numero rotulo="Pago no período" valor={brl(r.pago)} />
          <Numero rotulo="Custo médio da costura" valor={brl(r.custoMedioCostura)}
            detalhe={<span className="text-xs text-linha">por peça, sem o corte</span>} />
        </div>
        <div className="mt-2 grid grid-cols-2 divide-borda border-t border-borda pt-2 md:grid-cols-4 md:divide-x">
          <Numero rotulo="Peças cortadas" valor={num(r.pecasCorte)} detalhe={<span className="text-xs text-linha">{brl(r.valorCorte)} de corte</span>} />
          <Numero rotulo="Entregas de costura" valor={num(r.entregas)} detalhe={<span className="text-xs text-linha">{num(r.pecasPorEntrega)} peças por entrega</span>} />
          {mesCorrente ? (
            <Numero rotulo="Projeção do mês" valor={brl(calc.projecao.projetado)}
              detalhe={<span className="text-xs text-linha">no ritmo de {calc.projecao.decorridos} de {calc.projecao.total} dias</span>} />
          ) : (
            <Numero rotulo="Valor médio por entrega" valor={brl(r.entregas ? r.valorCostura / r.entregas : 0)} detalhe={<span className="text-xs text-linha">só costura</span>} />
          )}
          <Numero rotulo="Saldo do período" valor={brl(r.valorTotal - r.pago)}
            detalhe={<span className="text-xs text-linha">produzido menos pago</span>} />
        </div>
      </Painel>

      <div className="grid gap-4 lg:grid-cols-5">
        <Painel titulo="Peças costuradas por mês" className="lg:col-span-3">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={calc.serie} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#EADFD8" />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#7A625C' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#7A625C' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)} mil` : String(v))} />
                <Tooltip contentStyle={tooltipEstilo} formatter={(v) => num(Number(v))} cursor={{ fill: '#FBF6F2' }} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                {calc.ofs.map((o) => <Bar key={o.id} dataKey={o.nome} fill={corOficina(oficinas, o.id)} radius={[4, 4, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Painel>

        <Painel titulo="Divisão entre oficinas" className="lg:col-span-2">
          {calc.participacao.length === 0 ? <p className="text-linha">Sem produção no período.</p> : (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-papel">
                {calc.participacao.map((p) => (
                  <div key={p.oficina.id} style={{ width: `${p.parte * 100}%`, background: corOficina(oficinas, p.oficina.id) }} />
                ))}
              </div>
              <table className="mt-4 w-full text-[14px]">
                <thead><tr className="text-left text-[12px] text-linha">
                  <th className="pb-2 font-semibold">Oficina</th><th className="pb-2 text-right font-semibold">Peças</th>
                  <th className="pb-2 text-right font-semibold">Parte</th><th className="pb-2 text-right font-semibold">Média/peça</th>
                </tr></thead>
                <tbody className="num">
                  {calc.participacao.map((p) => (
                    <tr key={p.oficina.id} className="border-t border-borda">
                      <td className="py-2 font-semibold">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: corOficina(oficinas, p.oficina.id) }} />
                        {p.oficina.nome}
                      </td>
                      <td className="py-2 text-right">{num(p.pecasCostura)}</td>
                      <td className="py-2 text-right">{pct(p.parte)}</td>
                      <td className="py-2 text-right">{brl(p.custoMedioCostura)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-linha">
                {calc.participacao.map((p) => `${p.oficina.nome}: ${num(p.entregas)} entregas, ${num(p.pecasPorEntrega)} peças em média`).join('. ')}.
              </p>
            </>
          )}
        </Painel>

        <Painel titulo="Modelos mais produzidos" className="lg:col-span-3">
          {calc.ranking.length === 0 ? <p className="text-linha">Sem costura no período.</p> : (
            <ol className="space-y-2.5">
              {calc.ranking.map((m, i) => (
                <li key={m.nome} className="grid grid-cols-[1.5rem_7rem_1fr_4.5rem] items-center gap-2 text-[14px] md:grid-cols-[1.5rem_9rem_1fr_5rem]">
                  <span className="num text-linha">{i + 1}</span>
                  <span className="truncate font-semibold">{m.nome}</span>
                  <span className="h-2.5 rounded-full bg-papel">
                    <span className="block h-full rounded-full bg-indigo" style={{ width: `${(m.pecas / maxModelo) * 100}%` }} />
                  </span>
                  <span className="num text-right">{num(m.pecas)}</span>
                </li>
              ))}
            </ol>
          )}
        </Painel>

        <div className="grid gap-4 lg:col-span-2">
          <Painel titulo="Grade de tamanhos">
            {calc.tamanhos.length === 0 ? <p className="text-linha">Sem costura no período.</p> : (
              <div className="grid grid-cols-4 gap-2">
                {calc.tamanhos.map((t) => (
                  <div key={t.tamanho} className="rounded-lg bg-papel px-2 py-3 text-center">
                    <div className="font-display text-lg font-bold">{t.tamanho}</div>
                    <div className="num text-[15px] font-semibold">{pct(t.parte)}</div>
                    <div className="num text-xs text-linha">{num(t.pecas)}</div>
                  </div>
                ))}
              </div>
            )}
          </Painel>
          <Painel titulo="Por tipo de peça">
            {calc.tipos.length === 0 ? <p className="text-linha">Sem costura no período.</p> : (
              <table className="w-full text-[14px]">
                <tbody className="num">
                  {calc.tipos.map((t) => (
                    <tr key={t.tipo} className="border-t border-borda first:border-0">
                      <td className="py-2 font-semibold">{t.tipo}</td>
                      <td className="py-2 text-right">{num(t.pecas)} peças</td>
                      <td className="py-2 text-right text-linha">R$ {dec(t.medio)}/peça</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Painel>
        </div>
      </div>
    </>
  );
}
