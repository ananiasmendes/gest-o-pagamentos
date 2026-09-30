'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Check, FileDown, Pencil, Share2, Trash2 } from 'lucide-react';
import { useData, corOficina, TABELAS_DO_CORTE } from '@/lib/data';
import { supabase, mensagemErro } from '@/lib/supabase';
import {
  calcularEtiquetas, calcularMateriais, calcularRetornos, kgPorFolhaDoRisco, textoCompra, textoConsumo,
  COMPOSICAO_POR_FOLHA, TAGS_POR_FOLHA, type LinhaMaterial,
} from '@/lib/cortes/calc';
import { entregarPdf, pdfPedidoEtiquetas, pdfRomaneio, podeCompartilharArquivo, type BlocoRomaneio, type Cabecalho as CabPdf } from '@/lib/cortes/pdf';
import { dataBR, dec, hoje, num, pct } from '@/lib/format';
import { STATUS_CORTE, type StatusCorte } from '@/lib/types';
import { Botao, Cabecalho, Campo, Carregando, Modal, Painel, Pilulas, Selecao, Texto, Vazio, classeBotao, cx, useAviso } from '@/components/ui';
import { ChipStatus, sincronizarPagamentoCorte, useCorte } from '@/components/cortes/comum';

type Aba = 'resumo' | 'material' | 'romaneio' | 'retorno';
type EstadoItem = { incluido: boolean | null; feito: boolean };
const PROXIMO: Partial<Record<StatusCorte, { status: StatusCorte; rotulo: string }>> = {
  planejado: { status: 'cortado', rotulo: 'Marcar como cortado' },
  cortado: { status: 'enviado', rotulo: 'Marcar como enviado' },
  enviado: { status: 'concluido', rotulo: 'Concluir corte' },
};

/** Botão marcável (item comprado, etiqueta impressa). */
function Marcavel({ feito, onClick, children, desativado }: { feito: boolean; onClick: () => void; children: React.ReactNode; desativado?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={desativado} aria-pressed={feito}
      className={cx('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-40',
        feito ? 'border-agua bg-agua-claro text-agua' : 'border-borda bg-tecido text-tinta hover:border-linha/60')}>
      <span className={cx('flex h-4 w-4 items-center justify-center rounded border', feito ? 'border-agua bg-agua text-white' : 'border-linha/60')}>
        {feito && <Check size={12} strokeWidth={3} />}
      </span>
      <span className="num">{children}</span>
    </button>
  );
}

export default function CortePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ctx = useData();
  const { oficinas, modelos, cores, insumos, ficha, cortes, corteModelos, corteCores, corteItens, entradas, carregando, recarregar, nomeOficina } = ctx;
  const avisar = useAviso();
  const det = useCorte(id);
  const [aba, setAba] = useState<Aba>('resumo');
  const [locais, setLocais] = useState<Map<string, EstadoItem>>(new Map());
  const [modalStatus, setModalStatus] = useState<{ status: StatusCorte; data_cortado: string; data_enviado: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const calc = useMemo(() => {
    if (!det) return null;
    const { corte, cms, ccs, pecas } = det;
    const materiais = calcularMateriais(corte, cms, ccs, ficha, insumos, pecas);
    const etiquetas = calcularEtiquetas(cms, pecas);
    const retorno = calcularRetornos(cortes, corteModelos, corteCores, entradas).porCorte.get(corte.id) ?? null;
    const semFicha = cms.filter((m) => !ficha.some((f) => f.modelo_id === m.modelo_id));
    const oficinasDoCorte = Array.from(new Set(cms.map((m) => m.oficina_id)));
    return { materiais, etiquetas, retorno, semFicha, oficinasDoCorte };
  }, [det, ficha, insumos, cortes, corteModelos, corteCores, entradas]);

  if (carregando) return <Carregando />;
  if (!det || !calc) return <Vazio titulo="Corte não encontrado"><Link href="/cortes" className="font-semibold text-framboesa underline">Voltar para os cortes</Link></Vazio>;

  const { corte, cms, ccs, pecas } = det;
  const nomeCor = (cid: string) => cores.find((c) => c.id === cid)?.nome ?? '—';
  const nomeMod = (mid: string) => modelos.find((m) => m.id === mid)?.nome ?? '—';
  const coresPdf = ccs.map((c) => ({ id: c.cor_id, nome: nomeCor(c.cor_id) }));
  const kgFolha = kgPorFolhaDoRisco(corte);

  // ---------- itens marcáveis
  const item = (k: string): EstadoItem => {
    if (locais.has(k)) return locais.get(k)!;
    const i = corteItens.find((x) => x.corte_id === corte.id && x.chave === k);
    return { incluido: i?.incluido ?? null, feito: i?.feito ?? false };
  };
  const incluido = (l: LinhaMaterial) => item(`mat:${l.insumo.id}`).incluido ?? l.insumo.no_pedido;
  async function gravarItem(k: string, novo: EstadoItem) {
    const antes = item(k);
    setLocais((m) => new Map(m).set(k, novo));
    const { error } = await supabase.from('corte_itens').upsert({ corte_id: corte.id, chave: k, incluido: novo.incluido, feito: novo.feito });
    if (error) { setLocais((m) => new Map(m).set(k, antes)); avisar(mensagemErro(error), 'erro'); }
  }
  const alternarFeito = (k: string) => { const a = item(k); gravarItem(k, { ...a, feito: !a.feito }); };
  const alternarIncluido = (l: LinhaMaterial) => { const k = `mat:${l.insumo.id}`; gravarItem(k, { ...item(k), incluido: !incluido(l) }); };

  const materiaisPedido = calc.materiais.filter(incluido);
  const chavesCompra = materiaisPedido.flatMap((l) => Array.from(l.compra.keys()).map((c) => `mat:${l.insumo.id}:${c}`));
  const comprados = chavesCompra.filter((k) => item(k).feito).length;
  const chavesEtiqueta = [
    ...calc.etiquetas.tags.flatMap((t) => Object.keys(t.porTam).map((tam) => `tag:${t.modelo_id}:${tam}`)),
    ...calc.etiquetas.composicao.filter((c) => c.qtd).map((c) => `comp:${c.tamanho}`),
  ];
  const impressas = chavesEtiqueta.filter((k) => item(k).feito).length;

  // ---------- PDFs
  const cab = (titulo: string): CabPdf => ({
    titulo, corte: `${corte.nome}  ·  ${dataBR(corte.data)}`,
    detalhes: [`${num(pecas.total)} peças em ${num(pecas.totalFolhas)} folhas · ${cms.length} modelos · ${ccs.length} cores`
      + (corte.tecido ? ` · Tecido ${corte.tecido}` : '')],
  });
  const notaTecido = () => {
    const l = calc.materiais.find((x) => x.peloRisco);
    return l && kgFolha ? `${l.insumo.nome} calculado pelo risco: ${dec(kgFolha)} kg por folha (${dec(corte.comprimento_m!)} m x ${dec(corte.largura_m!)} m x ${dec(corte.gramatura_kg_m2!)} kg/m²).` : undefined;
  };
  const nomeArq = (s: string) => `${s} ${corte.nome}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-') + '.pdf';

  async function gerarPedido(modo: 'baixar' | 'compartilhar') {
    try {
      const doc = await pdfPedidoEtiquetas({
        cab: cab('Pedido de material'), cores: coresPdf, linhas: materiaisPedido, notaTecido: notaTecido(),
        tamanhos: pecas.tamanhos, composicao: calc!.etiquetas.composicao,
        tags: calc!.etiquetas.tags.map((t) => ({ ...t, modelo: nomeMod(t.modelo_id) })),
        feito: (k) => item(k).feito,
      });
      await entregarPdf(doc, nomeArq('pedido-e-etiquetas'), modo);
    } catch (e) { avisar(`Não foi possível gerar o PDF: ${(e as Error).message}`, 'erro'); }
  }

  function blocoRomaneio(of: string | null): BlocoRomaneio {
    const doOf = cms.filter((m) => m.oficina_id === of);
    return {
      oficina: of ? nomeOficina(of) : 'Sem oficina definida',
      total: pecas.porOficina.get(of) ?? 0,
      modelos: doOf.map((m) => ({ nome: nomeMod(m.modelo_id), porCorTam: pecas.mct.get(m.modelo_id) ?? new Map(), total: pecas.porModelo.get(m.modelo_id)?.total ?? 0 })),
      aviamentos: calcularMateriais(corte, cms, ccs, ficha, insumos, pecas, of).filter((l) => l.insumo.id !== corte.tecido_insumo_id),
    };
  }
  async function gerarRomaneio(ofs: (string | null)[], modo: 'baixar' | 'compartilhar') {
    try {
      const doc = await pdfRomaneio({ cab: cab('Romaneio'), cores: coresPdf, tamanhos: pecas.tamanhos, blocos: ofs.map(blocoRomaneio) });
      await entregarPdf(doc, nomeArq(ofs.length === 1 ? `romaneio-${ofs[0] ? nomeOficina(ofs[0]) : 'sem-oficina'}` : 'romaneio'), modo);
    } catch (e) { avisar(`Não foi possível gerar o PDF: ${(e as Error).message}`, 'erro'); }
  }

  // ---------- status e exclusão
  const abrirStatus = (status: StatusCorte) => setModalStatus({
    status, data_cortado: corte.data_cortado ?? hoje(), data_enviado: corte.data_enviado ?? hoje(),
  });
  async function salvarStatus() {
    if (!modalStatus) return;
    setOcupado(true);
    const s = modalStatus.status;
    const upd = {
      status: s,
      data_cortado: s === 'planejado' ? null : modalStatus.data_cortado,
      data_enviado: s === 'enviado' || s === 'concluido' ? modalStatus.data_enviado : null,
    };
    const anterior = { status: corte.status, data_cortado: corte.data_cortado, data_enviado: corte.data_enviado };
    try {
      const { error } = await supabase.from('cortes').update(upd).eq('id', corte.id);
      if (error) throw error;
      try {
        await sincronizarPagamentoCorte({ ...corte, ...upd }, cms, pecas, modelos);
      } catch (e) {
        await supabase.from('cortes').update(anterior).eq('id', corte.id);
        throw new Error(`${mensagemErro(e)}. Cadastre o preço de corte em Preços e tente de novo.`);
      }
      avisar(corte.cortador_id && s !== 'planejado' && corte.status === 'planejado'
        ? `Corte marcado como cortado e pagamento lançado para ${nomeOficina(corte.cortador_id)}.` : 'Status atualizado.');
      setModalStatus(null);
    } catch (e) { avisar(mensagemErro(e), 'erro'); }
    finally { setOcupado(false); recarregar([...TABELAS_DO_CORTE, 'entradas']); }
  }
  async function excluir() {
    const temPag = entradas.some((e) => e.corte_id === corte.id);
    if (!confirm(`Excluir ${corte.nome}?${temPag ? ' O pagamento de corte lançado por ele também será apagado.' : ''}`)) return;
    const r1 = await supabase.from('entradas').delete().eq('corte_id', corte.id);
    if (r1.error) { avisar(mensagemErro(r1.error), 'erro'); return; }
    const r2 = await supabase.from('cortes').delete().eq('id', corte.id);
    if (r2.error) { avisar(mensagemErro(r2.error), 'erro'); return; }
    avisar('Corte excluído.');
    await recarregar([...TABELAS_DO_CORTE, 'entradas']);
    router.push('/cortes');
  }

  const compartilha = podeCompartilharArquivo();
  const prox = PROXIMO[corte.status];
  const pagamentoCorte = entradas.filter((e) => e.corte_id === corte.id);

  return (
    <>
      <Cabecalho
        titulo={corte.nome}
        sub={<span className="flex flex-wrap items-center gap-2"><ChipStatus status={corte.status} />
          {dataBR(corte.data)}, corte: {nomeOficina(corte.cortador_id)}
          {corte.data_enviado && `, enviado em ${dataBR(corte.data_enviado)}`}</span>}
        acoes={<>
          {prox && <Botao variante="destaque" onClick={() => abrirStatus(prox.status)}>{prox.rotulo}</Botao>}
          <Link href={`/cortes/${corte.id}/editar`} className={classeBotao('secundario')}><Pencil size={16} />Editar</Link>
        </>}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Pilulas rotulo="Seção" valor={aba} onChange={setAba} opcoes={[
          { valor: 'resumo', rotulo: 'Resumo' }, { valor: 'material', rotulo: 'Material e etiquetas' },
          { valor: 'romaneio', rotulo: 'Romaneio' }, { valor: 'retorno', rotulo: 'Retorno' },
        ]} />
        <button className="text-sm font-semibold text-linha underline" onClick={() => abrirStatus(corte.status)}>Alterar status</button>
      </div>

      {aba === 'resumo' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Painel titulo="Peças por modelo">
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <table className="w-full min-w-[480px] text-[14px]">
                <thead><tr className="text-left text-[12px] text-linha">
                  <th className="pb-2 font-semibold">Modelo</th><th className="pb-2 font-semibold">Oficina</th>
                  {pecas.tamanhos.map((t) => <th key={t} className="pb-2 text-right font-semibold">{t}</th>)}
                  <th className="pb-2 text-right font-semibold">Peças</th>
                </tr></thead>
                <tbody className="num">
                  {cms.map((m) => (
                    <tr key={m.id} className="border-t border-borda">
                      <td className="py-2 font-semibold">{nomeMod(m.modelo_id)}</td>
                      <td className="py-2">
                        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: corOficina(oficinas, m.oficina_id) }} />
                        {m.oficina_id ? nomeOficina(m.oficina_id) : <span className="text-ambar">sem oficina</span>}
                      </td>
                      {pecas.tamanhos.map((t) => <td key={t} className="py-2 text-right text-linha">{m.grade[t] || ''}</td>)}
                      <td className="py-2 text-right font-semibold">{num(pecas.porModelo.get(m.modelo_id)?.total ?? 0)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-borda font-semibold">
                    <td className="py-2" colSpan={2}>Total</td>
                    {pecas.tamanhos.map((t) => <td key={t} className="py-2 text-right">{num(pecas.porTam[t] ?? 0)}</td>)}
                    <td className="py-2 text-right">{num(pecas.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-linha">Nas linhas, a grade por folha do risco. No total, as peças do corte.</p>
          </Painel>
          <div className="space-y-4">
            <Painel titulo="Folhas por cor">
              <ul className="num divide-y divide-borda text-[14px]">
                {ccs.map((c) => (
                  <li key={c.id} className="flex justify-between py-1.5">
                    <span className="font-semibold">{nomeCor(c.cor_id)}</span>
                    <span>{c.folhas} folhas · {num(pecas.porCor.get(c.cor_id) ?? 0)} peças</span>
                  </li>
                ))}
                <li className="flex justify-between py-1.5 font-semibold"><span>Total</span><span>{num(pecas.totalFolhas)} folhas</span></li>
              </ul>
            </Painel>
            {(corte.comprimento_m || corte.tecido) && (
              <Painel titulo="Risco">
                <dl className="num grid grid-cols-2 gap-y-1 text-[14px]">
                  {corte.tecido && <><dt className="text-linha">Tecido</dt><dd className="text-right font-semibold">{corte.tecido}</dd></>}
                  {corte.comprimento_m && <><dt className="text-linha">Medidas</dt><dd className="text-right">{dec(corte.comprimento_m)} × {dec(corte.largura_m ?? 0)} m</dd></>}
                  {corte.aproveitamento && <><dt className="text-linha">Aproveitamento</dt><dd className="text-right">{dec(corte.aproveitamento)}%</dd></>}
                  {kgFolha && <><dt className="text-linha">Tecido</dt><dd className="text-right">{dec(kgFolha)} kg/folha</dd>
                    <dt className="text-linha">Total</dt><dd className="text-right font-semibold">{dec(Math.round(kgFolha * pecas.totalFolhas * 10) / 10)} kg</dd></>}
                </dl>
              </Painel>
            )}
            {pagamentoCorte.length > 0 && (
              <Painel titulo="Pagamento do corte">
                <ul className="num text-[14px]">
                  {pagamentoCorte.map((e) => (
                    <li key={e.id} className="flex justify-between py-1">
                      <span>{num(e.quantidade)} × {e.tipo.toLowerCase()}</span><span className="font-semibold">R$ {dec(e.valor_total)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-linha">Lançado em Entradas para {nomeOficina(corte.cortador_id)}.</p>
              </Painel>
            )}
            {corte.observacao && <Painel titulo="Observação"><p className="text-[14px]">{corte.observacao}</p></Painel>}
            <Botao variante="perigo" className="w-full" onClick={excluir}><Trash2 size={16} />Excluir corte</Botao>
          </div>
        </div>
      )}

      {aba === 'material' && (
        <div className="space-y-4">
          <Painel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[14px]">
                <div><strong className="num">{comprados}</strong> de <span className="num">{chavesCompra.length}</span> itens de material comprados</div>
                <div><strong className="num">{impressas}</strong> de <span className="num">{chavesEtiqueta.length}</span> etiquetas impressas</div>
              </div>
              <div className="flex gap-2">
                <Botao onClick={() => gerarPedido('baixar')}><FileDown size={17} />PDF do pedido e etiquetas</Botao>
                {compartilha && <Botao variante="secundario" aria-label="Compartilhar PDF" onClick={() => gerarPedido('compartilhar')}><Share2 size={17} /></Botao>}
              </div>
            </div>
          </Painel>

          {calc.semFicha.length > 0 && (
            <div className="rounded-lg bg-ambar-claro px-4 py-3 text-[14px] text-ambar">
              Sem ficha técnica, estes modelos não entram no material: {calc.semFicha.map((m) => nomeMod(m.modelo_id)).join(', ')}.{' '}
              <Link href="/ficha" className="font-semibold underline">Preencher ficha técnica</Link>
            </div>
          )}

          <Painel titulo="Material para comprar">
            <p className="mb-3 text-[14px] text-linha">Desmarque o que não precisa pedir. Toque em cada quantidade quando comprar.</p>
            {notaTecido() && <p className="mb-3 rounded-lg bg-indigo-claro px-3 py-2 text-[13px] text-indigo">{notaTecido()}</p>}
            <ul className="divide-y divide-borda">
              {calc.materiais.map((l) => {
                const inc = incluido(l);
                return (
                  <li key={l.insumo.id} className={cx('py-3', !inc && 'opacity-50')}>
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#2A1614]" checked={inc} onChange={() => alternarIncluido(l)} />
                        <span>
                          <span className="block font-semibold">{l.insumo.nome}{l.peloRisco && <span className="ml-1.5 text-[12px] font-medium text-indigo">pelo risco</span>}</span>
                          <span className="block text-[12px] text-linha">consumo {textoConsumo(l.consumoTotal, l.insumo)}</span>
                        </span>
                      </label>
                      <span className="num shrink-0 text-right font-semibold">{textoCompra(l.compraTotal, l.insumo)}</span>
                    </div>
                    {inc && (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
                        {Array.from(l.compra).map(([cor, q]) => (
                          <Marcavel key={cor} feito={item(`mat:${l.insumo.id}:${cor}`).feito} onClick={() => alternarFeito(`mat:${l.insumo.id}:${cor}`)}>
                            {cor === '*' ? 'Todas as cores' : nomeCor(cor)}: {textoCompra(q, l.insumo)}
                          </Marcavel>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {!calc.materiais.length && <p className="text-linha">Nenhum material calculado. Preencha a ficha técnica dos modelos.</p>}
          </Painel>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Painel titulo={`Tags (${TAGS_POR_FOLHA} por folha)`}>
              <ul className="divide-y divide-borda">
                {calc.etiquetas.tags.map((t) => (
                  <li key={t.modelo_id} className="py-2.5">
                    <div className="flex justify-between text-[14px]">
                      <span className="font-semibold">{nomeMod(t.modelo_id)}</span>
                      <span className="num text-linha">{num(t.qtd)} tags · {num(t.folhas)} folhas</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {Object.entries(t.porTam).map(([tam, v]) => (
                        <Marcavel key={tam} feito={item(`tag:${t.modelo_id}:${tam}`).feito} onClick={() => alternarFeito(`tag:${t.modelo_id}:${tam}`)}>
                          {tam}: {num(v.qtd)} ({num(v.folhas)} fl.)
                        </Marcavel>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="num mt-2 text-[13px] font-semibold">Total: {num(calc.etiquetas.totais.tags)} tags em {num(calc.etiquetas.totais.folhasTag)} folhas</p>
            </Painel>
            <Painel titulo={`Composição (${COMPOSICAO_POR_FOLHA} por folha)`} className="lg:self-start">
              <div className="flex flex-col gap-1.5">
                {calc.etiquetas.composicao.filter((c) => c.qtd).map((c) => (
                  <Marcavel key={c.tamanho} feito={item(`comp:${c.tamanho}`).feito} onClick={() => alternarFeito(`comp:${c.tamanho}`)}>
                    {c.tamanho}: {num(c.qtd)} etiquetas ({num(c.folhas)} folhas)
                  </Marcavel>
                ))}
              </div>
              <p className="num mt-3 text-[13px] font-semibold">Total: {num(calc.etiquetas.totais.folhasComposicao)} folhas</p>
            </Painel>
          </div>
        </div>
      )}

      {aba === 'romaneio' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Botao onClick={() => gerarRomaneio(calc.oficinasDoCorte, 'baixar')}><FileDown size={17} />PDF de todas as oficinas</Botao>
          </div>
          {calc.oficinasDoCorte.map((of) => {
            const b = blocoRomaneio(of);
            return (
              <Painel key={of ?? 'x'} titulo={<span><span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: corOficina(oficinas, of) }} />{b.oficina}</span>}
                acao={<div className="flex gap-1.5">
                  <Botao variante="secundario" className="h-9 px-3 text-sm" onClick={() => gerarRomaneio([of], 'baixar')}><FileDown size={15} />PDF</Botao>
                  {compartilha && <Botao variante="secundario" className="h-9 px-3 text-sm" aria-label="Compartilhar" onClick={() => gerarRomaneio([of], 'compartilhar')}><Share2 size={15} /></Botao>}
                </div>}>
                <p className="num mb-3 text-[14px] text-linha">{num(b.total)} peças, {b.modelos.length} modelos</p>
                <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                  <table className="w-full min-w-[520px] text-[13px]">
                    <thead><tr className="text-left text-[12px] text-linha">
                      <th className="pb-1.5 font-semibold">Modelo</th><th className="pb-1.5 font-semibold">Tam.</th>
                      {ccs.map((c) => <th key={c.id} className="pb-1.5 text-right font-semibold">{nomeCor(c.cor_id)}</th>)}
                      <th className="pb-1.5 text-right font-semibold">Total</th>
                    </tr></thead>
                    <tbody className="num">
                      {b.modelos.flatMap((m, mi) => pecas.tamanhos.filter((t) => ccs.some((c) => m.porCorTam.get(c.cor_id)?.[t])).map((t, ti) => (
                        <tr key={`${mi}-${t}`} className={cx(ti === 0 && 'border-t border-borda')}>
                          <td className="py-1 font-semibold">{ti === 0 ? m.nome : ''}</td>
                          <td className="py-1">{t}</td>
                          {ccs.map((c) => <td key={c.id} className="py-1 text-right">{m.porCorTam.get(c.cor_id)?.[t] ?? ''}</td>)}
                          <td className="py-1 text-right font-semibold">{num(ccs.reduce((s, c) => s + (m.porCorTam.get(c.cor_id)?.[t] ?? 0), 0))}</td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
                {b.aviamentos.length > 0 && (
                  <>
                    <h3 className="mb-1.5 mt-4 text-[15px] font-bold">Aviamentos para enviar</h3>
                    <ul className="grid gap-x-6 text-[13px] sm:grid-cols-2">
                      {b.aviamentos.map((a) => (
                        <li key={a.insumo.id} className="flex justify-between border-t border-borda py-1.5">
                          <span>{a.insumo.nome}</span><span className="num font-semibold">{textoConsumo(a.consumoTotal, a.insumo)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Painel>
            );
          })}
        </div>
      )}

      {aba === 'retorno' && (
        corte.status === 'planejado' || !calc.retorno ? (
          <Vazio titulo="O retorno começa depois do corte">Marque o corte como cortado. As entradas de costura lançadas em Pagamentos vão abatendo daqui.</Vazio>
        ) : (
          <Painel>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="num font-display text-3xl font-extrabold">{num(calc.retorno.esperado - calc.retorno.recebido)}</span>
                <span className="ml-2 text-linha">peças ainda com as oficinas</span>
              </div>
              <span className="num text-[14px] text-linha">
                {num(calc.retorno.recebido)} de {num(calc.retorno.esperado)} voltaram ({pct(calc.retorno.esperado ? calc.retorno.recebido / calc.retorno.esperado : 0)})
                {calc.retorno.ultimaEntrada && `, última entrega ${dataBR(calc.retorno.ultimaEntrada)}`}
              </span>
            </div>
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <table className="w-full min-w-[480px] text-[14px]">
                <thead><tr className="text-left text-[12px] text-linha">
                  <th className="pb-2 font-semibold">Modelo</th><th className="pb-2 font-semibold">Oficina</th>
                  {pecas.tamanhos.map((t) => <th key={t} className="pb-2 text-right font-semibold">{t}</th>)}
                  <th className="pb-2 text-right font-semibold">Falta</th>
                </tr></thead>
                <tbody className="num">
                  {cms.map((m) => {
                    const d = calc.retorno!.detalhe.get(m.modelo_id) ?? {};
                    const falta = Object.values(d).reduce((s, [e, r]) => s + e - r, 0);
                    return (
                      <tr key={m.id} className="border-t border-borda">
                        <td className="py-2 font-semibold">{nomeMod(m.modelo_id)}</td>
                        <td className="py-2">{m.oficina_id ? nomeOficina(m.oficina_id) : '—'}</td>
                        {pecas.tamanhos.map((t) => (
                          <td key={t} className={cx('py-2 text-right', d[t] && d[t][1] >= d[t][0] && 'text-agua')}>
                            {d[t] ? `${num(d[t][1])}/${num(d[t][0])}` : ''}
                          </td>
                        ))}
                        <td className={cx('py-2 text-right font-semibold', falta === 0 && 'text-agua')}>{falta === 0 ? 'ok' : num(falta)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-linha">
              Recebido/cortado por tamanho. As entradas de costura de cada oficina abatem primeiro o corte mais antigo com peças em aberto daquele modelo e tamanho.
            </p>
          </Painel>
        )
      )}

      <Modal aberto={!!modalStatus} titulo="Status do corte" onFechar={() => setModalStatus(null)}
        rodape={<><div className="flex-1" /><Botao variante="secundario" onClick={() => setModalStatus(null)}>Cancelar</Botao>
          <Botao onClick={salvarStatus} disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar'}</Botao></>}>
        {modalStatus && (
          <div className="grid gap-4">
            <Campo rotulo="Status">
              <Selecao value={modalStatus.status} onChange={(e) => setModalStatus({ ...modalStatus, status: e.target.value as StatusCorte })}>
                {STATUS_CORTE.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
              </Selecao>
            </Campo>
            {modalStatus.status !== 'planejado' && (
              <Campo rotulo="Data do corte"><Texto type="date" value={modalStatus.data_cortado} onChange={(e) => setModalStatus({ ...modalStatus, data_cortado: e.target.value || hoje() })} /></Campo>
            )}
            {(modalStatus.status === 'enviado' || modalStatus.status === 'concluido') && (
              <Campo rotulo="Enviado às oficinas em"><Texto type="date" value={modalStatus.data_enviado} onChange={(e) => setModalStatus({ ...modalStatus, data_enviado: e.target.value || hoje() })} /></Campo>
            )}
            <p className="text-[14px] text-linha">
              {corte.cortador_id
                ? modalStatus.status === 'planejado'
                  ? `Voltar para planejado apaga o pagamento de corte lançado para ${nomeOficina(corte.cortador_id)}.`
                  : `O pagamento de ${num(pecas.total)} peças cortadas fica lançado para ${nomeOficina(corte.cortador_id)} na data do corte.`
                : 'Cortado na fábrica: não gera pagamento de corte.'}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
