'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useData } from '@/lib/data';
import { supabase, mensagemErro } from '@/lib/supabase';
import { chave, parseNumero } from '@/lib/format';

const fmtConsumo = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 5, useGrouping: false });
import type { FichaItem } from '@/lib/types';
import { Botao, Cabecalho, Campo, Carregando, Modal, Painel, Selecao, Texto, Vazio, cx, useAviso } from '@/components/ui';
import { AvisoMigracao } from '@/components/cortes/comum';

function CelulaConsumo({ item, unidade }: { item: FichaItem; unidade: string }) {
  const { recarregar } = useData();
  const avisar = useAviso();
  const [texto, setTexto] = useState(fmtConsumo(item.consumo));
  useEffect(() => { setTexto(fmtConsumo(item.consumo)); }, [item.consumo]);
  async function salvar() {
    const v = parseNumero(texto);
    if (v === null || v < 0) { setTexto(fmtConsumo(item.consumo)); return; }
    if (Math.abs(v - item.consumo) < 1e-9) return;
    const { error } = await supabase.from('ficha_tecnica').update({ consumo: v }).eq('modelo_id', item.modelo_id).eq('insumo_id', item.insumo_id);
    if (error) { avisar(mensagemErro(error), 'erro'); setTexto(fmtConsumo(item.consumo)); return; }
    recarregar(['ficha_tecnica']);
  }
  return (
    <span className="flex items-center gap-1.5">
      <input inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={salvar} aria-label="Consumo por peça"
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="num h-10 w-24 rounded-lg border border-borda bg-tecido px-2 text-right font-semibold focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo/15" />
      <span className="w-6 text-[13px] text-linha">{unidade}</span>
    </span>
  );
}

function Ficha() {
  const { modelos, insumos, ficha, carregando, cortesProntos, recarregar } = useData();
  const avisar = useAviso();
  const params = useSearchParams();
  const [modeloId, setModeloId] = useState(params.get('modelo') ?? '');
  const [busca, setBusca] = useState('');
  const [soSemFicha, setSoSemFicha] = useState(false);
  const [novoInsumo, setNovoInsumo] = useState('');
  const [novoConsumo, setNovoConsumo] = useState('');
  const [copiar, setCopiar] = useState<string | null>(null);

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of ficha) m.set(f.modelo_id, (m.get(f.modelo_id) ?? 0) + 1);
    return m;
  }, [ficha]);
  const lista = useMemo(() => {
    const k = chave(busca);
    return modelos.filter((m) => m.ativo && (!k || chave(m.nome).includes(k) || (m.codigo ?? '').includes(k)) && (!soSemFicha || !contagem.get(m.id)))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [modelos, busca, soSemFicha, contagem]);

  useEffect(() => { if (!modeloId && lista.length) setModeloId(lista[0].id); }, [lista, modeloId]);

  if (carregando) return <Carregando />;
  if (!cortesProntos) return <><Cabecalho titulo="Ficha técnica" /><AvisoMigracao /></>;

  const modelo = modelos.find((m) => m.id === modeloId);
  const itens = ficha.filter((f) => f.modelo_id === modeloId)
    .map((f) => ({ f, ins: insumos.find((i) => i.id === f.insumo_id)! })).filter((x) => x.ins)
    .sort((a, b) => a.ins.nome.localeCompare(b.ins.nome, 'pt-BR'));
  const disponiveis = insumos.filter((i) => i.ativo && !itens.some((x) => x.ins.id === i.id));
  const semFicha = modelos.filter((m) => m.ativo && !contagem.get(m.id)).length;

  async function adicionar() {
    const v = parseNumero(novoConsumo);
    if (!novoInsumo || v === null || v < 0) { avisar('Escolha o insumo e o consumo por peça.', 'erro'); return; }
    const { error } = await supabase.from('ficha_tecnica').insert({ modelo_id: modeloId, insumo_id: novoInsumo, consumo: v });
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    setNovoInsumo(''); setNovoConsumo('');
    recarregar(['ficha_tecnica']);
  }
  async function remover(insumoId: string) {
    const { error } = await supabase.from('ficha_tecnica').delete().eq('modelo_id', modeloId).eq('insumo_id', insumoId);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    recarregar(['ficha_tecnica']);
  }
  async function copiarDe() {
    if (!copiar) return;
    const origem = ficha.filter((f) => f.modelo_id === copiar);
    if (!origem.length) { avisar('Esse modelo não tem ficha técnica.', 'erro'); return; }
    const { error } = await supabase.from('ficha_tecnica')
      .upsert(origem.map((f) => ({ modelo_id: modeloId, insumo_id: f.insumo_id, consumo: f.consumo })), { onConflict: 'modelo_id,insumo_id' });
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    avisar(`${origem.length} insumos copiados. Ajuste o que for diferente.`);
    setCopiar(null);
    recarregar(['ficha_tecnica']);
  }

  return (
    <>
      <Cabecalho titulo="Ficha técnica" sub="Consumo de cada insumo por peça. É daqui que sai o pedido de material dos cortes." />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Painel className="lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto">
          <Texto value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar modelo" />
          <label className="mt-2 flex items-center gap-2 text-[13px] text-linha">
            <input type="checkbox" className="h-4 w-4 accent-[#2A1614]" checked={soSemFicha} onChange={(e) => setSoSemFicha(e.target.checked)} />
            Só os sem ficha ({semFicha})
          </label>
          {/* celular: lista vira seleção */}
          <Selecao className="mt-3 lg:hidden" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
            {lista.map((m) => <option key={m.id} value={m.id}>{m.nome} ({contagem.get(m.id) ?? 0})</option>)}
          </Selecao>
          <ul className="mt-2 hidden lg:block">
            {lista.map((m) => (
              <li key={m.id}>
                <button onClick={() => setModeloId(m.id)}
                  className={cx('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px]',
                    m.id === modeloId ? 'bg-tinta text-white' : 'hover:bg-papel')}>
                  <span className="font-semibold">{m.nome}</span>
                  <span className={cx('text-[12px]', m.id === modeloId ? 'text-white/70' : contagem.get(m.id) ? 'text-linha' : 'text-ambar')}>
                    {contagem.get(m.id) ? `${contagem.get(m.id)} insumos` : 'sem ficha'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Painel>

        {!modelo ? <Vazio titulo="Escolha um modelo" /> : (
          <Painel titulo={<span>{modelo.nome} <span className="text-sm font-medium text-linha">{modelo.tipo}{modelo.codigo ? `, código ${modelo.codigo}` : ''}</span></span>}
            acao={<Botao variante="fantasma" className="h-9 px-3 text-sm" onClick={() => setCopiar('')}><Copy size={15} />Copiar de outro</Botao>}>
            {!itens.length ? <p className="mb-4 text-[15px] text-linha">Este modelo ainda não tem ficha técnica.</p> : (
              <ul className="divide-y divide-borda">
                {itens.map(({ f, ins }) => (
                  <li key={ins.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{ins.nome}</span>
                      <span className="block text-[12px] text-linha">compra em {ins.unidade_compra.toLowerCase()}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <CelulaConsumo item={f} unidade={ins.unidade_consumo} />
                      <button aria-label="Remover" onClick={() => remover(ins.id)} className="rounded-md p-2 text-linha hover:bg-framboesa-claro hover:text-framboesa"><Trash2 size={16} /></button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-borda pt-4">
              <Campo rotulo="Insumo" className="min-w-[200px] flex-1">
                <Selecao value={novoInsumo} onChange={(e) => setNovoInsumo(e.target.value)}>
                  <option value="">Escolha</option>
                  {disponiveis.map((i) => <option key={i.id} value={i.id}>{i.nome} ({i.unidade_consumo})</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo="Consumo por peça" className="w-36">
                <Texto inputMode="decimal" value={novoConsumo} onChange={(e) => setNovoConsumo(e.target.value)} placeholder="0,02"
                  onKeyDown={(e) => { if (e.key === 'Enter') adicionar(); }} />
              </Campo>
              <Botao variante="secundario" onClick={adicionar}><Plus size={16} />Adicionar</Botao>
            </div>
          </Painel>
        )}
      </div>

      <Modal aberto={copiar !== null} titulo="Copiar ficha de outro modelo" onFechar={() => setCopiar(null)}
        rodape={<><div className="flex-1" /><Botao onClick={copiarDe} disabled={!copiar}>Copiar</Botao></>}>
        <p className="mb-3 text-[15px] text-linha">Os insumos do modelo escolhido entram na ficha de {modelo?.nome}. Os que já existem ficam com o consumo do outro modelo.</p>
        <Selecao value={copiar ?? ''} onChange={(e) => setCopiar(e.target.value)}>
          <option value="">Escolha o modelo</option>
          {modelos.filter((m) => m.id !== modeloId && contagem.get(m.id)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
            .map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </Selecao>
      </Modal>
    </>
  );
}

export default function FichaPage() {
  return <Suspense fallback={<Carregando />}><Ficha /></Suspense>;
}
