'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Search } from 'lucide-react';
import { useData, corOficina } from '@/lib/data';
import { supabase, mensagemErro } from '@/lib/supabase';
import { precoVigente } from '@/lib/precos';
import { brl, chave, dataBR, dec, hoje, num, parseNumero } from '@/lib/format';
import { TAMANHOS, TIPOS, type Modelo, type Operacao, type Tipo, type NovaEntrada } from '@/lib/types';
import { Botao, Cabecalho, Campo, Carregando, Painel, Pilulas, Texto, Vazio, useAviso } from '@/components/ui';

type ItemLote = NovaEntrada & { chave: string };
const CHAVE_RASCUNHO = 'oficinas:lote';

function BuscaModelo({ modelos, valor, onEscolher, recentes }: {
  modelos: Modelo[]; valor: Modelo | null; onEscolher: (m: Modelo | null) => void; recentes: Modelo[];
}) {
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const lista = useMemo(() => {
    const k = chave(texto);
    return modelos.filter((m) => m.ativo && (!k || chave(m.nome).includes(k) || (m.codigo ?? '').includes(k))).slice(0, 8);
  }, [texto, modelos]);

  if (valor) {
    return (
      <div className="flex h-12 items-center justify-between rounded-lg border border-indigo bg-indigo-claro px-3">
        <span className="font-display text-lg font-bold">{valor.nome}<span className="ml-2 text-sm font-semibold text-linha">{valor.tipo}</span></span>
        <button type="button" className="text-sm font-semibold text-indigo underline" onClick={() => { onEscolher(null); setTimeout(() => ref.current?.focus(), 0); }}>Trocar</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search size={18} className="pointer-events-none absolute left-3 top-3.5 text-linha" />
      <Texto
        ref={ref} value={texto} placeholder="Nome ou código do modelo" className="h-12 pl-10"
        onChange={(e) => { setTexto(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Enter' && lista[0]) { e.preventDefault(); onEscolher(lista[0]); setTexto(''); } }}
      />
      {aberto && lista.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-borda bg-tecido py-1 shadow-lg">
          {lista.map((m) => (
            <li key={m.id}>
              <button type="button" className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-papel"
                onMouseDown={(e) => e.preventDefault()} onClick={() => { onEscolher(m); setTexto(''); setAberto(false); }}>
                <span className="font-semibold">{m.nome}</span>
                <span className="text-sm text-linha">{m.tipo}{m.codigo ? ` ${m.codigo}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {recentes.length > 0 && !texto && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {recentes.map((m) => (
            <button key={m.id} type="button" onClick={() => onEscolher(m)}
              className="rounded-full border border-borda bg-tecido px-3 py-1.5 text-sm font-semibold hover:border-linha/60">{m.nome}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LancarPage() {
  const { oficinas, modelos, precos, entradas, carregando, recarregar, nomeOficina } = useData();
  const avisar = useAviso();
  const ativas = oficinas.filter((o) => o.ativa);

  const [data, setData] = useState(hoje());
  const [oficinaId, setOficinaId] = useState('');
  const [operacao, setOperacao] = useState<Operacao>('Costura');
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [grade, setGrade] = useState<Record<string, string>>({});
  const [tipoCorte, setTipoCorte] = useState<Tipo>('Calcinha');
  const [qtdCorte, setQtdCorte] = useState('');
  const [valorManual, setValorManual] = useState<string | null>(null);
  const [lote, setLote] = useState<ItemLote[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Rascunho do lote sobrevive a fechar o app sem querer.
  useEffect(() => {
    try { const r = localStorage.getItem(CHAVE_RASCUNHO); if (r) setLote(JSON.parse(r)); } catch { /* sem rascunho */ }
  }, []);
  useEffect(() => {
    try { lote.length ? localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(lote)) : localStorage.removeItem(CHAVE_RASCUNHO); } catch { /* ignora */ }
  }, [lote]);
  const opcoesOficina = ativas.filter((o) => (operacao === 'Corte' ? o.faz_corte : o.faz_costura));
  useEffect(() => {
    if (opcoesOficina.length && !opcoesOficina.some((o) => o.id === oficinaId)) setOficinaId(opcoesOficina[0].id);
  }, [opcoesOficina, oficinaId]);

  const preco = useMemo(() => {
    if (!oficinaId) return null;
    if (operacao === 'Costura') return modelo ? precoVigente(precos, { oficina_id: oficinaId, operacao, modelo_id: modelo.id, data }) : null;
    return precoVigente(precos, { oficina_id: oficinaId, operacao, tipo: tipoCorte, data });
  }, [precos, oficinaId, operacao, modelo, tipoCorte, data]);

  const valorUnit = valorManual !== null ? parseNumero(valorManual) : preco?.valor ?? null;

  const recentes = useMemo(() => {
    const vistos = new Set<string>(); const out: Modelo[] = [];
    for (let i = entradas.length - 1; i >= 0 && out.length < 6; i--) {
      const e = entradas[i];
      if (e.oficina_id !== oficinaId || !e.modelo_id || vistos.has(e.modelo_id)) continue;
      vistos.add(e.modelo_id);
      const m = modelos.find((x) => x.id === e.modelo_id && x.ativo);
      if (m) out.push(m);
    }
    return out;
  }, [entradas, modelos, oficinaId]);

  const qtdGrade = TAMANHOS.reduce((s, t) => s + (parseInt(grade[t] || '0', 10) || 0), 0);
  const qtdAtual = operacao === 'Costura' ? qtdGrade : parseInt(qtdCorte || '0', 10) || 0;
  const podeAdicionar = oficinaId && qtdAtual > 0 && valorUnit !== null && (operacao === 'Corte' || modelo);

  function adicionar() {
    if (!podeAdicionar || valorUnit === null) return;
    const base = { data, oficina_id: oficinaId, operacao, valor_unitario: valorUnit, observacao: null };
    const novos: ItemLote[] = operacao === 'Costura' && modelo
      ? TAMANHOS.filter((t) => parseInt(grade[t] || '0', 10) > 0).map((t) => ({
          ...base, tipo: modelo.tipo, modelo_id: modelo.id, tamanho: t, quantidade: parseInt(grade[t], 10), chave: crypto.randomUUID(),
        }))
      : [{ ...base, tipo: tipoCorte, modelo_id: null, tamanho: null, quantidade: qtdAtual, chave: crypto.randomUUID() }];
    setLote((l) => [...l, ...novos]);
    setGrade({}); setModelo(null); setQtdCorte(''); setValorManual(null);
  }

  async function salvar() {
    if (!lote.length) return;
    setSalvando(true);
    const linhas = lote.map(({ chave: _c, ...r }) => r);
    const { error } = await supabase.from('entradas').insert(linhas);
    setSalvando(false);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    const pecas = lote.reduce((s, i) => s + i.quantidade, 0);
    avisar(`${num(pecas)} peças lançadas.`);
    setLote([]);
    recarregar(['entradas']);
  }

  if (carregando) return <Carregando />;
  if (!ativas.length) {
    return <><Cabecalho titulo="Lançar entrada" /><Vazio titulo="Cadastre uma oficina primeiro"><Link href="/cadastros" className="font-semibold text-framboesa underline">Ir para oficinas e modelos</Link></Vazio></>;
  }

  const nomeMod = (id: string | null) => modelos.find((m) => m.id === id)?.nome ?? '';
  const totalLote = lote.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);
  const pecasLote = lote.reduce((s, i) => s + i.quantidade, 0);

  // agrupa o lote por oficina + data + modelo para exibir compacto
  const grupos = Object.values(lote.reduce<Record<string, ItemLote[]>>((acc, i) => {
    const k = `${i.data}|${i.oficina_id}|${i.operacao}|${i.modelo_id ?? i.tipo}|${i.valor_unitario}`;
    (acc[k] ||= []).push(i); return acc;
  }, {}));

  return (
    <>
      <Cabecalho titulo="Lançar entrada" sub="Monte o lote com tudo o que chegou e salve de uma vez." />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Painel>
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <Campo rotulo="Data"><Texto type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
            <Campo grupo rotulo="Oficina">
              <Pilulas rotulo="Oficina" valor={oficinaId} onChange={(v) => { setOficinaId(v); setValorManual(null); }}
                opcoes={opcoesOficina.map((o) => ({ valor: o.id, rotulo: o.nome }))} />
            </Campo>
          </div>

          <div className="mt-4">
            <Campo grupo rotulo="Operação">
              <Pilulas rotulo="Operação" valor={operacao} onChange={(v) => { setOperacao(v); setValorManual(null); }}
                opcoes={[{ valor: 'Costura', rotulo: 'Costura' }, { valor: 'Corte', rotulo: 'Corte' }]} />
            </Campo>
          </div>

          {operacao === 'Costura' ? (
            <>
              <div className="mt-5">
                <Campo grupo rotulo="Modelo">
                  <BuscaModelo modelos={modelos} valor={modelo} onEscolher={(m) => { setModelo(m); setValorManual(null); }} recentes={recentes} />
                </Campo>
              </div>
              <div className="mt-5">
                <span className="mb-1.5 block text-[13px] font-semibold text-linha">Quantidade por tamanho</span>
                <div className="grid grid-cols-4 gap-2">
                  {TAMANHOS.map((t) => (
                    <label key={t} className="block">
                      <span className="block text-center font-display text-base font-bold">{t}</span>
                      <input
                        type="number" inputMode="numeric" min={0} value={grade[t] ?? ''} placeholder="0"
                        onChange={(e) => setGrade((g) => ({ ...g, [t]: e.target.value.replace(/\D/g, '') }))}
                        className="num mt-1 h-14 w-full rounded-lg border border-borda bg-tecido text-center text-xl font-semibold focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo/15"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Campo grupo rotulo="Tipo cortado">
                <Pilulas rotulo="Tipo" valor={tipoCorte} onChange={(v) => { setTipoCorte(v); setValorManual(null); }}
                  opcoes={TIPOS.map((t) => ({ valor: t, rotulo: t }))} />
              </Campo>
              <Campo rotulo="Peças cortadas">
                <Texto type="number" inputMode="numeric" value={qtdCorte} placeholder="0" className="num h-14 text-xl font-semibold"
                  onChange={(e) => setQtdCorte(e.target.value.replace(/\D/g, ''))} />
              </Campo>
            </div>
          )}

          {/* Preço e total do item */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-papel px-4 py-3">
            <div className="text-[14px]">
              {valorManual !== null ? (
                <span className="flex items-center gap-2">
                  R$
                  <input autoFocus inputMode="decimal" value={valorManual} onChange={(e) => setValorManual(e.target.value)}
                    className="num h-9 w-24 rounded-md border border-borda bg-tecido px-2 font-semibold" aria-label="Valor por peça" />
                  por peça
                  <button type="button" className="font-semibold text-indigo underline" onClick={() => setValorManual(null)}>usar tabela</button>
                </span>
              ) : preco ? (
                <span>
                  <strong className="num">R$ {dec(preco.valor)}</strong> por peça, pela tabela.{' '}
                  <button type="button" className="font-semibold text-indigo underline" onClick={() => setValorManual(dec(preco.valor))}>Alterar</button>
                </span>
              ) : (operacao === 'Corte' || modelo) ? (
                <span className="text-ambar">
                  Sem preço para {operacao === 'Corte' ? `corte de ${tipoCorte.toLowerCase()}` : modelo?.nome} com {nomeOficina(oficinaId)}.{' '}
                  <button type="button" className="font-semibold underline" onClick={() => setValorManual('')}>Digitar valor</button>
                  {' '}ou <Link href="/precos" className="font-semibold underline">cadastrar preço</Link>.
                </span>
              ) : <span className="text-linha">Escolha o modelo para ver o preço.</span>}
            </div>
            <div className="text-right">
              <div className="num font-display text-xl font-bold">{valorUnit !== null ? brl(qtdAtual * valorUnit) : '—'}</div>
              <div className="num text-xs text-linha">{num(qtdAtual)} peças</div>
            </div>
          </div>

          <Botao className="mt-4 w-full" variante="secundario" disabled={!podeAdicionar} onClick={adicionar}>
            <Plus size={18} />Adicionar ao lote
          </Botao>
        </Painel>

        {/* Lote */}
        <Painel titulo={`Lote${lote.length ? ` (${lote.length} ${lote.length === 1 ? 'linha' : 'linhas'})` : ''}`}
          acao={lote.length > 0 && <button className="text-sm font-semibold text-linha underline" onClick={() => confirm('Descartar o lote?') && setLote([])}>Limpar</button>}
          className="lg:sticky lg:top-6 lg:self-start">
          {!lote.length ? (
            <p className="text-[15px] text-linha">Os itens adicionados aparecem aqui. Nada é salvo até você tocar em salvar.</p>
          ) : (
            <>
              <ul className="divide-y divide-borda">
                {grupos.map((g) => {
                  const i0 = g[0];
                  const qtd = g.reduce((s, i) => s + i.quantidade, 0);
                  return (
                    <li key={g.map((i) => i.chave).join()} className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">
                            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: corOficina(oficinas, i0.oficina_id) }} />
                            {i0.operacao === 'Corte' ? `Corte de ${i0.tipo.toLowerCase()}` : nomeMod(i0.modelo_id)}
                          </div>
                          <div className="text-[13px] text-linha">
                            {nomeOficina(i0.oficina_id)}, {dataBR(i0.data)}, R$ {dec(i0.valor_unitario)}/peça
                          </div>
                          {i0.operacao === 'Costura' && (
                            <div className="num mt-1 text-[13px]">{g.map((i) => `${i.tamanho} ${i.quantidade}`).join('   ')}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="num text-right text-[14px] font-semibold">{brl(qtd * i0.valor_unitario)}</span>
                          <button aria-label="Remover" className="rounded-md p-1.5 text-linha hover:bg-framboesa-claro hover:text-framboesa"
                            onClick={() => setLote((l) => l.filter((x) => !g.includes(x)))}><Trash2 size={16} /></button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex items-baseline justify-between border-t border-borda pt-3">
                <span className="num text-[14px] text-linha">{num(pecasLote)} peças</span>
                <span className="num font-display text-2xl font-bold">{brl(totalLote)}</span>
              </div>
              <Botao variante="destaque" className="mt-3 w-full" disabled={salvando} onClick={salvar}>
                {salvando ? 'Salvando…' : `Salvar ${lote.length} ${lote.length === 1 ? 'lançamento' : 'lançamentos'}`}
              </Botao>
            </>
          )}
        </Painel>
      </div>
    </>
  );
}
