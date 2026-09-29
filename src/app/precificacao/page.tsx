'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Plus, Trash2 } from 'lucide-react';
import { useData } from '@/lib/data';
import { supabase, mensagemErro } from '@/lib/supabase';
import {
  custoModelo, lucroNoPreco, mediaMensalProduzida, percentualTabela, precoSugerido, precoUnitario,
  producaoRecente, rateioPorPeca, somaCustosFixos, type CustoModelo, type ParametrosPreco,
} from '@/lib/precificacao';
import { baixarPlanilha } from '@/lib/exportar';
import { brl, chave, dataBR, hoje, num, parseNumero } from '@/lib/format';
import { CATEGORIAS_INSUMO, TIPOS, type Insumo, type TabelaPreco } from '@/lib/types';
import { Botao, Cabecalho, Campo, Carregando, Modal, Painel, Pilulas, Selecao, Texto, cx, useAviso } from '@/components/ui';

type Aba = 'precos' | 'custos' | 'materia';
const R = (n: number | null | undefined, casas = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pctTxt = (n: number | null) => (n === null ? '—' : `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`);
const semZeros = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4, useGrouping: false });

/** Campo numérico que grava ao sair (blur/Enter). */
function CampoNum({ valor, onSalvar, prefixo, sufixo, largura = 'w-24', ariaLabel, destaque }: {
  valor: number | null | undefined; onSalvar: (v: number | null) => Promise<void> | void; prefixo?: string; sufixo?: string;
  largura?: string; ariaLabel: string; destaque?: boolean;
}) {
  const [t, setT] = useState(valor === null || valor === undefined ? '' : semZeros(valor));
  useEffect(() => { setT(valor === null || valor === undefined ? '' : semZeros(valor)); }, [valor]);
  const sair = async () => {
    const v = t.trim() === '' ? null : parseNumero(t);
    if (t.trim() !== '' && v === null) { setT(valor == null ? '' : semZeros(valor)); return; }
    if (v === valor || (v !== null && valor != null && Math.abs(v - valor) < 1e-9)) return;
    await onSalvar(v);
  };
  return (
    <span className="relative inline-flex items-center">
      {prefixo && <span className="pointer-events-none absolute left-2 text-[12px] text-linha">{prefixo}</span>}
      <input inputMode="decimal" value={t} aria-label={ariaLabel} onChange={(e) => setT(e.target.value)} onBlur={sair}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className={cx('num h-9 rounded-lg border bg-tecido text-right text-[14px] font-semibold focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo/15',
          largura, prefixo ? 'pl-7 pr-2' : 'px-2', destaque ? 'border-ambar/60 bg-ambar-claro' : 'border-borda')} />
      {sufixo && <span className="ml-1 text-[12px] text-linha">{sufixo}</span>}
    </span>
  );
}

function AvisoMigracaoPreco() {
  return (
    <div className="rounded-xl border border-ambar/40 bg-ambar-claro px-5 py-4 text-[15px]">
      <p className="font-display text-lg font-bold">Falta preparar o banco para a precificação</p>
      <p className="mt-1">No Supabase, abra o SQL Editor e rode, nesta ordem, <strong>supabase/precificacao.sql</strong> e <strong>supabase/precificacao_seed.sql</strong>. Depois recarregue a página.</p>
    </div>
  );
}

export default function PrecificacaoPage() {
  const ctx = useData();
  const { modelos, insumos, ficha, precos, oficinas, entradas, custosFixos, tabelasPreco, carregando, precificacaoPronta, cortesProntos, recarregar, parametro } = ctx;
  const avisar = useAviso();
  const [aba, setAba] = useState<Aba>('precos');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [soProblemas, setSoProblemas] = useState(false);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [buscaMp, setBuscaMp] = useState('');
  const h = hoje();

  const params: ParametrosPreco = useMemo(() => ({
    custosFixos: somaCustosFixos(custosFixos), vendaMedia: parametro('venda_media_mensal', 19000),
    imposto: parametro('imposto'), comissao: parametro('comissao'), frete: parametro('frete'),
    tabelas: [...tabelasPreco].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)),
  }), [custosFixos, tabelasPreco, parametro]);

  const linhas = useMemo(() => {
    const prod = producaoRecente(entradas, h, 90);
    return modelos.filter((m) => m.ativo).map((m) => {
      const c = custoModelo(m, ficha, insumos, precos, oficinas, h);
      return { c, lucro: lucroNoPreco(m.preco_venda, c.total, params), producao: prod.get(m.id) ?? 0 };
    });
  }, [modelos, ficha, insumos, precos, oficinas, entradas, params, h]);

  const meta = params.tabelas.length ? Math.min(...params.tabelas.map((t) => t.lucro)) : 0.05;
  const resumo = useMemo(() => {
    const validos = linhas.filter((l) => l.lucro !== null && !l.c.pendencias.length);
    const abaixo = validos.filter((l) => l.lucro! < meta);
    const pesoTotal = validos.reduce((s, l) => s + l.producao, 0);
    const ponderado = pesoTotal ? validos.reduce((s, l) => s + l.lucro! * l.producao, 0) / pesoTotal : null;
    return { abaixo: abaixo.length, validos: validos.length, ponderado, pendentes: linhas.filter((l) => l.c.pendencias.length).length };
  }, [linhas, meta]);

  if (carregando) return <Carregando />;
  if (!cortesProntos || !precificacaoPronta) return <><Cabecalho titulo="Precificação" /><AvisoMigracaoPreco /></>;

  const k = chave(busca);
  const lista = linhas
    .filter((l) => (!k || chave(l.c.modelo.nome).includes(k) || (l.c.modelo.codigo ?? '').includes(k)) && (!tipo || l.c.modelo.tipo === tipo))
    .filter((l) => !soProblemas || l.c.pendencias.length > 0 || (l.lucro !== null && l.lucro < meta))
    .sort((a, b) => (a.lucro ?? 9) - (b.lucro ?? 9));
  const rateio = rateioPorPeca(params);
  const sel = detalhe ? linhas.find((l) => l.c.modelo.id === detalhe) ?? null : null;
  const sugestaoVenda = mediaMensalProduzida(entradas, h, 6);

  // ---------- gravações
  async function salvarPrecoVenda(modeloId: string, v: number | null) {
    const { error } = await supabase.from('modelos').update({ preco_venda: v }).eq('id', modeloId);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    recarregar(['modelos']);
  }
  async function salvarParametro(chaveP: string, v: number | null) {
    if (v === null || v < 0) return;
    const { error } = await supabase.from('parametros').upsert({ chave: chaveP, valor: v });
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    recarregar(['parametros']);
  }
  async function salvarFixo(id: string, campo: 'nome' | 'valor', v: string | number | null) {
    const { error } = await supabase.from('custos_fixos').update({ [campo]: v ?? 0 }).eq('id', id);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    recarregar(['custos_fixos']);
  }
  async function novoFixo() {
    const { error } = await supabase.from('custos_fixos').insert({ nome: 'Novo custo', valor: 0, ordem: custosFixos.length });
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    recarregar(['custos_fixos']);
  }
  async function removerFixo(id: string) {
    const { error } = await supabase.from('custos_fixos').delete().eq('id', id);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    recarregar(['custos_fixos']);
  }
  async function salvarTabela(t: TabelaPreco, p: Partial<TabelaPreco>) {
    const { error } = await supabase.from('tabelas_preco').update(p).eq('id', t.id);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    recarregar(['tabelas_preco']);
  }
  async function novaTabela() {
    const nome = `Tabela ${params.tabelas.length + 1}`;
    const { error } = await supabase.from('tabelas_preco').insert({ nome, lucro: 0.1, ordem: params.tabelas.length + 1 });
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    recarregar(['tabelas_preco']);
  }
  async function removerTabela(t: TabelaPreco) {
    if (!confirm(`Excluir a ${t.nome}?`)) return;
    const { error } = await supabase.from('tabelas_preco').delete().eq('id', t.id);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    recarregar(['tabelas_preco']);
  }
  async function salvarPrecoInsumo(i: Insumo, campo: 'preco' | 'preco_qtd', v: number | null) {
    if (campo === 'preco_qtd' && (!v || v <= 0)) return;
    const { error } = await supabase.from('insumos').update({ [campo]: v, preco_atualizado_em: h }).eq('id', i.id);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    recarregar(['insumos']);
  }
  async function alternarSemCostura(modeloId: string, v: boolean) {
    const { error } = await supabase.from('modelos').update({ sem_costura: v }).eq('id', modeloId);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    recarregar(['modelos']);
  }

  function exportar() {
    baixarPlanilha('precificacao.xlsx', [{
      nome: 'Preços',
      linhas: lista.map(({ c, lucro, producao }) => ({
        'Código': c.modelo.codigo ?? '', Modelo: c.modelo.nome, Categoria: c.modelo.tipo,
        'Matéria-prima': +c.materiaPrima.toFixed(4), Acabamento: +c.acabamento.toFixed(4), Corte: +c.corte.toFixed(4),
        Costura: c.costura, 'Custo total': +c.total.toFixed(4), 'Rateio fixo': +rateio.toFixed(4),
        'Preço atual': c.modelo.preco_venda ?? '', 'Lucro no preço atual': lucro === null ? '' : +(lucro * 100).toFixed(1),
        ...Object.fromEntries(params.tabelas.map((t) => [t.nome, +(precoSugerido(c.total, t, params) ?? 0).toFixed(2)])),
        'Peças (90 dias)': producao, 'Pendências': c.pendencias.join('; '),
      })),
    }]);
  }

  return (
    <>
      <Cabecalho titulo="Precificação" sub="Custo de cada peça pela ficha técnica e o preço de venda em cada tabela."
        acoes={aba === 'precos' && <Botao variante="secundario" onClick={exportar}><Download size={17} />Exportar</Botao>} />
      <div className="mb-5">
        <Pilulas rotulo="Seção" valor={aba} onChange={setAba} opcoes={[
          { valor: 'precos', rotulo: 'Preços de venda' }, { valor: 'custos', rotulo: 'Custos e margens' }, { valor: 'materia', rotulo: 'Preço da matéria-prima' },
        ]} />
      </div>

      {aba === 'precos' && (
        <>
          <Painel className="mb-4">
            <div className="grid grid-cols-2 gap-y-3 md:grid-cols-4 md:divide-x md:divide-borda">
              <div className="md:px-5 md:first:pl-0">
                <div className="text-[13px] font-semibold text-linha">Lucro médio no preço atual</div>
                <div className="num font-display text-[26px] font-bold">{pctTxt(resumo.ponderado)}</div>
                <div className="text-xs text-linha">pesado pela produção dos últimos 90 dias</div>
              </div>
              <div className="md:px-5">
                <div className="text-[13px] font-semibold text-linha">Abaixo de {pctTxt(meta)} de lucro</div>
                <div className={cx('num font-display text-[26px] font-bold', resumo.abaixo > 0 && 'text-framboesa')}>{resumo.abaixo} <span className="font-sans text-sm font-medium text-linha">de {resumo.validos}</span></div>
                <div className="text-xs text-linha">modelos com custo completo</div>
              </div>
              <div className="md:px-5">
                <div className="text-[13px] font-semibold text-linha">Custo fixo por peça</div>
                <div className="num font-display text-[26px] font-bold">{brl(rateio)}</div>
                <div className="text-xs text-linha">{brl(params.custosFixos)} ÷ {num(params.vendaMedia)} peças</div>
              </div>
              <div className="md:px-5">
                <div className="text-[13px] font-semibold text-linha">Com pendência</div>
                <div className={cx('num font-display text-[26px] font-bold', resumo.pendentes > 0 && 'text-ambar')}>{resumo.pendentes}</div>
                <div className="text-xs text-linha">sem ficha, sem preço ou sem costura</div>
              </div>
            </div>
          </Painel>

          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Campo rotulo="Buscar" className="w-56"><Texto value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Modelo ou código" /></Campo>
            <Campo rotulo="Categoria" className="w-40">
              <Selecao value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="">Todas</option>{TIPOS.map((t) => <option key={t}>{t}</option>)}
              </Selecao>
            </Campo>
            <label className="flex h-11 items-center gap-2 text-[14px]">
              <input type="checkbox" className="h-4 w-4 accent-[#231F35]" checked={soProblemas} onChange={(e) => setSoProblemas(e.target.checked)} />
              Só abaixo da meta ou com pendência
            </label>
          </div>

          <div className="overflow-x-auto rounded-xl border border-borda bg-tecido">
            <table className="w-full min-w-[860px] text-[14px]">
              <thead className="bg-papel/70 text-left text-[12px] text-linha">
                <tr>
                  <th className="sticky left-0 bg-papel px-3 py-2.5 font-semibold">Modelo</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Custo</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Preço atual</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Lucro</th>
                  {params.tabelas.map((t) => <th key={t.id} className="px-3 py-2.5 text-right font-semibold">{t.nome}</th>)}
                  <th className="px-3 py-2.5 text-right font-semibold">Peças 90 d</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-borda">
                {lista.map(({ c, lucro, producao }) => (
                  <tr key={c.modelo.id} className="hover:bg-papel/50">
                    <td className="sticky left-0 bg-tecido px-3 py-2">
                      <button onClick={() => setDetalhe(c.modelo.id)} className="text-left">
                        <span className="block font-semibold underline decoration-borda underline-offset-2">{c.modelo.nome}</span>
                        <span className="block text-[12px] text-linha">{c.modelo.codigo ?? 'sem código'} · {c.modelo.tipo}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {R(c.total)}
                      {c.pendencias.length > 0 && <span title={c.pendencias.join('; ')} className="ml-1 inline-block align-middle text-ambar"><AlertTriangle size={14} /></span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CampoNum valor={c.modelo.preco_venda} prefixo="R$" ariaLabel={`Preço atual de ${c.modelo.nome}`} onSalvar={(v) => salvarPrecoVenda(c.modelo.id, v)} />
                    </td>
                    <td className={cx('px-3 py-2 text-right font-semibold', lucro !== null && (lucro < 0 ? 'text-framboesa' : lucro < meta ? 'text-ambar' : 'text-agua'))}>
                      {c.pendencias.length ? <span className="font-normal text-linha">—</span> : pctTxt(lucro)}
                    </td>
                    {params.tabelas.map((t) => (
                      <td key={t.id} className="px-3 py-2 text-right">{R(precoSugerido(c.total, t, params))}</td>
                    ))}
                    <td className="px-3 py-2 text-right text-linha">{producao ? num(producao) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-linha">
            Lucro = o que sobra do preço atual depois de imposto, comissão, frete, custo da peça e custo fixo por peça.
            A costura usa o maior preço pago entre as oficinas. Toque no modelo para ver a composição.
          </p>
        </>
      )}

      {aba === 'custos' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Painel titulo="Custos fixos por mês" acao={<Botao variante="secundario" className="h-9 px-3 text-sm" onClick={novoFixo}><Plus size={16} />Custo</Botao>}>
            <ul className="divide-y divide-borda">
              {custosFixos.map((c) => (
                <li key={c.id} className="flex items-center gap-2 py-2">
                  <input defaultValue={c.nome} aria-label="Nome do custo" onBlur={(e) => e.target.value.trim() && e.target.value !== c.nome && salvarFixo(c.id, 'nome', e.target.value.trim())}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-transparent px-2 font-semibold hover:border-borda focus:border-indigo focus:outline-none" />
                  <CampoNum valor={c.valor} prefixo="R$" largura="w-32" ariaLabel={`Valor de ${c.nome}`} onSalvar={(v) => salvarFixo(c.id, 'valor', v)} />
                  <button aria-label="Remover" onClick={() => removerFixo(c.id)} className="rounded-md p-2 text-linha hover:bg-framboesa-claro hover:text-framboesa"><Trash2 size={15} /></button>
                </li>
              ))}
              <li className="flex justify-between py-2 font-semibold"><span className="px-2">Total</span><span className="num pr-11">{brl(params.custosFixos)}</span></li>
            </ul>
            <div className="mt-3 border-t border-borda pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">Peças vendidas por mês</span>
                <CampoNum valor={params.vendaMedia} largura="w-28" ariaLabel="Peças vendidas por mês" onSalvar={(v) => salvarParametro('venda_media_mensal', v)} />
              </div>
              {sugestaoVenda && (
                <p className="mt-1 text-[13px] text-linha">
                  Pelo sistema, as oficinas entregaram em média {num(sugestaoVenda)} peças por mês nos últimos 6 meses.{' '}
                  <button className="font-semibold text-indigo underline" onClick={() => salvarParametro('venda_media_mensal', Math.round(sugestaoVenda))}>Usar esse número</button>
                </p>
              )}
              <p className="num mt-3 rounded-lg bg-papel px-3 py-2 text-[14px]">Custo fixo por peça: <strong>{brl(rateio)}</strong></p>
            </div>
          </Painel>

          <div className="space-y-4">
            <Painel titulo="Custos sobre o preço de venda">
              {([['imposto', 'Imposto'], ['comissao', 'Comissão'], ['frete', 'Frete']] as const).map(([k2, rot]) => (
                <div key={k2} className="flex items-center justify-between border-b border-borda py-2 last:border-0">
                  <span className="font-semibold">{rot}</span>
                  <CampoNum valor={+(parametro(k2) * 100).toFixed(4)} sufixo="%" largura="w-20" ariaLabel={rot} onSalvar={(v) => salvarParametro(k2, (v ?? 0) / 100)} />
                </div>
              ))}
            </Painel>

            <Painel titulo="Tabelas de preço" acao={<Botao variante="secundario" className="h-9 px-3 text-sm" onClick={novaTabela}><Plus size={16} />Tabela</Botao>}>
              <ul className="space-y-3">
                {params.tabelas.map((t) => (
                  <li key={t.id} className="rounded-lg border border-borda p-3">
                    <div className="flex items-center gap-2">
                      <input defaultValue={t.nome} aria-label="Nome da tabela" onBlur={(e) => e.target.value.trim() && e.target.value !== t.nome && salvarTabela(t, { nome: e.target.value.trim() })}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-transparent px-2 font-display text-[16px] font-bold hover:border-borda focus:border-indigo focus:outline-none" />
                      <span className="text-[13px] text-linha">lucro</span>
                      <CampoNum valor={+(t.lucro * 100).toFixed(4)} sufixo="%" largura="w-16" ariaLabel={`Lucro da ${t.nome}`} onSalvar={(v) => salvarTabela(t, { lucro: (v ?? 0) / 100 })} />
                      <button aria-label="Excluir tabela" onClick={() => removerTabela(t)} className="rounded-md p-2 text-linha hover:bg-framboesa-claro hover:text-framboesa"><Trash2 size={15} /></button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-2 text-[14px]">
                      {([['inclui_imposto', 'Imposto'], ['inclui_comissao', 'Comissão'], ['inclui_frete', 'Frete']] as const).map(([campo, rot]) => (
                        <label key={campo} className="flex items-center gap-1.5">
                          <input type="checkbox" className="h-4 w-4 accent-[#231F35]" checked={t[campo]} onChange={(e) => salvarTabela(t, { [campo]: e.target.checked })} />{rot}
                        </label>
                      ))}
                      <span className="num ml-auto text-linha">total {pctTxt(percentualTabela(t, params))} do preço</span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-linha">Preço = (custo da peça + custo fixo por peça) ÷ (1 − percentuais da tabela).</p>
            </Painel>
          </div>
        </div>
      )}

      {aba === 'materia' && (
        <Painel>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <Campo rotulo="Buscar" className="w-64"><Texto value={buscaMp} onChange={(e) => setBuscaMp(e.target.value)} placeholder="Insumo" /></Campo>
            <p className="text-[13px] text-linha">Informe quanto custa e quanto vem. Ex.: renda R$ 59,90 por 45 m (1 kg).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead className="text-left text-[12px] text-linha">
                <tr><th className="pb-2 font-semibold">Insumo</th><th className="pb-2 font-semibold">Valor</th><th className="pb-2 font-semibold">Por</th>
                  <th className="pb-2 text-right font-semibold">Preço unitário</th><th className="pb-2 text-right font-semibold">Atualizado</th></tr>
              </thead>
              <tbody className="num divide-y divide-borda">
                {insumos.filter((i) => i.ativo && (!buscaMp || chave(i.nome).includes(chave(buscaMp))))
                  .sort((a, b) => (a.categoria ?? '').localeCompare(b.categoria ?? '') || a.nome.localeCompare(b.nome, 'pt-BR'))
                  .map((i) => (
                    <tr key={i.id}>
                      <td className="py-2 pr-3">
                        <span className="block font-semibold">{i.nome}</span>
                        <span className="block text-[12px] text-linha">{CATEGORIAS_INSUMO.find((c) => c.valor === i.categoria)?.rotulo}</span>
                      </td>
                      <td className="py-2 pr-3"><CampoNum valor={i.preco} prefixo="R$" ariaLabel={`Valor de ${i.nome}`} destaque={i.preco == null} onSalvar={(v) => salvarPrecoInsumo(i, 'preco', v)} /></td>
                      <td className="py-2 pr-3"><CampoNum valor={i.preco_qtd} sufixo={i.unidade_consumo} largura="w-20" ariaLabel={`Quantidade de ${i.nome}`} onSalvar={(v) => salvarPrecoInsumo(i, 'preco_qtd', v)} /></td>
                      <td className="py-2 pr-3 text-right">{precoUnitario(i) === null ? <span className="text-ambar">sem preço</span> : `R$ ${R(precoUnitario(i), 4)} / ${i.unidade_consumo}`}</td>
                      <td className="py-2 text-right text-[12px] text-linha">{i.preco_atualizado_em ? dataBR(i.preco_atualizado_em) : ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Painel>
      )}

      <Modal aberto={!!sel} titulo={sel ? `${sel.c.modelo.nome}${sel.c.modelo.codigo ? ` (${sel.c.modelo.codigo})` : ''}` : ''} onFechar={() => setDetalhe(null)}>
        {sel && <Detalhe c={sel.c} lucro={sel.lucro} params={params} rateio={rateio}
          onUsarPreco={(v) => salvarPrecoVenda(sel.c.modelo.id, Math.round(v * 100) / 100)}
          onSemCostura={(v) => alternarSemCostura(sel.c.modelo.id, v)} />}
      </Modal>
    </>
  );
}

function Detalhe({ c, lucro, params, rateio, onUsarPreco, onSemCostura }: {
  c: CustoModelo; lucro: number | null; params: ParametrosPreco; rateio: number;
  onUsarPreco: (v: number) => void; onSemCostura: (v: boolean) => void;
}) {
  const grupos: [string, typeof c.itens][] = [
    ['Matéria-prima', c.itens.filter((i) => !i.insumo.categoria || i.insumo.categoria === 'M.P')],
    ['Acabamento', c.itens.filter((i) => i.insumo.categoria === 'Acabamento')],
    ['Mão de obra', c.itens.filter((i) => i.insumo.categoria === 'M.O')],
  ];
  return (
    <div className="space-y-4 text-[14px]">
      {c.pendencias.length > 0 && (
        <div className="rounded-lg bg-ambar-claro px-3 py-2 text-ambar">
          {c.pendencias.map((p) => <div key={p}>{p}</div>)}
          <Link href={`/ficha?modelo=${c.modelo.id}`} className="font-semibold underline">Abrir ficha técnica</Link>
        </div>
      )}
      {grupos.map(([titulo, itens]) => itens.length > 0 && (
        <div key={titulo}>
          <h3 className="mb-1 font-bold">{titulo}</h3>
          <ul className="num divide-y divide-borda">
            {itens.map((i) => (
              <li key={i.insumo.id} className="flex justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate">{i.insumo.nome}</span>
                  <span className="block text-[12px] text-linha">{semZeros(i.consumo)} {i.insumo.unidade_consumo} × {i.unitario === null ? 'sem preço' : `R$ ${R(i.unitario, 4)}`}</span>
                </span>
                <span className="shrink-0">{R(i.valor, 4)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        <h3 className="mb-1 font-bold">Costura</h3>
        <div className="flex justify-between py-1.5">
          <span>{c.modelo.sem_costura ? 'Não tem costura' : c.costuraOficina ? `Maior preço: ${c.costuraOficina}` : <span className="text-ambar">Sem preço em nenhuma oficina</span>}</span>
          <span className="num">{R(c.costura, 4)}</span>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-linha">
          <input type="checkbox" className="h-4 w-4 accent-[#231F35]" checked={!!c.modelo.sem_costura} onChange={(e) => onSemCostura(e.target.checked)} />
          Peça comprada pronta, sem costura
        </label>
      </div>
      <div className="num rounded-lg bg-papel px-3 py-2">
        <div className="flex justify-between"><span>Custo da peça</span><strong>{brl(c.total)}</strong></div>
        <div className="flex justify-between text-linha"><span>Custo fixo por peça</span><span>{brl(rateio)}</span></div>
        {c.modelo.preco_venda ? (
          <div className="flex justify-between"><span>Lucro no preço atual ({brl(c.modelo.preco_venda)})</span><strong className={cx(lucro !== null && lucro < 0 && 'text-framboesa')}>{pctTxt(lucro)}</strong></div>
        ) : null}
      </div>
      <div>
        <h3 className="mb-1 font-bold">Preço sugerido</h3>
        <ul className="divide-y divide-borda">
          {params.tabelas.map((t) => {
            const v = precoSugerido(c.total, t, params);
            return (
              <li key={t.id} className="flex items-center justify-between py-1.5">
                <span>{t.nome} <span className="text-[12px] text-linha">({pctTxt(t.lucro)} de lucro)</span></span>
                <span className="flex items-center gap-2">
                  <strong className="num">{v === null ? '—' : brl(v)}</strong>
                  {v !== null && <button className="text-[12px] font-semibold text-indigo underline" onClick={() => onUsarPreco(v)}>usar</button>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
