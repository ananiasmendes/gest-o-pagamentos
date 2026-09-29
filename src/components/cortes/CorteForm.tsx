'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Plus, Trash2 } from 'lucide-react';
import { useData, corOficina, TABELAS_DO_CORTE } from '@/lib/data';
import { supabase, mensagemErro } from '@/lib/supabase';
import { calcularPecas, kgPorFolhaDoRisco, ordenarTamanhos } from '@/lib/cortes/calc';
import { casarModelo, interpretarRisco, lerTextoPdf } from '@/lib/cortes/risco';
import { chave, dec, hoje, num, parseNumero } from '@/lib/format';
import type { Corte, CorteCor, CorteModelo, Grade, Tipo } from '@/lib/types';
import { Botao, Campo, Painel, Selecao, Texto, cx, useAviso } from '@/components/ui';
import { nomePadrao, sincronizarPagamentoCorte, type CorteDetalhe } from './comum';

interface LinhaModelo { k: string; modelo_id: string; nomeRisco?: string; codigoRisco?: string | null; grade: Record<string, string>; oficina_id: string }
interface LinhaCor { k: string; cor_id: string; folhas: string }

const novaChave = () => Math.random().toString(36).slice(2);
const TAMANHOS_PADRAO = ['P', 'M', 'G', 'GG'];
const tituloNome = (s: string) => s.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
const tipoPorNome = (n: string): Tipo => (/^conj/i.test(n) ? 'Conjunto' : /^body/i.test(n) ? 'Body' : 'Calcinha');
const txt = (n: number | null | undefined) => (n === null || n === undefined ? '' : dec(n));

export default function CorteForm({ existente }: { existente?: CorteDetalhe }) {
  const ctx = useData();
  const { oficinas, modelos, cores, insumos, cortes, entradas, corteModelos, recarregar } = ctx;
  const avisar = useAviso();
  const router = useRouter();
  const inputPdf = useRef<HTMLInputElement>(null);

  const c0 = existente?.corte;
  const [data, setData] = useState(c0?.data ?? hoje());
  const numero = c0?.numero ?? (cortes.reduce((m, c) => Math.max(m, c.numero), 0) + 1);
  const [nome, setNome] = useState(c0?.nome ?? nomePadrao(numero, hoje()));
  const [nomeEditado, setNomeEditado] = useState(!!c0);
  const [cortadorId, setCortadorId] = useState(c0?.cortador_id ?? '');
  const [observacao, setObservacao] = useState(c0?.observacao ?? '');
  const [risco, setRisco] = useState({
    tecido: c0?.tecido ?? '', comprimento: txt(c0?.comprimento_m), largura: txt(c0?.largura_m),
    gramatura: txt(c0?.gramatura_kg_m2), aproveitamento: txt(c0?.aproveitamento),
  });
  const [tecidoInsumoId, setTecidoInsumoId] = useState(c0?.tecido_insumo_id ?? '');
  const [tamanhos, setTamanhos] = useState<string[]>(() =>
    ordenarTamanhos([...TAMANHOS_PADRAO, ...(existente?.cms.flatMap((m) => Object.keys(m.grade)) ?? [])]));
  const [novoTam, setNovoTam] = useState('');
  const [linhas, setLinhas] = useState<LinhaModelo[]>(() => existente?.cms.map((m) => ({
    k: novaChave(), modelo_id: m.modelo_id, oficina_id: m.oficina_id ?? '',
    grade: Object.fromEntries(Object.entries(m.grade).map(([t, v]) => [t, String(v)])),
  })) ?? []);
  const [linhasCor, setLinhasCor] = useState<LinhaCor[]>(() => existente?.ccs.map((c) => ({ k: novaChave(), cor_id: c.cor_id, folhas: String(c.folhas) })) ?? []);
  const [novaCor, setNovaCor] = useState('');
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (!nomeEditado) setNome(nomePadrao(numero, data)); }, [data, numero, nomeEditado]);
  useEffect(() => {
    if (tecidoInsumoId || c0) return;
    const padrao = insumos.find((i) => chave(i.nome).includes('microfibra')) ?? insumos.find((i) => i.unidade_consumo === 'kg');
    if (padrao) setTecidoInsumoId(padrao.id);
  }, [insumos, tecidoInsumoId, c0]);

  const costureiras = oficinas.filter((o) => o.ativa && o.faz_costura);
  const cortadores = oficinas.filter((o) => (o.ativa && o.faz_corte) || o.id === cortadorId);
  const modelosOrdenados = useMemo(() => [...modelos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [modelos]);

  /** Sugere a oficina que costurou esse modelo por último. */
  const sugerirOficina = (modeloId: string) => {
    for (let i = entradas.length - 1; i >= 0; i--) {
      const e = entradas[i];
      if (e.modelo_id === modeloId && e.operacao === 'Costura' && costureiras.some((o) => o.id === e.oficina_id)) return e.oficina_id;
    }
    const cm = [...corteModelos].reverse().find((m) => m.modelo_id === modeloId && m.oficina_id);
    return cm?.oficina_id ?? '';
  };

  async function lerRisco(file: File | undefined) {
    if (!file) return;
    setLendo(true);
    try {
      const r = interpretarRisco(await lerTextoPdf(file));
      if (!r.modelos.length) { avisar('Não achei modelos neste PDF. Confira se é o relatório de encaixe do Audaces.', 'erro'); return; }
      if (linhas.some((l) => l.modelo_id) && !confirm('Substituir os modelos já preenchidos pelos do risco?')) return;
      setRisco({ tecido: r.tecido ?? '', comprimento: txt(r.comprimento_m), largura: txt(r.largura_m), gramatura: txt(r.gramatura_kg_m2), aproveitamento: txt(r.aproveitamento) });
      setTamanhos((t) => ordenarTamanhos([...t, ...r.modelos.flatMap((m) => Object.keys(m.grade))]));
      setLinhas(r.modelos.map((mr) => {
        const m = casarModelo(mr, modelos);
        return {
          k: novaChave(), modelo_id: m?.id ?? '', nomeRisco: tituloNome(mr.nome), codigoRisco: mr.codigo,
          grade: Object.fromEntries(Object.entries(mr.grade).map(([t, v]) => [t, String(v)])),
          oficina_id: m ? sugerirOficina(m.id) : '',
        };
      }));
      const achados = r.modelos.filter((mr) => casarModelo(mr, modelos)).length;
      avisar(`${r.modelos.length} modelos lidos do risco${achados < r.modelos.length ? `, ${r.modelos.length - achados} sem cadastro` : ''}.`);
    } catch (e) {
      avisar(`Não consegui ler o PDF: ${(e as Error).message}`, 'erro');
    } finally { setLendo(false); if (inputPdf.current) inputPdf.current.value = ''; }
  }

  async function cadastrarModelo(l: LinhaModelo) {
    const nomeM = (l.nomeRisco ?? '').trim();
    if (!nomeM) return;
    const { data: novo, error } = await supabase.from('modelos')
      .insert({ nome: nomeM, tipo: tipoPorNome(nomeM), codigo: l.codigoRisco ?? null }).select('id').single();
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    await recarregar(['modelos']);
    setLinhas((ls) => ls.map((x) => (x.k === l.k ? { ...x, modelo_id: (novo as { id: string }).id } : x)));
    avisar(`${nomeM} cadastrado. Preencha a ficha técnica dele depois.`);
  }

  async function cadastrarCor() {
    const n = novaCor.trim();
    if (!n) return;
    let cor = cores.find((c) => chave(c.nome) === chave(n));
    if (!cor) {
      const { data: nova, error } = await supabase.from('cores').insert({ nome: tituloNome(n) }).select('*').single();
      if (error) { avisar(mensagemErro(error), 'erro'); return; }
      cor = nova as typeof cores[number];
      await recarregar(['cores']);
    }
    if (!linhasCor.some((l) => l.cor_id === cor!.id)) setLinhasCor((ls) => [...ls, { k: novaChave(), cor_id: cor!.id, folhas: '' }]);
    setNovaCor('');
  }

  const atualizarLinha = (k: string, p: Partial<LinhaModelo>) => setLinhas((ls) => ls.map((l) => (l.k === k ? { ...l, ...p } : l)));
  const gradeNum = (g: Record<string, string>): Grade =>
    Object.fromEntries(Object.entries(g).map(([t, v]) => [t, parseInt(v || '0', 10) || 0]).filter(([, v]) => (v as number) > 0));

  // prévia das peças
  const previa = useMemo(() => {
    const cms = linhas.filter((l) => l.modelo_id).map((l, i) => ({ id: l.k, corte_id: '', modelo_id: l.modelo_id, oficina_id: l.oficina_id || null, grade: gradeNum(l.grade), ordem: i })) as CorteModelo[];
    const ccs = linhasCor.filter((l) => l.cor_id).map((l, i) => ({ id: l.k, corte_id: '', cor_id: l.cor_id, folhas: parseInt(l.folhas || '0', 10) || 0, ordem: i })) as CorteCor[];
    return { cms, ccs, pecas: calcularPecas(cms, ccs) };
  }, [linhas, linhasCor]);
  const kgFolha = kgPorFolhaDoRisco({ comprimento_m: parseNumero(risco.comprimento), largura_m: parseNumero(risco.largura), gramatura_kg_m2: parseNumero(risco.gramatura) });

  async function salvar() {
    const validas = linhas.filter((l) => l.modelo_id);
    if (linhas.some((l) => !l.modelo_id)) { avisar('Há modelos sem cadastro. Escolha ou cadastre cada um antes de salvar.', 'erro'); return; }
    if (!validas.length || !previa.cms.some((m) => Object.keys(m.grade).length)) { avisar('Adicione ao menos um modelo com grade.', 'erro'); return; }
    if (new Set(validas.map((l) => l.modelo_id)).size !== validas.length) { avisar('Há modelo repetido no corte.', 'erro'); return; }
    if (!previa.ccs.some((c) => c.folhas > 0)) { avisar('Informe as cores e o número de folhas.', 'erro'); return; }
    if (new Set(previa.ccs.map((c) => c.cor_id)).size !== previa.ccs.length) { avisar('Há cor repetida no corte.', 'erro'); return; }

    setSalvando(true);
    const dadosCorte = {
      nome: nome.trim() || nomePadrao(numero, data), data, cortador_id: cortadorId || null, observacao: observacao.trim() || null,
      tecido: risco.tecido.trim() || null, comprimento_m: parseNumero(risco.comprimento), largura_m: parseNumero(risco.largura),
      gramatura_kg_m2: parseNumero(risco.gramatura), aproveitamento: parseNumero(risco.aproveitamento),
      tecido_insumo_id: tecidoInsumoId || null,
    };
    let id = c0?.id ?? '';
    try {
      if (c0) {
        const { error } = await supabase.from('cortes').update(dadosCorte).eq('id', c0.id);
        if (error) throw error;
        for (const t of ['corte_modelos', 'corte_cores']) {
          const { error: e2 } = await supabase.from(t).delete().eq('corte_id', c0.id);
          if (e2) throw e2;
        }
      } else {
        const { data: novo, error } = await supabase.from('cortes').insert({ ...dadosCorte, numero }).select('id').single();
        if (error) throw error;
        id = (novo as { id: string }).id;
      }
      const r1 = await supabase.from('corte_modelos').insert(previa.cms.map((m, i) => ({ corte_id: id, modelo_id: m.modelo_id, oficina_id: m.oficina_id, grade: m.grade, ordem: i })));
      if (r1.error) throw r1.error;
      const r2 = await supabase.from('corte_cores').insert(previa.ccs.filter((c) => c.folhas > 0).map((c, i) => ({ corte_id: id, cor_id: c.cor_id, folhas: c.folhas, ordem: i })));
      if (r2.error) throw r2.error;
      if (c0 && c0.status !== 'planejado') {
        await sincronizarPagamentoCorte({ ...c0, ...dadosCorte } as Corte, previa.cms, previa.pecas, modelos);
      }
      await recarregar([...TABELAS_DO_CORTE, 'entradas']);
      avisar(c0 ? 'Corte atualizado.' : `${dadosCorte.nome} criado.`);
      router.push(`/cortes/${id}`);
    } catch (e) {
      if (!c0 && id) await supabase.from('cortes').delete().eq('id', id);
      avisar(mensagemErro(e), 'erro');
      if (c0) recarregar([...TABELAS_DO_CORTE, 'entradas']);
    } finally { setSalvando(false); }
  }

  const totalFolhas = previa.pecas.totalFolhas;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {/* 1. Risco */}
        <Painel titulo="Risco do Audaces" acao={
          <Botao variante="secundario" className="h-9 px-3 text-sm" disabled={lendo} onClick={() => inputPdf.current?.click()}>
            <FileUp size={16} />{lendo ? 'Lendo…' : 'Ler PDF do risco'}
          </Botao>}>
          <input ref={inputPdf} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => lerRisco(e.target.files?.[0])} />
          <p className="mb-3 text-[14px] text-linha">O PDF preenche os modelos, a grade e as medidas. Sem PDF, preencha à mão.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Campo rotulo="Tecido"><Texto value={risco.tecido} onChange={(e) => setRisco({ ...risco, tecido: e.target.value })} /></Campo>
            <Campo rotulo="Comprimento (m)"><Texto inputMode="decimal" value={risco.comprimento} onChange={(e) => setRisco({ ...risco, comprimento: e.target.value })} /></Campo>
            <Campo rotulo="Largura (m)"><Texto inputMode="decimal" value={risco.largura} onChange={(e) => setRisco({ ...risco, largura: e.target.value })} /></Campo>
            <Campo rotulo="Peso (kg/m²)"><Texto inputMode="decimal" value={risco.gramatura} onChange={(e) => setRisco({ ...risco, gramatura: e.target.value })} /></Campo>
            <Campo rotulo="Aproveitamento (%)"><Texto inputMode="decimal" value={risco.aproveitamento} onChange={(e) => setRisco({ ...risco, aproveitamento: e.target.value })} /></Campo>
          </div>
          <Campo rotulo="Calcular pelo risco o insumo" className="mt-3 sm:w-80"
            dica={kgFolha ? `${dec(kgFolha)} kg por folha. Substitui a ficha técnica para esse insumo.` : 'Preencha comprimento, largura e peso para calcular o tecido pelo risco.'}>
            <Selecao value={tecidoInsumoId} onChange={(e) => setTecidoInsumoId(e.target.value)}>
              <option value="">Nenhum (usar só a ficha técnica)</option>
              {insumos.filter((i) => i.ativo || i.id === tecidoInsumoId).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </Selecao>
          </Campo>
        </Painel>

        {/* 2. Modelos */}
        <Painel titulo="Modelos e oficinas" acao={
          <Botao variante="secundario" className="h-9 px-3 text-sm" onClick={() => setLinhas((ls) => [...ls, { k: novaChave(), modelo_id: '', grade: {}, oficina_id: '' }])}>
            <Plus size={16} />Modelo
          </Botao>}>
          {costureiras.length > 1 && linhas.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[14px] text-linha">
              Todos para:
              {costureiras.map((o) => (
                <button key={o.id} type="button" onClick={() => setLinhas((ls) => ls.map((l) => ({ ...l, oficina_id: o.id })))}
                  className="rounded-full border border-borda px-3 py-1 font-semibold text-tinta hover:border-linha/60">{o.nome}</button>
              ))}
            </div>
          )}
          {!linhas.length && <p className="text-[15px] text-linha">Leia o PDF do risco ou adicione os modelos.</p>}
          <ul className="space-y-3">
            {linhas.map((l) => {
              const soma = Object.values(l.grade).reduce((s, v) => s + (parseInt(v || '0', 10) || 0), 0);
              return (
                <li key={l.k} className="rounded-lg border border-borda p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <Campo rotulo="Modelo" className="min-w-[180px] flex-1">
                      <Selecao value={l.modelo_id} onChange={(e) => atualizarLinha(l.k, { modelo_id: e.target.value, oficina_id: l.oficina_id || sugerirOficina(e.target.value) })}
                        className={cx(!l.modelo_id && 'border-ambar bg-ambar-claro')}>
                        <option value="">{l.nomeRisco ? `${l.nomeRisco} (sem cadastro)` : 'Escolha o modelo'}</option>
                        {modelosOrdenados.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.ativo ? '' : ' (inativo)'}</option>)}
                      </Selecao>
                    </Campo>
                    <Campo rotulo="Oficina" className="min-w-[150px] flex-1">
                      <Selecao value={l.oficina_id} onChange={(e) => atualizarLinha(l.k, { oficina_id: e.target.value })}>
                        <option value="">Definir depois</option>
                        {oficinas.filter((o) => (o.ativa && o.faz_costura) || o.id === l.oficina_id).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                      </Selecao>
                    </Campo>
                    <button type="button" aria-label="Remover modelo" onClick={() => setLinhas((ls) => ls.filter((x) => x.k !== l.k))}
                      className="mb-1 rounded-md p-2 text-linha hover:bg-framboesa-claro hover:text-framboesa"><Trash2 size={17} /></button>
                  </div>
                  {!l.modelo_id && l.nomeRisco && (
                    <button type="button" onClick={() => cadastrarModelo(l)} className="mt-2 text-sm font-semibold text-indigo underline">
                      Cadastrar &quot;{l.nomeRisco}&quot; como modelo novo
                    </button>
                  )}
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    {tamanhos.map((t) => (
                      <label key={t} className="w-16">
                        <span className="block text-center text-[13px] font-bold">{t}</span>
                        <input type="number" inputMode="numeric" min={0} value={l.grade[t] ?? ''} placeholder="0"
                          onChange={(e) => atualizarLinha(l.k, { grade: { ...l.grade, [t]: e.target.value.replace(/\D/g, '') } })}
                          className="num mt-1 h-11 w-full rounded-lg border border-borda bg-tecido text-center text-lg font-semibold focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo/15" />
                      </label>
                    ))}
                    <span className="num pb-2.5 text-[14px] text-linha">
                      {soma} por folha{totalFolhas ? ` · ${num(soma * totalFolhas)} peças` : ''}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-end gap-2">
            <Campo rotulo="Outro tamanho" className="w-32"><Texto value={novoTam} onChange={(e) => setNovoTam(e.target.value.toUpperCase())} placeholder="Ex.: XG" /></Campo>
            <Botao variante="fantasma" className="h-11" onClick={() => { const t = novoTam.trim(); if (t) setTamanhos((ts) => ordenarTamanhos([...ts, t])); setNovoTam(''); }}>Adicionar</Botao>
          </div>
        </Painel>

        {/* 3. Cores */}
        <Painel titulo="Cores e folhas">
          <ul className="grid gap-2 sm:grid-cols-2">
            {linhasCor.map((l) => (
              <li key={l.k} className="flex items-end gap-2">
                <Campo rotulo="Cor" className="flex-1">
                  <Selecao value={l.cor_id} onChange={(e) => setLinhasCor((ls) => ls.map((x) => (x.k === l.k ? { ...x, cor_id: e.target.value } : x)))}>
                    <option value="">Escolha</option>
                    {cores.filter((c) => c.ativa || c.id === l.cor_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </Selecao>
                </Campo>
                <Campo rotulo="Folhas" className="w-24">
                  <Texto type="number" inputMode="numeric" value={l.folhas} className="num text-center font-semibold"
                    onChange={(e) => setLinhasCor((ls) => ls.map((x) => (x.k === l.k ? { ...x, folhas: e.target.value.replace(/\D/g, '') } : x)))} />
                </Campo>
                <button type="button" aria-label="Remover cor" onClick={() => setLinhasCor((ls) => ls.filter((x) => x.k !== l.k))}
                  className="mb-1 rounded-md p-2 text-linha hover:bg-framboesa-claro hover:text-framboesa"><Trash2 size={17} /></button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Botao variante="secundario" className="h-11" onClick={() => setLinhasCor((ls) => [...ls, { k: novaChave(), cor_id: '', folhas: '' }])}><Plus size={16} />Cor</Botao>
            <Campo rotulo="Cor nova" className="w-44"><Texto value={novaCor} onChange={(e) => setNovaCor(e.target.value)} placeholder="Nome da cor"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); cadastrarCor(); } }} /></Campo>
            <Botao variante="fantasma" className="h-11" onClick={cadastrarCor} disabled={!novaCor.trim()}>Cadastrar e usar</Botao>
          </div>
        </Painel>

        {/* 4. Dados */}
        <Painel titulo="Dados do corte">
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Nome"><Texto value={nome} onChange={(e) => { setNome(e.target.value); setNomeEditado(true); }} /></Campo>
            <Campo rotulo="Data"><Texto type="date" value={data} onChange={(e) => setData(e.target.value || hoje())} /></Campo>
            <Campo rotulo="Quem corta" dica={cortadorId ? 'Ao marcar como cortado, o pagamento do corte é lançado para ele.' : 'Cortado na fábrica, sem pagamento de corte.'}>
              <Selecao value={cortadorId} onChange={(e) => setCortadorId(e.target.value)}>
                <option value="">Fábrica</option>
                {cortadores.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Observação" className="sm:col-span-3"><Texto value={observacao} onChange={(e) => setObservacao(e.target.value)} /></Campo>
          </div>
        </Painel>
      </div>

      {/* Prévia */}
      <Painel titulo="Prévia" className="lg:sticky lg:top-6 lg:self-start">
        <div className="num font-display text-[34px] font-extrabold leading-none">{num(previa.pecas.total)}</div>
        <div className="text-[14px] text-linha">peças em {num(totalFolhas)} folhas{kgFolha && totalFolhas ? `, ${dec(Math.round(kgFolha * totalFolhas * 10) / 10)} kg de tecido` : ''}</div>
        {previa.pecas.total > 0 && (
          <>
            <div className="mt-4 grid grid-cols-4 gap-1.5 text-center">
              {previa.pecas.tamanhos.map((t) => (
                <div key={t} className="rounded-lg bg-papel py-2">
                  <div className="text-[13px] font-bold">{t}</div>
                  <div className="num text-[14px]">{num(previa.pecas.porTam[t] ?? 0)}</div>
                </div>
              ))}
            </div>
            <ul className="mt-4 space-y-1.5 text-[14px]">
              {Array.from(previa.pecas.porOficina).map(([of, q]) => (
                <li key={of ?? 'x'} className="flex justify-between">
                  <span className="font-semibold">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: corOficina(oficinas, of) }} />
                    {of ? oficinas.find((o) => o.id === of)?.nome : 'Sem oficina'}
                  </span>
                  <span className="num">{num(q)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <Botao variante="destaque" className="mt-5 w-full" disabled={salvando} onClick={salvar}>
          {salvando ? 'Salvando…' : c0 ? 'Salvar alterações' : 'Criar corte'}
        </Botao>
        {c0 && <Botao variante="fantasma" className="mt-2 w-full" onClick={() => router.push(`/cortes/${c0.id}`)}>Cancelar</Botao>}
      </Painel>
    </div>
  );
}
