'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Pencil } from 'lucide-react';
import { useData, corOficina } from '@/lib/data';
import { brl, chave, dataBR, dec, diaSemana, num } from '@/lib/format';
import { filtrarEntradas } from '@/lib/kpis';
import { baixarPlanilha } from '@/lib/exportar';
import type { Entrada } from '@/lib/types';
import { BarraFiltro, useFiltro } from '@/components/FiltroPeriodo';
import EditarEntrada from '@/components/EditarEntrada';
import { Botao, classeBotao, Cabecalho, Campo, Carregando, Selecao, Texto, Vazio } from '@/components/ui';

const PASSO = 60; // dias exibidos por vez

export default function EntradasPage() {
  const { oficinas, entradas, carregando, nomeOficina, nomeModelo } = useData();
  const f = useFiltro('mes');
  const [operacao, setOperacao] = useState('');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Entrada | null>(null);
  const [limite, setLimite] = useState(PASSO);

  const lista = useMemo(() => {
    const k = chave(busca);
    return filtrarEntradas(entradas, f.filtro)
      .filter((e) => !operacao || e.operacao === operacao)
      .filter((e) => !k || chave(nomeModelo(e)).includes(k) || chave(e.observacao).includes(k))
      .sort((a, b) => b.data.localeCompare(a.data) || a.oficina_id.localeCompare(b.oficina_id));
  }, [entradas, f.filtro, operacao, busca, nomeModelo]);

  const dias = useMemo(() => {
    const m = new Map<string, Entrada[]>();
    for (const e of lista) (m.get(e.data) ?? m.set(e.data, []).get(e.data)!).push(e);
    return Array.from(m);
  }, [lista]);

  const totPecas = lista.filter((e) => e.operacao === 'Costura').reduce((s, e) => s + e.quantidade, 0);
  const totValor = lista.reduce((s, e) => s + e.valor_total, 0);

  function exportar() {
    baixarPlanilha('entradas.xlsx', [{
      nome: 'Entradas',
      linhas: lista.map((e) => ({
        Data: dataBR(e.data), Oficina: nomeOficina(e.oficina_id),
        Modelo: e.operacao === 'Corte' ? 'Corte' : nomeModelo(e), Tamanho: e.tamanho ?? (e.operacao === 'Corte' ? 'Corte' : ''),
        Quantidade: e.quantidade, Tipo: e.tipo, 'Operação': e.operacao,
        'Valor unitário': e.valor_unitario, 'Valor Total': Number(e.valor_total.toFixed(2)), 'Observação': e.observacao ?? '',
      })),
    }]);
  }

  if (carregando) return <Carregando />;

  return (
    <>
      <Cabecalho titulo="Entradas" sub="Toque numa linha para corrigir ou excluir."
        acoes={<>
          <Botao variante="secundario" onClick={exportar} disabled={!lista.length}><Download size={17} />Exportar</Botao>
          <Link href="/lancar" className={classeBotao()}>Lançar</Link>
        </>} />

      <BarraFiltro f={f} oficinas={oficinas} />
      <div className="-mt-2 mb-5 grid grid-cols-2 gap-3 md:flex">
        <Campo rotulo="Operação" className="md:w-48">
          <Selecao value={operacao} onChange={(e) => setOperacao(e.target.value)}>
            <option value="">Costura e corte</option><option>Costura</option><option>Corte</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Buscar modelo" className="md:w-64">
          <Texto value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Safira" />
        </Campo>
      </div>

      {!lista.length ? (
        <Vazio titulo="Nenhuma entrada com esses filtros">Mude o período ou <Link href="/lancar" className="font-semibold text-framboesa underline">lance uma entrada</Link>.</Vazio>
      ) : (
        <>
          <p className="num mb-3 text-[15px] text-linha">
            {num(lista.length)} linhas, {num(totPecas)} peças costuradas, <strong className="text-tinta">{brl(totValor)}</strong>
          </p>
          <div className="space-y-4">
            {dias.slice(0, limite).map(([data, es]) => (
              <section key={data} className="overflow-hidden rounded-xl border border-borda bg-tecido">
                <header className="flex items-baseline justify-between bg-papel/70 px-4 py-2.5">
                  <h2 className="text-[15px] font-bold">{dataBR(data)} <span className="font-sans text-[13px] font-medium text-linha">{diaSemana(data)}</span></h2>
                  <span className="num text-[14px] font-semibold">{brl(es.reduce((s, e) => s + e.valor_total, 0))}</span>
                </header>
                <ul className="divide-y divide-borda">
                  {es.map((e) => (
                    <li key={e.id}>
                      <button onClick={() => setEditando(e)}
                        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 px-4 py-2.5 text-left hover:bg-papel/60 md:grid-cols-[9rem_1fr_3rem_5rem_5.5rem_6.5rem_1.5rem]">
                        <span className="hidden items-center gap-2 text-[14px] md:flex">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: corOficina(oficinas, e.oficina_id) }} />{nomeOficina(e.oficina_id)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{nomeModelo(e)}</span>
                          <span className="block text-[13px] text-linha md:hidden">
                            {nomeOficina(e.oficina_id)}{e.tamanho ? `, ${e.tamanho}` : ''}, {num(e.quantidade)} × R$ {dec(e.valor_unitario)}
                          </span>
                          {e.observacao && <span className="block truncate text-[12px] text-linha">{e.observacao}</span>}
                        </span>
                        <span className="hidden text-center font-semibold md:block">{e.tamanho ?? ''}</span>
                        <span className="num hidden text-right md:block">{num(e.quantidade)}</span>
                        <span className="num hidden text-right text-linha md:block">R$ {dec(e.valor_unitario)}</span>
                        <span className="num text-right font-semibold">{brl(e.valor_total)}</span>
                        <Pencil size={15} className="hidden text-linha md:block" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {dias.length > limite && (
            <div className="mt-4 text-center"><Botao variante="secundario" onClick={() => setLimite((l) => l + PASSO)}>Mostrar dias anteriores</Botao></div>
          )}
        </>
      )}

      <EditarEntrada entrada={editando} onFechar={() => setEditando(null)} />
    </>
  );
}
