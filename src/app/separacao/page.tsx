'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Hand, RefreshCw, Scissors, ShoppingBag, Undo2 } from 'lucide-react';
import { useData, TABELAS_DA_SEPARACAO } from '@/lib/data';
import { api, sincronizarBling, useStatusBling } from '@/lib/api';
import { type SituacaoPedido } from '@/lib/separacao';
import { dataBR, diffDias, hoje, num } from '@/lib/format';
import type { Pedido } from '@/lib/types';
import { Botao, Cabecalho, Carregando, Painel, Pilulas, Vazio, cx, useAviso } from '@/components/ui';
import { AvisoTabelas, haDias, haTempo } from '@/components/separacao/comum';
import { pecas, useSeparacao } from '@/components/separacao/DetalhePedido';

type Filtro = 'todos' | 'pegar' | 'fechar' | 'esperando' | 'separados';

function Numero({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <div className="min-w-0 py-2 md:px-5 md:py-1">
      <div className="text-[13px] font-semibold text-linha">{rotulo}</div>
      <div className={cx('num font-display text-[26px] font-bold leading-tight', cor)}>{valor}</div>
      {detalhe && <div className="text-xs text-linha">{detalhe}</div>}
    </div>
  );
}

/** Uma linha da lista: toque para abrir o pedido e separar as peças. */
function LinhaPedido({ sp, h }: { sp: SituacaoPedido; h: string }) {
  const { pedido } = sp;
  const progresso = sp.total ? sp.sacola / sp.total : 0;
  return (
    <li>
      <Link href={`/separacao/${pedido.id}`}
        className={cx('flex items-center gap-3 rounded-xl border bg-tecido px-4 py-3 transition-colors hover:border-linha/50',
          sp.completo ? 'border-agua' : 'border-borda')}>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display text-lg font-bold">Pedido {pedido.numero ?? pedido.id}</span>
            <span className="shrink-0 text-[13px] text-linha">{haDias(diffDias(pedido.data, h))}</span>
          </div>
          <div className="truncate text-[15px]">{pedido.cliente || 'Sem cliente'}</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-papel">
            <div className="h-full rounded-full bg-agua" style={{ width: `${Math.min(100, progresso * 100)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold">
            <span className="inline-flex items-center gap-1 text-agua"><ShoppingBag size={14} />{num(sp.sacola)} de {num(sp.total)}</span>
            {sp.completo ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-agua px-2.5 py-0.5 text-white"><Check size={14} />Pronto para fechar</span>
            ) : (
              <>
                {sp.pegar > 0 && <span className="inline-flex items-center gap-1 text-tinta"><Hand size={14} />Pegar {num(sp.pegar)}</span>}
                {sp.escolher > 0 && <span className="inline-flex items-center gap-1 text-tinta"><Hand size={14} />Escolher {num(sp.escolher)}</span>}
                {sp.produzir > 0 && <span className="inline-flex items-center gap-1 text-ambar"><Scissors size={14} />Falta produzir {num(sp.produzir)}</span>}
              </>
            )}
          </div>
        </div>
        <ChevronRight size={22} className="shrink-0 text-linha" aria-hidden="true" />
      </Link>
    </li>
  );
}

export default function SeparacaoPage() {
  const { pedidos, sacola, carregando, separacaoPronta, recarregar } = useData();
  const avisar = useAviso();
  const { status, recarregar: recarregarStatus } = useStatusBling();
  const { calc } = useSeparacao();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [sincronizando, setSincronizando] = useState(false);

  // ---------- Bling -----------------------------------------------------
  const rodando = useRef(false);
  const sincronizar = useCallback(async (silencioso: boolean) => {
    if (rodando.current) return;
    rodando.current = true; setSincronizando(true);
    try {
      const n = await sincronizarBling();
      await recarregar(TABELAS_DA_SEPARACAO);
      if (!silencioso) avisar(n ? `${num(n)} ${n === 1 ? 'pedido atualizado' : 'pedidos atualizados'}.` : 'Tudo em dia com o Bling.');
    } catch (e) {
      if (!silencioso) avisar((e as Error).message, 'erro');
    } finally {
      rodando.current = false; setSincronizando(false); recarregarStatus();
    }
  }, [recarregar, recarregarStatus, avisar]);

  const pronto = Boolean(status?.conectado && status.situacoes_abertas.length);
  useEffect(() => {
    if (!pronto || !separacaoPronta) return;
    sincronizar(true);
    const t = setInterval(() => { if (document.visibilityState === 'visible') sincronizar(true); }, 120000);
    return () => clearInterval(t);
  }, [pronto, separacaoPronta, sincronizar]);

  async function reabrir(p: Pedido) {
    if (!confirm(`Reabrir o pedido ${p.numero ?? ''}? Ele volta para a lista de separação e o Bling volta para a situação anterior.`)) return;
    try {
      const r = await api<{ aviso: string | null }>('/api/bling/pedido', { body: { id: p.id, acao: 'reabrir' } });
      await recarregar(['pedidos']);
      avisar(r.aviso ?? 'Pedido reaberto.', r.aviso ? 'erro' : 'ok');
    } catch (e) { avisar((e as Error).message, 'erro'); }
  }

  if (carregando) return <Carregando />;
  if (!separacaoPronta) return <><Cabecalho titulo="Separação de pedidos" /><AvisoTabelas /></>;

  const h = hoje();
  const abertos = calc.pedidos;
  const separados = pedidos.filter((p) => p.status === 'pronto').sort((a, b) => (b.pronto_em ?? '').localeCompare(a.pronto_em ?? ''));
  const tot = {
    pegar: abertos.reduce((s, p) => s + p.pegar, 0),
    produzir: abertos.reduce((s, p) => s + p.produzir, 0),
    fechar: abertos.filter((p) => p.completo).length,
  };
  const passa = (p: SituacaoPedido) =>
    filtro === 'todos' ? true : filtro === 'pegar' ? p.pegar > 0 || p.escolher > 0 : filtro === 'fechar' ? p.completo : filtro === 'esperando' ? p.produzir > 0 : false;
  const lista = abertos.filter(passa);

  return (
    <>
      <Cabecalho
        titulo="Separação de pedidos"
        sub={status?.conectado ? `Atualizado com o Bling ${haTempo(status.ultima_sync)}` : undefined}
        acoes={status?.conectado && (
          <Botao variante="secundario" onClick={() => sincronizar(false)} disabled={sincronizando}>
            <RefreshCw size={18} className={sincronizando ? 'animate-spin' : ''} />{sincronizando ? 'Atualizando…' : 'Atualizar'}
          </Botao>
        )}
      />

      {status && !status.conectado && (
        <div className="mb-5 rounded-xl border border-ambar/40 bg-ambar-claro px-5 py-4 text-[15px]">
          <p className="font-display text-lg font-bold">Falta conectar ao Bling</p>
          <p className="mt-1">Os pedidos chegam sozinhos depois da conexão. <Link href="/bling" className="font-semibold text-framboesa underline">Abrir Integração Bling</Link>.</p>
        </div>
      )}
      {status?.conectado && !status.situacoes_abertas.length && (
        <div className="mb-5 rounded-xl border border-ambar/40 bg-ambar-claro px-5 py-4 text-[15px]">
          Escolha quais situações de pedido aparecem aqui em <Link href="/bling" className="font-semibold text-framboesa underline">Integração Bling</Link>.
        </div>
      )}
      {status?.ultimo_erro && (
        <div className="mb-5 rounded-lg bg-framboesa-claro px-4 py-3 text-sm text-framboesa-escuro">Última atualização com o Bling falhou: {status.ultimo_erro}</div>
      )}

      {(abertos.length > 0 || separados.length > 0) && (
        <Painel className="mb-5">
          <div className="grid grid-cols-2 divide-borda md:grid-cols-4 md:divide-x">
            <Numero rotulo="Pedidos em aberto" valor={num(abertos.length)} />
            <Numero rotulo="Para pegar agora" valor={num(tot.pegar)} detalhe="peças que já estão no estoque" />
            <Numero rotulo="Falta produzir" valor={num(tot.produzir)} detalhe="peças que os pedidos esperam" cor={tot.produzir ? 'text-ambar' : undefined} />
            <Numero rotulo="Prontos para fechar" valor={num(tot.fechar)} detalhe="sacola completa" cor={tot.fechar ? 'text-agua' : undefined} />
          </div>
        </Painel>
      )}

      <div className="mb-4">
        <Pilulas rotulo="Filtro" valor={filtro} onChange={setFiltro} opcoes={[
          { valor: 'todos', rotulo: `Todos (${abertos.length})` },
          { valor: 'pegar', rotulo: `Dá para pegar (${abertos.filter((p) => p.pegar > 0 || p.escolher > 0).length})` },
          { valor: 'fechar', rotulo: `Prontos para fechar (${tot.fechar})` },
          { valor: 'esperando', rotulo: `Esperando produção (${abertos.filter((p) => p.produzir > 0).length})` },
          { valor: 'separados', rotulo: `Já separados (${separados.length})` },
        ]} />
      </div>

      {filtro === 'separados' ? (
        !separados.length ? <Vazio titulo="Nenhum pedido separado aguardando envio" /> : (
          <ul className="mx-auto grid max-w-3xl gap-2">
            {separados.map((p) => {
              const qtd = sacola.filter((s) => s.pedido_id === p.id).reduce((t, s) => t + s.quantidade, 0);
              return (
                <li key={p.id} className="rounded-xl border border-borda bg-tecido px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display text-lg font-bold">Pedido {p.numero ?? p.id}</div>
                      <div className="truncate text-[15px]">{p.cliente || 'Sem cliente'}</div>
                    </div>
                    <span className={cx('shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold', p.bling_marcado ? 'bg-agua-claro text-agua' : 'bg-ambar-claro text-ambar')}>
                      {p.bling_marcado ? 'Bling avisado' : 'Bling ainda não avisado'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[14px] text-linha">
                    <span>{pecas(qtd)} na sacola{p.pronto_em ? `, separado em ${dataBR(p.pronto_em.slice(0, 10))}` : ''}</span>
                    <Botao variante="fantasma" className="h-9 px-3 text-sm" onClick={() => reabrir(p)}><Undo2 size={16} />Reabrir</Botao>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : !abertos.length ? (
        <Vazio titulo="Nenhum pedido em aberto">{status?.conectado ? 'Quando entrar um pedido novo no Bling, ele aparece aqui.' : 'Conecte ao Bling para os pedidos aparecerem.'}</Vazio>
      ) : !lista.length ? (
        <Vazio titulo="Nenhum pedido neste filtro" />
      ) : (
        <ul className="mx-auto grid max-w-3xl gap-2">
          {lista.map((sp) => <LinhaPedido key={sp.pedido.id} sp={sp} h={h} />)}
        </ul>
      )}
    </>
  );
}
