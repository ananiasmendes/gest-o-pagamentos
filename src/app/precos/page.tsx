'use client';

import { useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { useData, corOficina } from '@/lib/data';
import { supabase, mensagemErro } from '@/lib/supabase';
import { precoVigente, historicoPreco, type AlvoPreco } from '@/lib/precos';
import { chave, dataBR, dec, hoje, parseNumero } from '@/lib/format';
import { TIPOS, type Operacao, type Preco, type Tipo } from '@/lib/types';
import { Botao, Cabecalho, Campo, Carregando, Modal, Painel, Pilulas, Selecao, Texto, Vazio, cx, useAviso } from '@/components/ui';

type Alvo = Omit<AlvoPreco, 'data'>;

/** Grava um preço: atualiza se já existe um registro na mesma data de vigência, senão cria um novo. */
async function gravarPreco(precos: Preco[], alvo: Alvo, valor: number, vigencia: string) {
  const mesmoDia = historicoPreco(precos, alvo).find((p) => p.vigente_desde === vigencia);
  if (mesmoDia) return supabase.from('precos').update({ valor }).eq('id', mesmoDia.id);
  return supabase.from('precos').insert({
    oficina_id: alvo.oficina_id, operacao: alvo.operacao, valor, vigente_desde: vigencia,
    modelo_id: alvo.operacao === 'Costura' ? alvo.modelo_id : null, tipo: alvo.operacao === 'Corte' ? alvo.tipo : null,
  });
}

function Celula({ alvo, vigencia, onHistorico }: { alvo: Alvo; vigencia: string; onHistorico: (a: Alvo) => void }) {
  const { precos, recarregar } = useData();
  const avisar = useAviso();
  const atual = precoVigente(precos, { ...alvo, data: vigencia });
  const hist = historicoPreco(precos, alvo);
  const [texto, setTexto] = useState(atual ? dec(atual.valor) : '');
  const [estado, setEstado] = useState<'' | 'salvando' | 'ok'>('');

  useEffect(() => { setTexto(atual ? dec(atual.valor) : ''); }, [atual?.id, atual?.valor]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    const v = parseNumero(texto);
    if (texto.trim() === '' || v === null) { setTexto(atual ? dec(atual.valor) : ''); return; }
    if (atual && Math.abs(atual.valor - v) < 0.00001) return;
    setEstado('salvando');
    const { error } = await gravarPreco(precos, alvo, v, vigencia);
    if (error) { setEstado(''); avisar(mensagemErro(error), 'erro'); return; }
    await recarregar(['precos']);
    setEstado('ok'); setTimeout(() => setEstado(''), 1500);
  }

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-2.5 text-[13px] text-linha">R$</span>
        <input
          inputMode="decimal" value={texto} placeholder="—" aria-label="Preço"
          onChange={(e) => setTexto(e.target.value)} onBlur={salvar}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className={cx('num h-10 w-[6.5rem] rounded-lg border bg-tecido pl-8 pr-2 text-right text-[15px] font-semibold focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo/15',
            !atual ? 'border-ambar/60 bg-ambar-claro' : estado === 'ok' ? 'border-agua' : 'border-borda')}
        />
      </div>
      <button type="button" aria-label="Histórico de preços" disabled={hist.length === 0} onClick={() => onHistorico(alvo)}
        className={cx('rounded-md p-1.5', hist.length > 1 ? 'text-indigo hover:bg-indigo-claro' : 'text-borda')}>
        <History size={15} />
      </button>
    </div>
  );
}

export default function PrecosPage() {
  const { oficinas, modelos, precos, carregando, recarregar, nomeOficina } = useData();
  const avisar = useAviso();
  const [aba, setAba] = useState<Operacao>('Costura');
  const [vigencia, setVigencia] = useState(hoje());
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<'' | Tipo>('');
  const [historico, setHistorico] = useState<Alvo | null>(null);
  const [copiar, setCopiar] = useState(false);
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');

  const ativas = oficinas.filter((o) => o.ativa);
  const lista = useMemo(() => {
    const k = chave(busca);
    return modelos.filter((m) => m.ativo && (!tipo || m.tipo === tipo) && (!k || chave(m.nome).includes(k) || (m.codigo ?? '').includes(k)));
  }, [modelos, busca, tipo]);

  const faltando = useMemo(() => {
    let n = 0;
    for (const m of modelos.filter((x) => x.ativo)) for (const o of ativas)
      if (!precoVigente(precos, { oficina_id: o.id, operacao: 'Costura', modelo_id: m.id, data: vigencia })) n++;
    return n;
  }, [modelos, ativas, precos, vigencia]);

  async function copiarPrecos() {
    if (!origem || !destino || origem === destino) { avisar('Escolha duas oficinas diferentes.', 'erro'); return; }
    let feitos = 0;
    for (const m of modelos.filter((x) => x.ativo)) {
      const p = precoVigente(precos, { oficina_id: origem, operacao: 'Costura', modelo_id: m.id, data: vigencia });
      if (!p) continue;
      const { error } = await gravarPreco(precos, { oficina_id: destino, operacao: 'Costura', modelo_id: m.id }, p.valor, vigencia);
      if (error) { avisar(mensagemErro(error), 'erro'); break; }
      feitos++;
    }
    for (const t of TIPOS) {
      const p = precoVigente(precos, { oficina_id: origem, operacao: 'Corte', tipo: t, data: vigencia });
      if (p) await gravarPreco(precos, { oficina_id: destino, operacao: 'Corte', tipo: t }, p.valor, vigencia);
    }
    await recarregar(['precos']);
    avisar(`${feitos} preços copiados de ${nomeOficina(origem)} para ${nomeOficina(destino)}.`);
    setCopiar(false);
  }

  async function excluirPreco(p: Preco) {
    if (!confirm(`Excluir o preço de R$ ${dec(p.valor)} vigente desde ${dataBR(p.vigente_desde)}? As entradas já lançadas não mudam.`)) return;
    const { error } = await supabase.from('precos').delete().eq('id', p.id);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    recarregar(['precos']);
  }

  if (carregando) return <Carregando />;
  if (!ativas.length) return <><Cabecalho titulo="Preços" /><Vazio titulo="Cadastre uma oficina primeiro" /></>;

  const hist = historico ? historicoPreco(precos, historico) : [];
  const tituloHist = historico
    ? `${historico.operacao === 'Costura' ? modelos.find((m) => m.id === historico.modelo_id)?.nome : `Corte de ${historico.tipo?.toLowerCase()}`} com ${nomeOficina(historico.oficina_id)}`
    : '';

  return (
    <>
      <Cabecalho titulo="Preços"
        sub="Cada oficina tem seu preço por modelo. Mudar um preço só afeta lançamentos a partir da data de vigência."
        acoes={<Botao variante="secundario" onClick={() => { setOrigem(ativas[0]?.id ?? ''); setDestino(ativas[1]?.id ?? ''); setCopiar(true); }}>Copiar entre oficinas</Botao>} />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Pilulas rotulo="Operação" valor={aba} onChange={setAba} opcoes={[{ valor: 'Costura', rotulo: 'Costura por modelo' }, { valor: 'Corte', rotulo: 'Corte por tipo' }]} />
        <Campo rotulo="Novos valores valem a partir de" className="w-52">
          <Texto type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value || hoje())} />
        </Campo>
      </div>

      {aba === 'Costura' ? (
        <Painel>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Campo rotulo="Buscar" className="w-56"><Texto value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou código" /></Campo>
            <Campo rotulo="Tipo" className="w-40">
              <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as '' | Tipo)}>
                <option value="">Todos</option>{TIPOS.map((t) => <option key={t}>{t}</option>)}
              </Selecao>
            </Campo>
            {faltando > 0 && <p className="pb-2.5 text-sm font-medium text-ambar">{faltando} combinações sem preço, destacadas em amarelo.</p>}
          </div>
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <table className="w-full min-w-[420px] text-[14px]">
              <thead>
                <tr className="text-left text-[13px] text-linha">
                  <th className="pb-2 font-semibold">Modelo</th>
                  {ativas.map((o) => (
                    <th key={o.id} className="pb-2 font-semibold">
                      <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: corOficina(oficinas, o.id) }} />{o.nome}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id} className="border-t border-borda">
                    <td className="py-2 pr-3">
                      <div className="font-semibold">{m.nome}</div>
                      <div className="text-[12px] text-linha">{m.tipo}{m.codigo ? `, código ${m.codigo}` : ''}</div>
                    </td>
                    {ativas.map((o) => (
                      <td key={o.id} className="py-2 pr-3">
                        <Celula alvo={{ oficina_id: o.id, operacao: 'Costura', modelo_id: m.id }} vigencia={vigencia} onHistorico={setHistorico} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      ) : (
        <Painel>
          <p className="mb-4 text-[15px] text-linha">O corte é pago pela quantidade de peças cortadas, sem importar o modelo.</p>
          <table className="w-full max-w-xl text-[14px]">
            <thead><tr className="text-left text-[13px] text-linha"><th className="pb-2 font-semibold">Tipo</th>{ativas.map((o) => <th key={o.id} className="pb-2 font-semibold">{o.nome}</th>)}</tr></thead>
            <tbody>
              {TIPOS.map((t) => (
                <tr key={t} className="border-t border-borda">
                  <td className="py-2 pr-3 font-semibold">{t}</td>
                  {ativas.map((o) => (
                    <td key={o.id} className="py-2 pr-3"><Celula alvo={{ oficina_id: o.id, operacao: 'Corte', tipo: t }} vigencia={vigencia} onHistorico={setHistorico} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Painel>
      )}

      <Modal aberto={!!historico} titulo="Histórico de preço" onFechar={() => setHistorico(null)}>
        <p className="mb-3 font-semibold">{tituloHist}</p>
        <ul className="divide-y divide-borda">
          {hist.map((p, i) => (
            <li key={p.id} className="flex items-center justify-between py-2.5">
              <span>
                <span className="num font-semibold">R$ {dec(p.valor)}</span>
                <span className="ml-2 text-[13px] text-linha">desde {dataBR(p.vigente_desde)}{i === 0 ? ', atual' : ''}</span>
              </span>
              <Botao variante="perigo" className="h-9 px-3 text-sm" onClick={() => excluirPreco(p)}>Excluir</Botao>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal aberto={copiar} titulo="Copiar preços entre oficinas" onFechar={() => setCopiar(false)}
        rodape={<><div className="flex-1" /><Botao variante="secundario" onClick={() => setCopiar(false)}>Cancelar</Botao><Botao onClick={copiarPrecos}>Copiar preços</Botao></>}>
        <p className="mb-4 text-[15px] text-linha">Útil quando entra uma oficina nova. Os preços copiados valem a partir de {dataBR(vigencia)} e depois podem ser ajustados um a um.</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="De"><Selecao value={origem} onChange={(e) => setOrigem(e.target.value)}>{oficinas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</Selecao></Campo>
          <Campo rotulo="Para"><Selecao value={destino} onChange={(e) => setDestino(e.target.value)}>{oficinas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</Selecao></Campo>
        </div>
      </Modal>
    </>
  );
}
