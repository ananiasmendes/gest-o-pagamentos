'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageCircle, Copy } from 'lucide-react';
import { useData, corOficina } from '@/lib/data';
import { brl, dataBR, dataCurta, diaSemana, hoje, num } from '@/lib/format';
import { PRESETS, intervalo, type Preset } from '@/components/FiltroPeriodo';
import { Botao, classeBotao, Cabecalho, Campo, Carregando, Etiqueta, Painel, Selecao, Texto, Vazio, useAviso } from '@/components/ui';

interface Movimento { data: string; tipo: 'Produção' | 'Pagamento'; valor: number; pecas: number; texto: string; saldo: number }

function Extrato() {
  const { oficinas, entradas, pagamentos, modelos, carregando } = useData();
  const avisar = useAviso();
  const params = useSearchParams();
  const [oficinaId, setOficinaId] = useState(params.get('oficina') ?? '');
  const [preset, setPreset] = useState<Preset>('mes');
  const [custom, setCustom] = useState({ de: hoje().slice(0, 8) + '01', ate: hoje() });

  useEffect(() => { if (!oficinaId && oficinas.length) setOficinaId(oficinas[0].id); }, [oficinas, oficinaId]);

  const { de, ate } = intervalo(preset, custom);

  const calc = useMemo(() => {
    const nomeMod = new Map(modelos.map((m) => [m.id, m.nome]));
    const es = entradas.filter((e) => e.oficina_id === oficinaId);
    const ps = pagamentos.filter((p) => p.oficina_id === oficinaId);

    const porDia = new Map<string, { valor: number; pecas: number; itens: Map<string, number> }>();
    for (const e of es) {
      const d = porDia.get(e.data) ?? { valor: 0, pecas: 0, itens: new Map() };
      d.valor += e.valor_total;
      if (e.operacao === 'Costura') d.pecas += e.quantidade;
      const nome = e.operacao === 'Corte' ? `corte de ${e.tipo.toLowerCase()}` : nomeMod.get(e.modelo_id ?? '') ?? '—';
      d.itens.set(nome, (d.itens.get(nome) ?? 0) + e.quantidade);
      porDia.set(e.data, d);
    }
    const eventos = [
      ...Array.from(porDia, ([data, d]) => ({
        data, tipo: 'Produção' as const, valor: d.valor, pecas: d.pecas,
        texto: Array.from(d.itens).sort((a, b) => b[1] - a[1]).map(([n, q]) => `${n} ${num(q)}`).join(', '),
      })),
      ...ps.map((p) => ({ data: p.data, tipo: 'Pagamento' as const, valor: -p.valor, pecas: 0, texto: p.observacao ?? '' })),
    ].sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === 'Produção' ? -1 : 1));

    let saldo = 0, saldoAnterior = 0;
    const movs: Movimento[] = [];
    for (const ev of eventos) {
      saldo += ev.valor;
      if (ev.data < de) saldoAnterior = saldo;
      else if (ev.data <= ate) movs.push({ ...ev, saldo });
    }
    const produzido = movs.filter((m) => m.tipo === 'Produção').reduce((s, m) => s + m.valor, 0);
    const pago = -movs.filter((m) => m.tipo === 'Pagamento').reduce((s, m) => s + m.valor, 0);
    const pecas = movs.reduce((s, m) => s + m.pecas, 0);
    return { movs, saldoAnterior, produzido, pago, pecas, saldoFinal: saldoAnterior + produzido - pago, saldoHoje: saldo };
  }, [entradas, pagamentos, modelos, oficinaId, de, ate]);

  const oficina = oficinas.find((o) => o.id === oficinaId);
  const periodoTexto = preset === 'tudo' ? 'todo o histórico' : `${dataBR(de)} a ${dataBR(ate > hoje() ? hoje() : ate)}`;

  const mensagem = useMemo(() => {
    if (!oficina) return '';
    const l: string[] = [`*Extrato ${oficina.nome}*`, `Período: ${periodoTexto}`, ''];
    if (preset !== 'tudo') l.push(`Saldo anterior: ${brl(calc.saldoAnterior)}`, '');
    const prod = calc.movs.filter((m) => m.tipo === 'Produção');
    const pags = calc.movs.filter((m) => m.tipo === 'Pagamento');
    if (prod.length) {
      l.push('*Produção*');
      prod.forEach((m) => l.push(`${dataCurta(m.data)}: ${m.pecas ? `${num(m.pecas)} peças, ` : ''}${brl(m.valor)}`));
      l.push(`Total: ${brl(calc.produzido)}`, '');
    }
    if (pags.length) {
      l.push('*Pagamentos*');
      pags.forEach((m) => l.push(`${dataCurta(m.data)}: ${brl(-m.valor)}${m.texto ? ` (${m.texto})` : ''}`));
      l.push(`Total: ${brl(calc.pago)}`, '');
    }
    l.push(calc.saldoFinal > 0.005 ? `*Saldo a receber: ${brl(calc.saldoFinal)}*` : calc.saldoFinal < -0.005 ? `*Crédito adiantado: ${brl(-calc.saldoFinal)}*` : '*Tudo quitado*');
    return l.join('\n');
  }, [oficina, calc, periodoTexto, preset]);

  if (carregando) return <Carregando />;
  if (!oficinas.length) return <Vazio titulo="Nenhuma oficina cadastrada" />;

  const cor = corOficina(oficinas, oficinaId);

  return (
    <>
      <Cabecalho titulo="Extrato" sub="Produção e pagamentos lado a lado, com o saldo depois de cada movimento." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:flex md:flex-wrap md:items-end">
        <Campo rotulo="Oficina" className="md:w-48">
          <Selecao value={oficinaId} onChange={(e) => setOficinaId(e.target.value)}>
            {oficinas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Período" className="md:w-48">
          <Selecao value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            {PRESETS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
          </Selecao>
        </Campo>
        {preset === 'custom' && (<>
          <Campo rotulo="De" className="md:w-44"><Texto type="date" value={custom.de} onChange={(e) => setCustom({ ...custom, de: e.target.value })} /></Campo>
          <Campo rotulo="Até" className="md:w-44"><Texto type="date" value={custom.ate} onChange={(e) => setCustom({ ...custom, ate: e.target.value })} /></Campo>
        </>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Etiqueta cor={cor}>
            <div className="text-[13px] font-semibold opacity-85">Saldo no fim do período</div>
            <div className="num mt-1 font-display text-[34px] font-extrabold leading-none">{brl(Math.abs(calc.saldoFinal))}</div>
            <div className="mt-1 text-[13px] opacity-90">{calc.saldoFinal > 0.005 ? 'a pagar' : calc.saldoFinal < -0.005 ? 'de crédito com a oficina' : 'quitado'}</div>
            <dl className="num mt-4 grid grid-cols-2 gap-y-1 text-[14px]">
              {preset !== 'tudo' && (<><dt className="opacity-85">Saldo anterior</dt><dd className="text-right">{brl(calc.saldoAnterior)}</dd></>)}
              <dt className="opacity-85">Produção</dt><dd className="text-right">{brl(calc.produzido)}</dd>
              <dt className="opacity-85">Pagamentos</dt><dd className="text-right">{brl(calc.pago)}</dd>
              <dt className="opacity-85">Peças costuradas</dt><dd className="text-right">{num(calc.pecas)}</dd>
            </dl>
          </Etiqueta>
          <div className="flex gap-2">
            <a className={classeBotao('secundario', 'flex-1')} href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer">
              <MessageCircle size={17} />Enviar no WhatsApp
            </a>
            <Botao variante="secundario" aria-label="Copiar texto"
              onClick={() => navigator.clipboard.writeText(mensagem).then(() => avisar('Extrato copiado.'))}><Copy size={17} /></Botao>
          </div>
        </div>

        <Painel titulo={`Movimentos, ${periodoTexto}`}>
          {!calc.movs.length ? <p className="text-linha">Nenhum movimento no período.</p> : (
            <ol className="divide-y divide-borda">
              {[...calc.movs].reverse().map((m, i) => (
                <li key={i} className="grid grid-cols-[1fr_auto] gap-3 py-3">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {dataBR(m.data)} <span className="text-[13px] font-medium text-linha">{diaSemana(m.data)}</span>
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[12px] ${m.tipo === 'Produção' ? 'bg-indigo-claro text-indigo' : 'bg-agua-claro text-agua'}`}>{m.tipo}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[13px] text-linha">{m.pecas ? `${num(m.pecas)} peças: ` : ''}{m.texto}</div>
                  </div>
                  <div className="num text-right">
                    <div className={`font-semibold ${m.tipo === 'Pagamento' ? 'text-agua' : ''}`}>{m.tipo === 'Pagamento' ? '−' : '+'}{brl(Math.abs(m.valor))}</div>
                    <div className="text-[12px] text-linha">saldo {brl(m.saldo)}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Painel>
      </div>
    </>
  );
}

export default function ExtratoPage() {
  return <Suspense fallback={<Carregando />}><Extrato /></Suspense>;
}
