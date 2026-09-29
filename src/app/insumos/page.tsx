'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useData } from '@/lib/data';
import { supabase, mensagemErro } from '@/lib/supabase';
import { quantidadeCompra, textoCompra } from '@/lib/cortes/calc';
import { chave, num, parseNumero } from '@/lib/format';
import { CATEGORIAS_INSUMO, type CategoriaInsumo, type Insumo } from '@/lib/types';
import { Botao, Cabecalho, Campo, Carregando, Modal, Painel, Selecao, Texto, cx, useAviso } from '@/components/ui';
import { AvisoMigracao } from '@/components/cortes/comum';

type Edicao = {
  id?: string; nome: string; unidade_consumo: string; unidade_compra: string; fator: string; multiplo: string; por_cor: boolean; no_pedido: boolean; ativo: boolean;
  categoria: CategoriaInsumo; preco: string; preco_qtd: string;
};
const UNIDADES_CONSUMO = [{ v: 'm', r: 'metros (m)' }, { v: 'kg', r: 'quilos (kg)' }, { v: 'un', r: 'unidades (un)' }];
const fmt = (n: number | null) => (n === null ? '' : n.toLocaleString('pt-BR', { maximumFractionDigits: 4, useGrouping: false }));

export default function InsumosPage() {
  const { insumos, cores, ficha, carregando, cortesProntos, precificacaoPronta, recarregar } = useData();
  const avisar = useAviso();
  const [ed, setEd] = useState<Edicao | null>(null);
  const [busca, setBusca] = useState('');
  const [novaCor, setNovaCor] = useState('');

  const uso = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of ficha) m.set(f.insumo_id, (m.get(f.insumo_id) ?? 0) + 1);
    return m;
  }, [ficha]);

  if (carregando) return <Carregando />;
  if (!cortesProntos) return <><Cabecalho titulo="Insumos e cores" /><AvisoMigracao /></>;

  const lista = insumos.filter((i) => !busca || chave(i.nome).includes(chave(busca)))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));

  const abrir = (i?: Insumo) => setEd(i ? {
    id: i.id, nome: i.nome, unidade_consumo: i.unidade_consumo, unidade_compra: i.unidade_compra,
    fator: fmt(i.fator), multiplo: fmt(i.multiplo), por_cor: i.por_cor, no_pedido: i.no_pedido, ativo: i.ativo,
    categoria: i.categoria ?? 'M.P', preco: fmt(i.preco ?? null), preco_qtd: fmt(i.preco_qtd ?? 1),
  } : { nome: '', unidade_consumo: 'm', unidade_compra: 'Rolos', fator: '100', multiplo: '1', por_cor: true, no_pedido: true, ativo: true, categoria: 'M.P', preco: '', preco_qtd: '100' });

  async function salvar() {
    if (!ed || !ed.nome.trim()) return;
    const fator = parseNumero(ed.fator), multiplo = ed.multiplo.trim() ? parseNumero(ed.multiplo) : null;
    if (!fator || fator <= 0 || (multiplo !== null && multiplo <= 0)) { avisar('Confira o tamanho da embalagem e o arredondamento.', 'erro'); return; }
    const linha: Record<string, unknown> = {
      nome: ed.nome.trim(), unidade_consumo: ed.unidade_consumo, unidade_compra: ed.unidade_compra.trim() || 'Un',
      fator, multiplo, por_cor: ed.por_cor, no_pedido: ed.no_pedido, ativo: ed.ativo,
    };
    if (precificacaoPronta) {
      const preco = ed.preco.trim() ? parseNumero(ed.preco) : null, precoQtd = parseNumero(ed.preco_qtd) || 1;
      const mudou = ed.id ? (() => { const i = insumos.find((x) => x.id === ed.id); return i?.preco !== preco || i?.preco_qtd !== precoQtd; })() : preco !== null;
      Object.assign(linha, { categoria: ed.categoria, preco, preco_qtd: precoQtd, ...(mudou ? { preco_atualizado_em: new Date().toISOString().slice(0, 10) } : {}) });
    }
    const { error } = ed.id ? await supabase.from('insumos').update(linha).eq('id', ed.id) : await supabase.from('insumos').insert(linha);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    avisar(ed.id ? 'Insumo atualizado.' : `${ed.nome.trim()} cadastrado. Use-o na ficha técnica dos modelos.`);
    setEd(null); recarregar(['insumos']);
  }
  async function excluir() {
    if (!ed?.id || !confirm(`Excluir ${ed.nome}? Ele sai também da ficha técnica de todos os modelos.`)) return;
    const { error } = await supabase.from('insumos').delete().eq('id', ed.id);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    setEd(null); recarregar(['insumos', 'ficha_tecnica']);
  }
  async function adicionarCor() {
    const n = novaCor.trim();
    if (!n) return;
    const { error } = await supabase.from('cores').insert({ nome: n });
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    setNovaCor(''); recarregar(['cores']);
  }
  async function alternarCor(id: string, ativa: boolean) {
    const { error } = await supabase.from('cores').update({ ativa }).eq('id', id);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    recarregar(['cores']);
  }

  // exemplo ao vivo da regra de compra
  const exemplo = (() => {
    if (!ed) return null;
    const fator = parseNumero(ed.fator), multiplo = ed.multiplo.trim() ? parseNumero(ed.multiplo) : null;
    if (!fator) return null;
    const ins = { fator, multiplo, unidade_compra: ed.unidade_compra || 'Un' } as Insumo;
    const consumo = ed.unidade_consumo === 'kg' ? 3.3 : ed.unidade_consumo === 'm' ? 250 : 88;
    return `Ex.: consumo de ${num(consumo)} ${ed.unidade_consumo} vira ${textoCompra(quantidadeCompra(consumo, ins), ins)} no pedido.`;
  })();

  return (
    <>
      <Cabecalho titulo="Insumos e cores" sub="Como cada insumo é comprado. O pedido de material arredonda para a embalagem." />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Painel titulo={`Insumos (${insumos.filter((i) => i.ativo).length})`}
          acao={<Botao variante="secundario" className="h-9 px-3 text-sm" onClick={() => abrir()}><Plus size={16} />Novo</Botao>}>
          <Texto value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar insumo" className="mb-3" />
          <ul className="divide-y divide-borda">
            {lista.map((i) => (
              <li key={i.id}>
                <button onClick={() => abrir(i)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
                  <span className="min-w-0">
                    <span className={cx('block font-semibold', !i.ativo && 'text-linha line-through')}>{i.nome}</span>
                    <span className="block text-[12px] text-linha">
                      {i.fator === 1 ? `em ${i.unidade_compra.toLowerCase()}` : `${i.unidade_compra} de ${num(i.fator)} ${i.unidade_consumo}`}
                      {i.multiplo && i.multiplo !== 1 ? `, de ${fmt(i.multiplo)} em ${fmt(i.multiplo)}` : ''}
                      {!i.por_cor && ', uma quantidade para todas as cores'}
                      {!i.no_pedido && ', fora do pedido por padrão'}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] text-linha">{uso.get(i.id) ?? 0} modelos</span>
                </button>
              </li>
            ))}
          </ul>
        </Painel>

        <Painel titulo="Cores" className="lg:self-start">
          <ul className="divide-y divide-borda">
            {[...cores].sort((a, b) => Number(b.ativa) - Number(a.ativa) || a.nome.localeCompare(b.nome, 'pt-BR')).map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <span className={cx('font-semibold', !c.ativa && 'text-linha line-through')}>{c.nome}</span>
                <button className="text-[13px] font-semibold text-indigo underline" onClick={() => alternarCor(c.id, !c.ativa)}>{c.ativa ? 'Desativar' : 'Ativar'}</button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Texto value={novaCor} onChange={(e) => setNovaCor(e.target.value)} placeholder="Nova cor" onKeyDown={(e) => { if (e.key === 'Enter') adicionarCor(); }} />
            <Botao variante="secundario" onClick={adicionarCor} aria-label="Adicionar cor"><Plus size={16} /></Botao>
          </div>
        </Painel>
      </div>

      <Modal aberto={!!ed} titulo={ed?.id ? 'Editar insumo' : 'Novo insumo'} onFechar={() => setEd(null)}
        rodape={<>{ed?.id && <Botao variante="perigo" onClick={excluir}>Excluir</Botao>}<div className="flex-1" /><Botao onClick={salvar}>Salvar</Botao></>}>
        {ed && (
          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="Nome" className="col-span-2"><Texto value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} /></Campo>
            <Campo rotulo="Consumo na ficha em">
              <Selecao value={ed.unidade_consumo} onChange={(e) => setEd({ ...ed, unidade_consumo: e.target.value })}>
                {UNIDADES_CONSUMO.map((u) => <option key={u.v} value={u.v}>{u.r}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Compra em"><Texto value={ed.unidade_compra} onChange={(e) => setEd({ ...ed, unidade_compra: e.target.value })} placeholder="Rolos, Kg, Pares…" /></Campo>
            <Campo rotulo={`Quanto vem em 1 (${ed.unidade_compra || 'unidade'})`} dica={`em ${ed.unidade_consumo}. Rolo de 100 m: 100. Par: 2.`}>
              <Texto inputMode="decimal" value={ed.fator} onChange={(e) => setEd({ ...ed, fator: e.target.value })} />
            </Campo>
            <Campo rotulo="Arredondar de quanto em quanto" dica="Em unidades de compra. Pacote de 50 pares: 50. Meio quilo: 0,5. Vazio: não arredonda.">
              <Texto inputMode="decimal" value={ed.multiplo} onChange={(e) => setEd({ ...ed, multiplo: e.target.value })} />
            </Campo>
            {exemplo && <p className="col-span-2 rounded-lg bg-papel px-3 py-2 text-[14px]">{exemplo}</p>}
            {precificacaoPronta && (<>
              <Campo rotulo="Preço (R$)" dica="Quanto você paga">
                <Texto inputMode="decimal" value={ed.preco} onChange={(e) => setEd({ ...ed, preco: e.target.value })} placeholder="0,00" />
              </Campo>
              <Campo rotulo={`Por quanto (${ed.unidade_consumo})`} dica={(() => { const p = parseNumero(ed.preco), q = parseNumero(ed.preco_qtd); return p !== null && q ? `R$ ${(p / q).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} por ${ed.unidade_consumo}` : 'Ex.: 45 m de renda por R$ 59,90'; })()}>
                <Texto inputMode="decimal" value={ed.preco_qtd} onChange={(e) => setEd({ ...ed, preco_qtd: e.target.value })} />
              </Campo>
              <Campo rotulo="Categoria" className="col-span-2">
                <Selecao value={ed.categoria} onChange={(e) => setEd({ ...ed, categoria: e.target.value as CategoriaInsumo })}>
                  {CATEGORIAS_INSUMO.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                </Selecao>
              </Campo>
            </>)}
            <label className="col-span-2 flex items-center gap-3 text-[15px]">
              <input type="checkbox" className="h-5 w-5 accent-[#231F35]" checked={ed.por_cor} onChange={(e) => setEd({ ...ed, por_cor: e.target.checked })} />
              Comprar separado por cor
            </label>
            <label className="col-span-2 flex items-center gap-3 text-[15px]">
              <input type="checkbox" className="h-5 w-5 accent-[#231F35]" checked={ed.no_pedido} onChange={(e) => setEd({ ...ed, no_pedido: e.target.checked })} />
              Aparece no pedido de material (dá para mudar em cada corte)
            </label>
            <label className="col-span-2 flex items-center gap-3 text-[15px]">
              <input type="checkbox" className="h-5 w-5 accent-[#231F35]" checked={ed.ativo} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })} />
              Ativo
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}
