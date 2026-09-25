'use client';

import { useEffect, useState } from 'react';
import { useData } from '@/lib/data';
import { supabase, mensagemErro } from '@/lib/supabase';
import { precoVigente } from '@/lib/precos';
import { brl, dec, parseNumero } from '@/lib/format';
import { TAMANHOS, TIPOS, type Entrada, type Operacao, type Tipo } from '@/lib/types';
import { Botao, Campo, Modal, Selecao, Texto, useAviso } from './ui';

export default function EditarEntrada({ entrada, onFechar }: { entrada: Entrada | null; onFechar: () => void }) {
  const { oficinas, modelos, precos, recarregar } = useData();
  const avisar = useAviso();
  const [f, setF] = useState({
    data: '', oficina_id: '', operacao: 'Costura' as Operacao, modelo_id: '', tipo: 'Calcinha' as Tipo,
    tamanho: '', quantidade: '', valor: '', observacao: '',
  });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!entrada) return;
    setF({
      data: entrada.data, oficina_id: entrada.oficina_id, operacao: entrada.operacao, modelo_id: entrada.modelo_id ?? '',
      tipo: entrada.tipo, tamanho: entrada.tamanho ?? '', quantidade: String(entrada.quantidade),
      valor: dec(entrada.valor_unitario), observacao: entrada.observacao ?? '',
    });
  }, [entrada]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const modelo = modelos.find((m) => m.id === f.modelo_id);
  const tabela = f.oficina_id ? precoVigente(precos, {
    oficina_id: f.oficina_id, operacao: f.operacao, data: f.data,
    modelo_id: f.operacao === 'Costura' ? f.modelo_id : null, tipo: f.operacao === 'Corte' ? f.tipo : null,
  }) : null;
  const qtd = parseInt(f.quantidade, 10) || 0;
  const vu = parseNumero(f.valor);

  async function salvar() {
    if (!entrada) return;
    if (!qtd || vu === null || (f.operacao === 'Costura' && !f.modelo_id)) { avisar('Preencha modelo, quantidade e valor.', 'erro'); return; }
    setSalvando(true);
    const { error } = await supabase.from('entradas').update({
      data: f.data, oficina_id: f.oficina_id, operacao: f.operacao,
      modelo_id: f.operacao === 'Costura' ? f.modelo_id : null,
      tipo: f.operacao === 'Costura' ? modelo?.tipo ?? f.tipo : f.tipo,
      tamanho: f.operacao === 'Costura' ? f.tamanho || null : null,
      quantidade: qtd, valor_unitario: vu, observacao: f.observacao.trim() || null,
    }).eq('id', entrada.id);
    setSalvando(false);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    avisar('Entrada atualizada.');
    await recarregar(['entradas']);
    onFechar();
  }

  async function excluir() {
    if (!entrada || !confirm('Excluir esta entrada? Isso muda o saldo da oficina.')) return;
    const { error } = await supabase.from('entradas').delete().eq('id', entrada.id);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    avisar('Entrada excluída.');
    await recarregar(['entradas']);
    onFechar();
  }

  return (
    <Modal aberto={!!entrada} titulo="Editar entrada" onFechar={onFechar}
      rodape={<>
        <Botao variante="perigo" onClick={excluir}>Excluir</Botao>
        <div className="flex-1" />
        <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Botao>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Data"><Texto type="date" value={f.data} onChange={set('data')} /></Campo>
        <Campo rotulo="Oficina">
          <Selecao value={f.oficina_id} onChange={set('oficina_id')}>
            {oficinas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Operação">
          <Selecao value={f.operacao} onChange={set('operacao')}>
            <option>Costura</option><option>Corte</option>
          </Selecao>
        </Campo>
        {f.operacao === 'Costura' ? (
          <Campo rotulo="Tamanho">
            <Selecao value={f.tamanho} onChange={set('tamanho')}>
              <option value="">—</option>
              {TAMANHOS.map((t) => <option key={t}>{t}</option>)}
            </Selecao>
          </Campo>
        ) : (
          <Campo rotulo="Tipo">
            <Selecao value={f.tipo} onChange={set('tipo')}>{TIPOS.map((t) => <option key={t}>{t}</option>)}</Selecao>
          </Campo>
        )}
        {f.operacao === 'Costura' && (
          <Campo rotulo="Modelo" className="col-span-2">
            <Selecao value={f.modelo_id} onChange={set('modelo_id')}>
              <option value="">Escolha o modelo</option>
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.ativo ? '' : ' (inativo)'}</option>)}
            </Selecao>
          </Campo>
        )}
        <Campo rotulo="Quantidade"><Texto type="number" inputMode="numeric" value={f.quantidade} onChange={set('quantidade')} /></Campo>
        <Campo rotulo="Valor por peça (R$)"
          dica={tabela ? (
            Math.abs(tabela.valor - (vu ?? -1)) > 0.0001
              ? <button type="button" className="font-semibold text-indigo underline" onClick={() => setF((x) => ({ ...x, valor: dec(tabela.valor) }))}>Usar tabela: R$ {dec(tabela.valor)}</button>
              : 'Igual à tabela'
          ) : 'Sem preço na tabela para esta combinação'}>
          <Texto inputMode="decimal" value={f.valor} onChange={set('valor')} />
        </Campo>
        <Campo rotulo="Observação" className="col-span-2"><Texto value={f.observacao} onChange={set('observacao')} /></Campo>
      </div>
      <p className="num mt-4 text-right font-display text-xl font-bold">{vu !== null ? brl(qtd * vu) : '—'}</p>
    </Modal>
  );
}
