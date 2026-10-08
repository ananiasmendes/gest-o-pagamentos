'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Hand, Scissors, ShoppingBag } from 'lucide-react';
import { useData } from '@/lib/data';
import { useStatusBling } from '@/lib/api';
import { dataBR, diffDias, hoje, num } from '@/lib/format';
import { Carregando, Vazio, classeBotao } from '@/components/ui';
import { AvisoTabelas, haDias } from '@/components/separacao/comum';
import { DetalhePedido, pecas, useSeparacao } from '@/components/separacao/DetalhePedido';

const ROTULO: Record<string, string> = {
  pronto: 'Este pedido já foi separado e está esperando o faturamento.',
  enviado: 'Este pedido já saiu da fábrica.',
  cancelado: 'Este pedido foi cancelado no Bling.',
};

export default function PedidoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { pedidos, carregando, separacaoPronta } = useData();
  const { status } = useStatusBling();
  const { prateleira, calc } = useSeparacao();

  if (carregando) return <Carregando />;
  if (!separacaoPronta) return <AvisoTabelas />;

  const id = Number(params?.id);
  const voltar = (
    <Link href="/separacao" className={classeBotao('fantasma', '-ml-3 mb-2 px-3')}><ArrowLeft size={18} />Pedidos</Link>
  );
  const pedido = pedidos.find((p) => p.id === id);
  const sp = calc.pedidos.find((p) => p.pedido.id === id);

  if (!pedido) return <>{voltar}<Vazio titulo="Pedido não encontrado" /></>;
  if (!sp) return <>{voltar}<Vazio titulo={`Pedido ${pedido.numero ?? pedido.id}`}>{ROTULO[pedido.status] ?? ''}</Vazio></>;

  const h = hoje();
  const progresso = sp.total ? sp.sacola / sp.total : 0;

  return (
    <div className="mx-auto max-w-3xl">
      {voltar}
      <header className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight">Pedido {pedido.numero ?? pedido.id}</h1>
            <p className="truncate text-[17px] font-semibold">{pedido.cliente || 'Sem cliente'}</p>
          </div>
          <div className="shrink-0 text-right text-[13px] text-linha">
            <div>{haDias(diffDias(pedido.data, h))}</div>
            <div>{dataBR(pedido.data)}</div>
          </div>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-papel" role="progressbar" aria-valuemin={0} aria-valuemax={sp.total} aria-valuenow={sp.sacola}>
          <div className="h-full rounded-full bg-agua" style={{ width: `${Math.min(100, progresso * 100)}%` }} />
        </div>
        <div className="mt-1 text-[14px] text-linha"><span className="num font-semibold text-tinta">{num(sp.sacola)}</span> de {pecas(sp.total)} na sacola</div>
        {pedido.observacoes && <p className="mt-2 rounded-lg bg-papel px-3 py-2 text-[14px]">{pedido.observacoes}</p>}
      </header>

      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-semibold text-linha">
        <span className="inline-flex items-center gap-1.5"><ShoppingBag size={16} className="text-agua" />Já na sacola</span>
        <span className="inline-flex items-center gap-1.5"><Hand size={16} className="text-tinta" />Tem no estoque, pode pegar</span>
        <span className="inline-flex items-center gap-1.5"><Scissors size={16} className="text-ambar" />Falta produzir</span>
      </div>

      <section className="rounded-xl border border-borda bg-tecido px-4 pb-4">
        <DetalhePedido sp={sp} prateleira={prateleira} avisaBling={Boolean(status?.situacao_separado)} onFechado={() => router.push('/separacao')} />
      </section>
    </div>
  );
}
