'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useData, corOficina } from '@/lib/data';
import { supabase, mensagemErro } from '@/lib/supabase';
import { brl, dataBR, dec, diaSemana, hoje, parseNumero } from '@/lib/format';
import { filtrarPagamentos, saldos } from '@/lib/kpis';
import { baixarPlanilha } from '@/lib/exportar';
import type { Pagamento } from '@/lib/types';
import { BarraFiltro, useFiltro } from '@/components/FiltroPeriodo';
import { Botao, Cabecalho, Campo, Carregando, Modal, Painel, Pilulas, Selecao, Texto, Vazio, useAviso } from '@/components/ui';

function FormPagamento({ inicial, onPronto, compacto }: { inicial?: Pagamento; onPronto?: () => void; compacto?: boolean }) {
  const { oficinas, entradas, pagamentos, recarregar } = useData();
  const avisar = useAviso();
  const ativas = oficinas.filter((o) => o.ativa || o.id === inicial?.oficina_id);
  const [data, setData] = useState(inicial?.data ?? hoje());
  const [oficinaId, setOficinaId] = useState(inicial?.oficina_id ?? '');
  const [valor, setValor] = useState(inicial ? dec(inicial.valor) : '');
  const [obs, setObs] = useState(inicial?.observacao ?? '');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (!oficinaId && ativas.length) setOficinaId(ativas[0].id); }, [ativas, oficinaId]);

  const saldo = useMemo(() => {
    const s = saldos(oficinas.filter((o) => o.id === oficinaId), entradas, pagamentos, hoje())[0];
    return s ? s.saldo + (inicial && inicial.oficina_id === oficinaId ? inicial.valor : 0) : 0;
  }, [oficinas, oficinaId, entradas, pagamentos, inicial]);

  const sugestoes = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of pagamentos) if (p.observacao && p.observacao.length < 40) c.set(p.observacao, (c.get(p.observacao) ?? 0) + 1);
    return Array.from(c).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([o]) => o);
  }, [pagamentos]);

  async function salvar() {
    const v = parseNumero(valor);
    if (!oficinaId || v === null || v === 0) { avisar('Informe a oficina e o valor.', 'erro'); return; }
    setSalvando(true);
    const linha = { data, oficina_id: oficinaId, valor: Math.round(v * 100) / 100, observacao: obs.trim() || null };
    const { error } = inicial
      ? await supabase.from('pagamentos').update(linha).eq('id', inicial.id)
      : await supabase.from('pagamentos').insert(linha);
    setSalvando(false);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    avisar(inicial ? 'Pagamento atualizado.' : `Pagamento de ${brl(linha.valor)} registrado.`);
    if (!inicial) { setValor(''); setObs(''); }
    await recarregar(['pagamentos']);
    onPronto?.();
  }

  return (
    <div className="grid gap-4">
      <div className={compacto ? 'grid grid-cols-2 gap-3' : 'grid gap-4 sm:grid-cols-[180px_1fr]'}>
        <Campo rotulo="Data"><Texto type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
        <Campo rotulo="Oficina">
          {compacto ? (
            <Selecao value={oficinaId} onChange={(e) => setOficinaId(e.target.value)}>
              {ativas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </Selecao>
          ) : (
            <Pilulas rotulo="Oficina" valor={oficinaId} onChange={setOficinaId} opcoes={ativas.map((o) => ({ valor: o.id, rotulo: o.nome }))} />
          )}
        </Campo>
      </div>
      <Campo rotulo="Valor (R$)"
        dica={saldo > 0.005 && !inicial
          ? <button type="button" className="font-semibold text-indigo underline" onClick={() => setValor(dec(Math.round(saldo * 100) / 100))}>Quitar o saldo: {brl(saldo)}</button>
          : 'Use valor negativo para estornos e correções.'}>
        <Texto inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className="num h-12 text-lg font-semibold" />
      </Campo>
      <Campo rotulo="Observação (de onde saiu o dinheiro, acerto etc.)">
        <Texto list="obs-pagamento" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: Acerto" />
        <datalist id="obs-pagamento">{sugestoes.map((s) => <option key={s} value={s} />)}</datalist>
      </Campo>
      <Botao variante={inicial ? 'primario' : 'destaque'} onClick={salvar} disabled={salvando}>
        {salvando ? 'Salvando…' : inicial ? 'Salvar alterações' : 'Registrar pagamento'}
      </Botao>
    </div>
  );
}

export default function PagamentosPage() {
  const { oficinas, entradas, pagamentos, carregando, nomeOficina, recarregar } = useData();
  const avisar = useAviso();
  const f = useFiltro('tudo');
  const [editando, setEditando] = useState<Pagamento | null>(null);

  const lista = useMemo(() => filtrarPagamentos(pagamentos, f.filtro).sort((a, b) => b.data.localeCompare(a.data)), [pagamentos, f.filtro]);
  const saldosAtuais = useMemo(() => saldos(oficinas, entradas, pagamentos, hoje()), [oficinas, entradas, pagamentos]);

  async function excluir(p: Pagamento) {
    if (!confirm(`Excluir o pagamento de ${brl(p.valor)} para ${nomeOficina(p.oficina_id)}?`)) return;
    const { error } = await supabase.from('pagamentos').delete().eq('id', p.id);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    avisar('Pagamento excluído.');
    setEditando(null);
    recarregar(['pagamentos']);
  }

  if (carregando) return <Carregando />;

  return (
    <>
      <Cabecalho titulo="Pagamentos"
        acoes={<Botao variante="secundario" disabled={!lista.length} onClick={() => baixarPlanilha('pagamentos.xlsx', [{
          nome: 'Pagamentos', linhas: lista.map((p) => ({ Data: dataBR(p.data), Oficina: nomeOficina(p.oficina_id), Valor: p.valor, 'Observação': p.observacao ?? '' })),
        }])}><Download size={17} />Exportar</Botao>} />

      <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
        <div className="space-y-4">
          <Painel titulo="Registrar pagamento"><FormPagamento /></Painel>
          <Painel titulo="Saldo hoje">
            <ul className="divide-y divide-borda">
              {saldosAtuais.map((s) => (
                <li key={s.oficina.id} className="flex items-center justify-between py-2.5">
                  <span className="font-semibold">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: corOficina(oficinas, s.oficina.id) }} />{s.oficina.nome}
                  </span>
                  <span className="num text-right">
                    <span className="block font-semibold">{brl(Math.abs(s.saldo))}</span>
                    <span className="block text-xs text-linha">{s.saldo > 0.005 ? 'a pagar' : s.saldo < -0.005 ? 'crédito com a oficina' : 'quitado'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Painel>
        </div>

        <div>
          <BarraFiltro f={f} oficinas={oficinas} />
          {!lista.length ? <Vazio titulo="Nenhum pagamento no período" /> : (
            <div className="overflow-hidden rounded-xl border border-borda bg-tecido">
              <div className="num flex justify-between bg-papel/70 px-4 py-2.5 text-[14px]">
                <span className="text-linha">{lista.length} pagamentos</span>
                <strong>{brl(lista.reduce((s, p) => s + p.valor, 0))}</strong>
              </div>
              <ul className="divide-y divide-borda">
                {lista.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => setEditando(p)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 text-left hover:bg-papel/60">
                      <span className="min-w-0">
                        <span className="block font-semibold">
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: corOficina(oficinas, p.oficina_id) }} />
                          {nomeOficina(p.oficina_id)}
                        </span>
                        <span className="block truncate text-[13px] text-linha">{dataBR(p.data)}, {diaSemana(p.data)}{p.observacao ? `. ${p.observacao}` : ''}</span>
                      </span>
                      <span className={`num font-semibold ${p.valor < 0 ? 'text-framboesa' : ''}`}>{brl(p.valor)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <Modal aberto={!!editando} titulo="Editar pagamento" onFechar={() => setEditando(null)}
        rodape={editando && <Botao variante="perigo" onClick={() => excluir(editando)}>Excluir pagamento</Botao>}>
        {editando && <FormPagamento key={editando.id} inicial={editando} compacto onPronto={() => setEditando(null)} />}
      </Modal>
    </>
  );
}
