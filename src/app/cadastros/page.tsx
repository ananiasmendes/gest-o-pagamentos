'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useData, corOficina } from '@/lib/data';
import { supabase, mensagemErro } from '@/lib/supabase';
import { chave, num } from '@/lib/format';
import { TIPOS, type Modelo, type Oficina, type Tipo } from '@/lib/types';
import { Botao, Cabecalho, Campo, Carregando, Modal, Painel, Selecao, Texto, cx, useAviso } from '@/components/ui';

type EdicaoModelo = { id?: string; nome: string; tipo: Tipo; codigo: string; ativo: boolean };

export default function CadastrosPage() {
  const { oficinas, modelos, entradas, carregando, recarregar, cortesProntos } = useData();
  const avisar = useAviso();
  const [oficinaEd, setOficinaEd] = useState<{ id?: string; nome: string; ativa: boolean; faz_costura: boolean; faz_corte: boolean } | null>(null);
  const [modeloEd, setModeloEd] = useState<EdicaoModelo | null>(null);
  const [busca, setBusca] = useState('');
  const [juntar, setJuntar] = useState<{ de: string; para: string } | null>(null);

  const usoModelo = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entradas) if (e.modelo_id) m.set(e.modelo_id, (m.get(e.modelo_id) ?? 0) + e.quantidade);
    return m;
  }, [entradas]);
  const usoOficina = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entradas) m.set(e.oficina_id, (m.get(e.oficina_id) ?? 0) + 1);
    return m;
  }, [entradas]);

  const listaModelos = useMemo(() => {
    const k = chave(busca);
    return modelos.filter((m) => !k || chave(m.nome).includes(k) || (m.codigo ?? '').includes(k))
      .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [modelos, busca]);

  async function salvarOficina() {
    if (!oficinaEd || !oficinaEd.nome.trim()) return;
    const linha: Record<string, unknown> = { nome: oficinaEd.nome.trim(), ativa: oficinaEd.ativa };
    if (cortesProntos) { linha.faz_costura = oficinaEd.faz_costura; linha.faz_corte = oficinaEd.faz_corte; }
    const { error } = oficinaEd.id
      ? await supabase.from('oficinas').update(linha).eq('id', oficinaEd.id)
      : await supabase.from('oficinas').insert(linha);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    avisar(oficinaEd.id ? 'Cadastro atualizado.' : `${linha.nome} cadastrado. Agora defina os preços em Preços.`);
    setOficinaEd(null); recarregar(['oficinas']);
  }

  async function excluirOficina(o: Oficina) {
    if (!confirm(`Excluir ${o.nome}? Só é possível se não houver entradas nem pagamentos.`)) return;
    const { error } = await supabase.from('oficinas').delete().eq('id', o.id);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    setOficinaEd(null); recarregar(['oficinas', 'precos']);
  }

  async function salvarModelo() {
    if (!modeloEd || !modeloEd.nome.trim()) return;
    const linha = { nome: modeloEd.nome.trim(), tipo: modeloEd.tipo, codigo: modeloEd.codigo.trim() || null, ativo: modeloEd.ativo };
    const { error } = modeloEd.id
      ? await supabase.from('modelos').update(linha).eq('id', modeloEd.id)
      : await supabase.from('modelos').insert(linha);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    avisar(modeloEd.id ? 'Modelo atualizado.' : `${linha.nome} cadastrado. Defina o preço dele em Preços.`);
    setModeloEd(null); recarregar(['modelos']);
  }

  async function excluirModelo(id: string) {
    if (!confirm('Excluir este modelo? Só é possível se ele não tiver entradas.')) return;
    const { error } = await supabase.from('modelos').delete().eq('id', id);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    setModeloEd(null); recarregar(['modelos', 'precos']);
  }

  /** Junta um modelo duplicado em outro: move as entradas e apaga o duplicado. */
  async function juntarModelos() {
    if (!juntar || !juntar.de || !juntar.para || juntar.de === juntar.para) { avisar('Escolha dois modelos diferentes.', 'erro'); return; }
    const de = modelos.find((m) => m.id === juntar.de), para = modelos.find((m) => m.id === juntar.para);
    if (!confirm(`Todas as entradas de "${de?.nome}" passam para "${para?.nome}" (os valores já lançados não mudam) e "${de?.nome}" é apagado. Continuar?`)) return;
    const r1 = await supabase.from('entradas').update({ modelo_id: juntar.para }).eq('modelo_id', juntar.de);
    if (r1.error) { avisar(mensagemErro(r1.error), 'erro'); return; }
    // cortes, estoque e pedidos acompanham o modelo (se alguma tabela ainda não existe, o erro é ignorado)
    for (const t of ['corte_modelos', 'sku_bling', 'pedido_itens', 'sacola', 'estoque_mov']) await supabase.from(t).update({ modelo_id: juntar.para }).eq('modelo_id', juntar.de);
    const r2 = await supabase.from('modelos').delete().eq('id', juntar.de);
    if (r2.error) { avisar(mensagemErro(r2.error), 'erro'); return; }
    avisar(`"${de?.nome}" juntado em "${para?.nome}".`);
    setJuntar(null); recarregar();
  }

  if (carregando) return <Carregando />;

  return (
    <>
      <Cabecalho titulo="Oficinas e modelos" sub="Desative o que não usa mais: some das listas de lançamento, mas o histórico continua." />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Painel titulo="Oficinas e cortadores" acao={<Botao variante="secundario" className="h-9 px-3 text-sm" onClick={() => setOficinaEd({ nome: '', ativa: true, faz_costura: true, faz_corte: false })}><Plus size={16} />Novo</Botao>}>
          <ul className="divide-y divide-borda">
            {oficinas.map((o) => (
              <li key={o.id}>
                <button onClick={() => setOficinaEd({ ...o })} className="flex w-full items-center justify-between py-3 text-left">
                  <span className={cx('font-semibold', !o.ativa && 'text-linha line-through')}>
                    <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: corOficina(oficinas, o.id) }} />{o.nome}
                  </span>
                  <span className="text-right text-[13px] text-linha">
                    {[o.faz_costura && 'costura', o.faz_corte && 'corte'].filter(Boolean).join(' e ') || 'sem função'}
                    <span className="block">{num(usoOficina.get(o.id) ?? 0)} lançamentos</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Painel>

        <Painel titulo={`Modelos (${modelos.filter((m) => m.ativo).length} ativos)`}
          acao={<div className="flex gap-2">
            <Botao variante="fantasma" className="h-9 px-3 text-sm" onClick={() => setJuntar({ de: '', para: '' })}>Juntar duplicados</Botao>
            <Botao variante="secundario" className="h-9 px-3 text-sm" onClick={() => setModeloEd({ nome: '', tipo: 'Calcinha', codigo: '', ativo: true })}><Plus size={16} />Novo</Botao>
          </div>}>
          <Texto value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar modelo ou código" className="mb-3" />
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {listaModelos.map((m: Modelo) => (
              <li key={m.id} className="border-t border-borda">
                <button onClick={() => setModeloEd({ id: m.id, nome: m.nome, tipo: m.tipo, codigo: m.codigo ?? '', ativo: m.ativo })}
                  className="flex w-full items-center justify-between py-2.5 text-left">
                  <span>
                    <span className={cx('block font-semibold', !m.ativo && 'text-linha line-through')}>{m.nome}</span>
                    <span className="block text-[12px] text-linha">{m.tipo}{m.codigo ? `, código ${m.codigo}` : ''}</span>
                  </span>
                  <span className="num text-[13px] text-linha">{usoModelo.get(m.id) ? `${num(usoModelo.get(m.id)!)} peças` : 'sem uso'}</span>
                </button>
              </li>
            ))}
          </ul>
        </Painel>
      </div>

      <Modal aberto={!!oficinaEd} titulo={oficinaEd?.id ? 'Editar cadastro' : 'Nova oficina ou cortador'} onFechar={() => setOficinaEd(null)}
        rodape={<>
          {oficinaEd?.id && <Botao variante="perigo" onClick={() => excluirOficina(oficinaEd as Oficina)}>Excluir</Botao>}
          <div className="flex-1" /><Botao onClick={salvarOficina}>Salvar</Botao>
        </>}>
        {oficinaEd && (
          <div className="grid gap-4">
            <Campo rotulo="Nome"><Texto autoFocus value={oficinaEd.nome} onChange={(e) => setOficinaEd({ ...oficinaEd, nome: e.target.value })} /></Campo>
            <label className="flex items-center gap-3 text-[15px]">
              <input type="checkbox" className="h-5 w-5 accent-[#2A1614]" checked={oficinaEd.ativa} onChange={(e) => setOficinaEd({ ...oficinaEd, ativa: e.target.checked })} />
              Ativa (aparece no lançamento)
            </label>
            {cortesProntos && (<>
              <label className="flex items-center gap-3 text-[15px]">
                <input type="checkbox" className="h-5 w-5 accent-[#2A1614]" checked={oficinaEd.faz_costura} onChange={(e) => setOficinaEd({ ...oficinaEd, faz_costura: e.target.checked })} />
                Faz costura (recebe modelos dos cortes)
              </label>
              <label className="flex items-center gap-3 text-[15px]">
                <input type="checkbox" className="h-5 w-5 accent-[#2A1614]" checked={oficinaEd.faz_corte} onChange={(e) => setOficinaEd({ ...oficinaEd, faz_corte: e.target.checked })} />
                Faz corte (pode ser escolhido como cortador e recebe pelo corte)
              </label>
            </>)}
          </div>
        )}
      </Modal>

      <Modal aberto={!!modeloEd} titulo={modeloEd?.id ? 'Editar modelo' : 'Novo modelo'} onFechar={() => setModeloEd(null)}
        rodape={<>
          {modeloEd?.id && !usoModelo.get(modeloEd.id) && <Botao variante="perigo" onClick={() => excluirModelo(modeloEd.id!)}>Excluir</Botao>}
          <div className="flex-1" /><Botao onClick={salvarModelo}>Salvar</Botao>
        </>}>
        {modeloEd && (
          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="Nome" className="col-span-2"><Texto autoFocus value={modeloEd.nome} onChange={(e) => setModeloEd({ ...modeloEd, nome: e.target.value })} /></Campo>
            <Campo rotulo="Tipo">
              <Selecao value={modeloEd.tipo} onChange={(e) => setModeloEd({ ...modeloEd, tipo: e.target.value as Tipo })}>{TIPOS.map((t) => <option key={t}>{t}</option>)}</Selecao>
            </Campo>
            <Campo rotulo="Código (opcional)"><Texto value={modeloEd.codigo} onChange={(e) => setModeloEd({ ...modeloEd, codigo: e.target.value })} /></Campo>
            <label className="col-span-2 flex items-center gap-3 text-[15px]">
              <input type="checkbox" className="h-5 w-5 accent-[#2A1614]" checked={modeloEd.ativo} onChange={(e) => setModeloEd({ ...modeloEd, ativo: e.target.checked })} />
              Ativo (aparece no lançamento)
            </label>
          </div>
        )}
      </Modal>

      <Modal aberto={!!juntar} titulo="Juntar modelos duplicados" onFechar={() => setJuntar(null)}
        rodape={<><div className="flex-1" /><Botao onClick={juntarModelos}>Juntar</Botao></>}>
        {juntar && (
          <div className="grid gap-4">
            <p className="text-[15px] text-linha">Para quando o mesmo modelo foi cadastrado com dois nomes. As entradas do primeiro passam para o segundo.</p>
            <Campo rotulo="Modelo duplicado (será apagado)">
              <Selecao value={juntar.de} onChange={(e) => setJuntar({ ...juntar, de: e.target.value })}>
                <option value="">Escolha</option>{modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Modelo que fica">
              <Selecao value={juntar.para} onChange={(e) => setJuntar({ ...juntar, para: e.target.value })}>
                <option value="">Escolha</option>{modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </Selecao>
            </Campo>
          </div>
        )}
      </Modal>
    </>
  );
}
