'use client';

import { useMemo, useState } from 'react';
import { FileSpreadsheet, Download } from 'lucide-react';
import { useData } from '@/lib/data';
import { hoje, num } from '@/lib/format';
import { abaSugerida, baixarModelo, gravar, lerArquivo, mapear, validar, type Arquivo, type Opcoes, type TipoImport } from '@/lib/importer';
import { Botao, Cabecalho, Campo, Carregando, Painel, Pilulas, Selecao, Texto, cx, useAviso } from '@/components/ui';

const ROTULOS: Record<TipoImport, string> = { entradas: 'Entradas de peças', pagamentos: 'Pagamentos', precos: 'Preços por oficina' };
const AJUDA: Record<TipoImport, string> = {
  entradas: 'Colunas: Data, Oficina, Modelo, Tamanho, Quantidade, Tipo, Operação e, se quiser, Valor unitário e Observação. Corte vai com "Corte" no modelo. A aba Entradas da planilha antiga funciona direto.',
  pagamentos: 'Colunas: Data, Oficina, Valor e Observação. A aba Pagamentos da planilha antiga funciona direto.',
  precos: 'Colunas: Oficina, Modelo, Código, Tipo, Operação, Valor e Vigente desde. Sem a coluna Oficina, o preço vale para a oficina escolhida abaixo. A aba "Valor das peças" antiga também funciona.',
};

export default function ImportarPage() {
  const ctx = useData();
  const { oficinas, carregando, recarregar } = ctx;
  const avisar = useAviso();
  const [tipo, setTipo] = useState<TipoImport>('entradas');
  const [arq, setArq] = useState<Arquivo | null>(null);
  const [aba, setAba] = useState('');
  const [op, setOp] = useState<Opcoes>({ criarCadastros: false, usarValorPlanilha: true, aplicarOficina: '', vigencia: hoje(), incluirDuplicadas: false });
  const [soProblemas, setSoProblemas] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [lendo, setLendo] = useState(false);

  async function escolher(file: File | undefined) {
    if (!file) return;
    setLendo(true);
    try {
      const a = await lerArquivo(file);
      setArq(a); setAba(abaSugerida(a, tipo));
    } catch (e) {
      avisar(`Não foi possível ler o arquivo: ${(e as Error).message}`, 'erro');
    } finally { setLendo(false); }
  }

  const linhas = arq?.abas.find((a) => a.nome === aba)?.linhas ?? [];
  const mapa = useMemo(() => (linhas.length ? mapear(linhas, tipo) : null), [linhas, tipo]);
  const validadas = useMemo(
    () => (mapa ? validar(tipo, linhas, mapa, ctx, op) : []),
    [mapa, tipo, linhas, ctx, op],
  );
  const cont = {
    ok: validadas.filter((v) => v.status === 'ok').length,
    erro: validadas.filter((v) => v.status === 'erro').length,
    dup: validadas.filter((v) => v.status === 'duplicada').length,
    novasOf: new Set(validadas.filter((v) => v.status !== 'erro').map((v) => v.novaOficina).filter(Boolean)).size,
    novosMod: new Set(validadas.filter((v) => v.status !== 'erro').map((v) => v.novoModelo?.nome).filter(Boolean)).size,
  };
  const aGravar = validadas.filter((v) => v.status === 'ok' || (op.incluirDuplicadas && v.status === 'duplicada'));

  async function importar() {
    if (!aGravar.length) return;
    setGravando(true);
    try {
      const n = await gravar(tipo, aGravar, ctx);
      avisar(`${num(n)} ${tipo === 'precos' ? 'preços' : 'linhas'} importados.`);
      await recarregar();
      setArq(null);
    } catch (e) {
      avisar(`A importação parou: ${(e as Error).message}. O que foi gravado antes disso ficou salvo; importe o mesmo arquivo de novo e as linhas já gravadas aparecerão como duplicadas.`, 'erro');
      await recarregar();
    } finally { setGravando(false); }
  }

  if (carregando) return <Carregando />;
  const mostrar = (soProblemas ? validadas.filter((v) => v.status !== 'ok') : validadas).slice(0, 300);

  return (
    <>
      <Cabecalho titulo="Importar" sub="Traga dados de uma planilha (.xlsx ou .csv). Nada é gravado antes de você conferir a prévia." />

      <Painel className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Campo grupo rotulo="O que você vai importar?">
            <Pilulas rotulo="Tipo de importação" valor={tipo} onChange={(t) => { setTipo(t); if (arq) setAba(abaSugerida(arq, t)); }}
              opcoes={(Object.keys(ROTULOS) as TipoImport[]).map((t) => ({ valor: t, rotulo: ROTULOS[t] }))} />
          </Campo>
          <Botao variante="fantasma" onClick={() => baixarModelo(tipo)}><Download size={17} />Baixar planilha modelo</Botao>
        </div>
        <p className="mt-3 max-w-3xl text-[14px] text-linha">{AJUDA[tipo]}</p>

        <label className={cx('mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
          arq ? 'border-agua/50 bg-agua-claro/40' : 'border-borda hover:border-linha/50')}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); escolher(e.dataTransfer.files[0]); }}>
          <FileSpreadsheet size={28} className="text-linha" />
          <span className="font-semibold">{lendo ? 'Lendo arquivo…' : arq ? arq.nome : 'Escolha ou arraste o arquivo aqui'}</span>
          <span className="text-[13px] text-linha">{arq ? 'Toque para trocar de arquivo' : '.xlsx, .xls ou .csv'}</span>
          <input type="file" accept=".xlsx,.xls,.csv,.txt" className="sr-only" onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </Painel>

      {arq && (
        <>
          <Painel className="mb-4" titulo="Conferir">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo="Aba da planilha">
                <Selecao value={aba} onChange={(e) => setAba(e.target.value)}>
                  {arq.abas.map((a) => <option key={a.nome} value={a.nome}>{a.nome} ({a.linhas.length} linhas)</option>)}
                </Selecao>
              </Campo>
              {tipo === 'precos' && mapa && mapa.idx.oficina === undefined && (
                <Campo rotulo="Aplicar os preços para">
                  <Selecao value={op.aplicarOficina} onChange={(e) => setOp({ ...op, aplicarOficina: e.target.value })}>
                    <option value="">Todas as oficinas ativas</option>
                    {oficinas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </Selecao>
                </Campo>
              )}
              {tipo === 'precos' && (
                <Campo rotulo="Vigente desde (se o arquivo não disser)">
                  <Texto type="date" value={op.vigencia} onChange={(e) => setOp({ ...op, vigencia: e.target.value || hoje() })} />
                </Campo>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2.5 text-[15px]">
              <label className="flex items-center gap-3">
                <input type="checkbox" className="h-5 w-5 accent-[#2A1614]" checked={op.criarCadastros} onChange={(e) => setOp({ ...op, criarCadastros: e.target.checked })} />
                Cadastrar automaticamente oficinas e modelos que ainda não existem
              </label>
              {tipo === 'entradas' && mapa?.idx.valor_unitario !== undefined && (
                <label className="flex items-center gap-3">
                  <input type="checkbox" className="h-5 w-5 accent-[#2A1614]" checked={op.usarValorPlanilha} onChange={(e) => setOp({ ...op, usarValorPlanilha: e.target.checked })} />
                  Manter o valor unitário do arquivo (desmarque para recalcular pela tabela de preços)
                </label>
              )}
              {cont.dup > 0 && (
                <label className="flex items-center gap-3">
                  <input type="checkbox" className="h-5 w-5 accent-[#2A1614]" checked={op.incluirDuplicadas} onChange={(e) => setOp({ ...op, incluirDuplicadas: e.target.checked })} />
                  Importar também as {cont.dup} linhas que parecem duplicadas
                </label>
              )}
            </div>
          </Painel>

          {!mapa ? (
            <Painel><p className="text-framboesa">Não encontrei as colunas obrigatórias nesta aba. Confira os nomes das colunas ou baixe a planilha modelo.</p></Painel>
          ) : (
            <Painel>
              <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px]">
                <span><strong className="num text-agua">{num(cont.ok)}</strong> prontas</span>
                {cont.dup > 0 && <span><strong className="num text-ambar">{num(cont.dup)}</strong> duplicadas</span>}
                {cont.erro > 0 && <span><strong className="num text-framboesa">{num(cont.erro)}</strong> com erro (serão ignoradas)</span>}
                {cont.novasOf > 0 && <span>{cont.novasOf} oficinas novas</span>}
                {cont.novosMod > 0 && <span>{cont.novosMod} modelos novos</span>}
                <label className="ml-auto flex items-center gap-2 text-[14px]">
                  <input type="checkbox" className="h-4 w-4 accent-[#2A1614]" checked={soProblemas} onChange={(e) => setSoProblemas(e.target.checked)} />
                  Só problemas
                </label>
              </div>
              <div className="max-h-[420px] overflow-auto rounded-lg border border-borda">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-papel text-left text-linha">
                    <tr><th className="px-3 py-2 font-semibold">Linha</th><th className="px-3 py-2 font-semibold">Conteúdo</th><th className="px-3 py-2 font-semibold">Situação</th></tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {mostrar.map((v) => (
                      <tr key={v.n}>
                        <td className="num px-3 py-1.5 text-linha">{v.n}</td>
                        <td className="whitespace-pre px-3 py-1.5">{v.resumo}</td>
                        <td className={cx('px-3 py-1.5 font-medium', v.status === 'ok' ? 'text-agua' : v.status === 'erro' ? 'text-framboesa' : 'text-ambar')}>
                          {v.status === 'ok' ? (v.novaOficina || v.novoModelo ? 'ok, cria cadastro' : 'ok') : v.msg}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validadas.length > 300 && <p className="mt-2 text-[13px] text-linha">Mostrando 300 de {num(validadas.length)} linhas.</p>}
              <div className="mt-4 flex justify-end">
                <Botao variante="destaque" disabled={!aGravar.length || gravando} onClick={importar}>
                  {gravando ? 'Importando…' : `Importar ${num(aGravar.length)} ${tipo === 'precos' ? 'preços' : 'linhas'}`}
                </Botao>
              </div>
            </Painel>
          )}
        </>
      )}
    </>
  );
}
