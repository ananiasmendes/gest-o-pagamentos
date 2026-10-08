'use client';

import { useMemo, useState } from 'react';
import { Check, Hand, Scissors, ShoppingBag, Trash2 } from 'lucide-react';
import { useData } from '@/lib/data';
import { supabase, mensagemErro } from '@/lib/supabase';
import { api } from '@/lib/api';
import { alocar, calcularPrateleira, chaveSku, nomeSemTamanho, ordemTamanho, TAMANHOS_ESTOQUE, type SituacaoItem, type SituacaoPedido } from '@/lib/separacao';
import { chave, num } from '@/lib/format';
import type { PedidoItem } from '@/lib/types';
import { Botao, Modal, Texto, cx, useAviso } from '@/components/ui';
import { Contador, Tamanho } from './comum';

export const pecas = (n: number) => `${num(n)} ${n === 1 ? 'peça' : 'peças'}`;

/** Estoque da prateleira e a distribuição entre os pedidos em aberto (mais antigo primeiro). */
export function useSeparacao() {
  const { pedidos, pedidoItens, sacola, entradas, estoqueMov, estoqueInicio } = useData();
  const prateleira = useMemo(
    () => calcularPrateleira({ entradas, movimentos: estoqueMov, sacola, inicio: estoqueInicio }),
    [entradas, estoqueMov, sacola, estoqueInicio],
  );
  const calc = useMemo(() => alocar({ pedidos, itens: pedidoItens, sacola, prateleira }), [pedidos, pedidoItens, sacola, prateleira]);
  return { prateleira, calc };
}

/**
 * Os itens de um pedido com as ações de separação: pegar no estoque, corrigir a sacola,
 * escolher as peças dos itens "Diversos" e fechar o pedido.
 */
export function DetalhePedido({ sp, prateleira, avisaBling, onFechado }: {
  sp: SituacaoPedido;
  prateleira: Map<string, number>;
  /** há uma situação de "pronto" configurada no Bling */
  avisaBling: boolean;
  onFechado: () => void;
}) {
  const { sacola, modelos, recarregar, modelo } = useData();
  const avisar = useAviso();
  const [ocupado, setOcupado] = useState<Set<number>>(new Set());
  const [editando, setEditando] = useState<{ si: SituacaoItem; valor: number } | null>(null);
  const [manualId, setManualId] = useState<number | null>(null);
  const [fechando, setFechando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const marcar = (id: number, v: boolean) => setOcupado((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });

  /** Define quantas peças de um modelo e tamanho estão na sacola de um item (0 tira a linha). */
  async function definir(item: PedidoItem, modelo_id: string, tamanho: string, quantidade: number) {
    marcar(item.id, true);
    const atual = sacola.find((s) => s.item_id === item.id && s.modelo_id === modelo_id && s.tamanho === tamanho);
    const r = quantidade <= 0
      ? atual ? await supabase.from('sacola').delete().eq('id', atual.id) : { error: null }
      : await supabase.from('sacola').upsert(
        { pedido_id: item.pedido_id, item_id: item.id, modelo_id, tamanho, quantidade, updated_at: new Date().toISOString() },
        { onConflict: 'item_id,modelo_id,tamanho' });
    if (r.error) avisar(mensagemErro(r.error), 'erro');
    await recarregar(['sacola']);
    marcar(item.id, false);
    return !r.error;
  }

  async function pegar(si: SituacaoItem) {
    const { item } = si;
    if (!item.modelo_id || !item.tamanho || si.pegar <= 0) return;
    if (await definir(item, item.modelo_id, item.tamanho, si.sacola + si.pegar)) avisar(`${pecas(si.pegar)} na sacola.`);
  }

  async function salvarEdicao() {
    if (!editando) return;
    const { item } = editando.si;
    if (!item.modelo_id || !item.tamanho) return;
    if (await definir(item, item.modelo_id, item.tamanho, editando.valor)) setEditando(null);
  }

  async function fechar() {
    setEnviando(true);
    try {
      const r = await api<{ aviso: string | null }>('/api/bling/pedido', { body: { id: sp.pedido.id, acao: 'pronto' } });
      await recarregar(['pedidos']);
      avisar(r.aviso ?? `Pedido ${sp.pedido.numero ?? ''} pronto.${avisaBling ? ' O Bling foi avisado.' : ''}`, r.aviso ? 'erro' : 'ok');
      setFechando(false);
      onFechado();
    } catch (e) { avisar((e as Error).message, 'erro'); }
    setEnviando(false);
  }

  const noModal = manualId ? sp.itens.find((i) => i.item.id === manualId) ?? null : null;

  return (
    <>
      <ul className="divide-y divide-borda">
        {sp.itens.map((si) => {
          const { item } = si;
          const ehManual = !item.modelo_id || !item.tamanho;
          const travado = ocupado.has(item.id);
          return (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
              <button
                type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => (ehManual ? setManualId(item.id) : setEditando({ si, valor: si.sacola }))}
                aria-label={`Corrigir a sacola de ${item.descricao}`}
              >
                <Tamanho t={ehManual ? '…' : item.tamanho} className={si.completo ? 'bg-agua-claro text-agua' : undefined} />
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-semibold">{nomeSemTamanho(item.descricao, item.tamanho) || item.sku || 'Item'}</span>
                  <span className="block text-[13px] text-linha">
                    pediu <span className="num font-semibold text-tinta">{num(item.quantidade)}</span>
                    {si.sacola > 0 && <>, <ShoppingBag size={13} className="mb-0.5 inline text-agua" /> <span className="num font-semibold text-agua">{num(si.sacola)}</span> na sacola</>}
                  </span>
                </span>
              </button>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {si.completo ? (
                  <span className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-agua-claro px-3 text-[14px] font-semibold text-agua"><Check size={18} />Completo</span>
                ) : ehManual ? (
                  <Botao className="h-12 text-base" onClick={() => setManualId(item.id)}><Hand size={20} />Escolher {num(si.escolher)}</Botao>
                ) : (
                  <>
                    {si.pegar > 0 && (
                      <Botao className="h-12 text-base" disabled={travado} onClick={() => pegar(si)}><Hand size={20} />Pegar {num(si.pegar)}</Botao>
                    )}
                    {si.produzir > 0 && (
                      <span className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ambar-claro px-3 text-[14px] font-semibold text-ambar"><Scissors size={16} />Falta produzir {num(si.produzir)}</span>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {sp.completo ? (
        <button
          type="button" onClick={() => setFechando(true)}
          className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-agua text-lg font-bold text-white hover:opacity-90"
        ><Check size={24} />Pedido pronto</button>
      ) : (
        <p className="mt-1 border-t border-borda pt-3 text-[14px] text-linha">
          {sp.pegar > 0 && <>Dá para pegar <strong className="text-tinta">{pecas(sp.pegar)}</strong> agora. </>}
          {sp.escolher > 0 && <>Falta escolher <strong className="text-tinta">{pecas(sp.escolher)}</strong>. </>}
          {sp.produzir > 0 && <>Esperando a produção de <strong className="text-ambar">{pecas(sp.produzir)}</strong>.</>}
          {!sp.itens.length && <>Este pedido não tem itens.</>}
        </p>
      )}

      {/* Corrigir a sacola de um item */}
      <Modal
        aberto={!!editando} onFechar={() => setEditando(null)}
        titulo={editando ? `${nomeSemTamanho(editando.si.item.descricao, editando.si.item.tamanho)} ${editando.si.item.tamanho ?? ''}` : ''}
        rodape={<>
          <Botao variante="secundario" className="flex-1" onClick={() => setEditando(null)}>Cancelar</Botao>
          <Botao className="flex-1" onClick={salvarEdicao} disabled={!editando || ocupado.has(editando.si.item.id)}>Salvar</Botao>
        </>}
      >
        {editando && (() => {
          const { item, sacola: jaTem } = editando.si;
          const naPrateleira = Math.max(0, prateleira.get(chaveSku(item.modelo_id!, item.tamanho!)) ?? 0);
          const max = Math.min(item.quantidade, jaTem + naPrateleira);
          return (
            <div className="space-y-4 text-center">
              <p className="text-[15px] text-linha">Quantas peças deste item estão na sacola?</p>
              <Contador valor={editando.valor} max={Math.max(max, jaTem)} onChange={(v) => setEditando({ ...editando, valor: v })} />
              <p className="text-[14px] text-linha">
                O pedido pede <strong className="text-tinta">{num(item.quantidade)}</strong>. Na prateleira há <strong className="text-tinta">{num(naPrateleira)}</strong>.
              </p>
              {editando.valor > 0 && (
                <Botao variante="perigo" className="mx-auto" onClick={() => setEditando({ ...editando, valor: 0 })}><Trash2 size={16} />Tirar tudo da sacola</Botao>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Item manual ("Diversos"): escolher quais peças entram */}
      <Modal aberto={!!noModal} onFechar={() => setManualId(null)} titulo={noModal ? noModal.item.descricao || 'Escolher peças' : ''}
        rodape={<Botao className="flex-1" onClick={() => setManualId(null)}>Concluir</Botao>}>
        {noModal && (
          <EscolherPecas
            si={noModal} modelos={modelos} prateleira={prateleira} ocupado={ocupado.has(noModal.item.id)}
            linhas={sacola.filter((s) => s.item_id === noModal.item.id)} nomeModelo={(id) => modelo(id)?.nome ?? '—'}
            onDefinir={(modelo_id, tamanho, q) => definir(noModal.item, modelo_id, tamanho, q)}
          />
        )}
      </Modal>

      {/* Confirmar "Pedido pronto" */}
      <Modal aberto={fechando} onFechar={() => !enviando && setFechando(false)} titulo={`Fechar o pedido ${sp.pedido.numero ?? ''}?`}
        rodape={<>
          <Botao variante="secundario" className="flex-1" onClick={() => setFechando(false)} disabled={enviando}>Ainda não</Botao>
          <button type="button" onClick={fechar} disabled={enviando}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-agua px-4 text-[15px] font-bold text-white disabled:opacity-50">
            <Check size={18} />{enviando ? 'Avisando o Bling…' : 'Sim, está pronto'}
          </button>
        </>}>
        <p className="text-[16px]">
          As <strong>{pecas(sp.total)}</strong> de <strong>{sp.pedido.cliente || 'cliente'}</strong> estão na sacola.
          {avisaBling ? ' O Bling é avisado de que o pedido está separado.' : ''}
        </p>
      </Modal>
    </>
  );
}

/** Dentro de um item "Diversos": busca um modelo, escolhe o tamanho e a quantidade que vai para a sacola. */
function EscolherPecas({ si, modelos, prateleira, linhas, ocupado, nomeModelo, onDefinir }: {
  si: SituacaoItem;
  modelos: { id: string; nome: string; tipo: string; codigo: string | null; ativo: boolean }[];
  prateleira: Map<string, number>;
  linhas: { id: string; modelo_id: string; tamanho: string; quantidade: number }[];
  ocupado: boolean;
  nomeModelo: (id: string) => string;
  onDefinir: (modelo_id: string, tamanho: string, quantidade: number) => Promise<boolean>;
}) {
  const [busca, setBusca] = useState('');
  const [modeloId, setModeloId] = useState('');
  const [tamanho, setTamanho] = useState('');
  const [qtd, setQtd] = useState(1);

  const naPrateleira = (m: string, t: string) => Math.max(0, prateleira.get(chaveSku(m, t)) ?? 0);
  const totalModelo = (m: string) => TAMANHOS_ESTOQUE.reduce((s, t) => s + naPrateleira(m, t), 0);
  const achados = useMemo(() => {
    const k = chave(busca);
    return modelos
      .filter((m) => (m.ativo || totalModelo(m.id) > 0) && (!k || chave(m.nome).includes(k) || (m.codigo ?? '').includes(k)))
      .sort((a, b) => totalModelo(b.id) - totalModelo(a.id) || a.nome.localeCompare(b.nome))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelos, busca, prateleira]);

  const falta = si.escolher;
  const limite = modeloId && tamanho ? Math.min(falta, naPrateleira(modeloId, tamanho)) : 0;

  async function colocar() {
    if (!modeloId || !tamanho || qtd <= 0) return;
    const ja = linhas.find((l) => l.modelo_id === modeloId && l.tamanho === tamanho)?.quantidade ?? 0;
    if (await onDefinir(modeloId, tamanho, ja + qtd)) { setTamanho(''); setQtd(1); }
  }

  return (
    <div className="space-y-4">
      <p className="text-[15px]">
        O pedido pede <strong>{num(si.item.quantidade)}</strong>. {falta > 0 ? <>Falta escolher <strong>{num(falta)}</strong>.</> : <span className="font-semibold text-agua">Completo.</span>}
      </p>

      {linhas.length > 0 && (
        <ul className="divide-y divide-borda rounded-lg border border-borda">
          {[...linhas].sort((a, b) => nomeModelo(a.modelo_id).localeCompare(nomeModelo(b.modelo_id)) || ordemTamanho(a.tamanho) - ordemTamanho(b.tamanho)).map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="font-semibold">{nomeModelo(l.modelo_id)} {l.tamanho}</span>
              <span className="flex items-center gap-2">
                <span className="num font-semibold text-agua">{num(l.quantidade)}</span>
                <button type="button" aria-label="Tirar da sacola" disabled={ocupado} onClick={() => onDefinir(l.modelo_id, l.tamanho, 0)} className="rounded-lg p-2 text-framboesa hover:bg-framboesa-claro"><Trash2 size={18} /></button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {falta > 0 && (
        <div className="space-y-3">
          <Texto placeholder="Buscar a peça pelo nome" value={busca} onChange={(e) => { setBusca(e.target.value); setModeloId(''); setTamanho(''); }} />
          {!modeloId ? (
            <ul className="divide-y divide-borda">
              {achados.map((m) => (
                <li key={m.id}>
                  <button type="button" className="flex w-full items-center justify-between py-3 text-left" onClick={() => { setModeloId(m.id); setTamanho(''); setQtd(1); }}>
                    <span className="font-semibold">{m.nome} <span className="text-sm font-normal text-linha">{m.tipo}</span></span>
                    <span className="num text-sm text-linha">{num(totalModelo(m.id))} na prateleira</span>
                  </button>
                </li>
              ))}
              {!achados.length && <li className="py-3 text-linha">Nenhum modelo encontrado.</li>}
            </ul>
          ) : (
            <div className="space-y-3 rounded-lg bg-papel p-3">
              <div className="flex items-center justify-between">
                <strong>{nomeModelo(modeloId)}</strong>
                <button type="button" className="text-sm font-semibold text-framboesa underline" onClick={() => { setModeloId(''); setTamanho(''); }}>Trocar</button>
              </div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tamanho">
                {TAMANHOS_ESTOQUE.filter((t) => t !== 'U' || naPrateleira(modeloId, 'U') > 0).map((t) => {
                  const tem = naPrateleira(modeloId, t);
                  return (
                    <button key={t} type="button" role="radio" aria-checked={tamanho === t} disabled={!tem}
                      onClick={() => { setTamanho(t); setQtd(Math.max(1, Math.min(falta, tem))); }}
                      className={cx('min-w-[64px] rounded-lg border px-3 py-2 text-center disabled:opacity-40',
                        tamanho === t ? 'border-tinta bg-tinta text-white' : 'border-borda bg-tecido')}>
                      <span className="block font-display text-lg font-bold">{t}</span>
                      <span className="num block text-xs">{num(tem)}</span>
                    </button>
                  );
                })}
              </div>
              {tamanho && (
                <>
                  <Contador valor={qtd} min={1} max={Math.max(1, limite)} onChange={setQtd} />
                  <Botao className="h-12 w-full text-base" disabled={ocupado || limite <= 0} onClick={colocar}><ShoppingBag size={20} />Colocar {num(qtd)} na sacola</Botao>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
