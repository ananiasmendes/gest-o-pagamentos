'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Plug, RefreshCw, Unplug } from 'lucide-react';
import { useData, TABELAS_DA_SEPARACAO } from '@/lib/data';
import { api, sincronizarBling, useStatusBling, type SituacaoBling } from '@/lib/api';
import { num } from '@/lib/format';
import { Botao, Cabecalho, Carregando, Painel, Selecao, Texto, cx, useAviso } from '@/components/ui';
import { AvisoTabelas, haTempo } from '@/components/separacao/comum';

function Copiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try { await navigator.clipboard.writeText(valor); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* o campo continua selecionável */ }
  }
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-semibold text-linha">{rotulo}</span>
      <div className="flex gap-2">
        <Texto readOnly value={valor} onFocus={(e) => e.target.select()} className="font-mono text-[13px]" aria-label={rotulo} />
        <Botao variante="secundario" className="shrink-0" onClick={copiar}>{copiado ? <Check size={18} /> : <Copy size={18} />}{copiado ? 'Copiado' : 'Copiar'}</Botao>
      </div>
    </div>
  );
}

export default function BlingPage() {
  const { separacaoPronta, carregando, recarregar } = useData();
  const avisar = useAviso();
  const { status, erro, recarregar: recarregarStatus } = useStatusBling();
  const [origem, setOrigem] = useState('');
  const [abertas, setAbertas] = useState<number[]>([]);
  const [separado, setSeparado] = useState('');
  const [outroId, setOutroId] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  // volta do Bling: /bling?ok=1 ou /bling?erro=...
  useEffect(() => {
    setOrigem(window.location.origin);
    const q = new URLSearchParams(window.location.search);
    if (q.get('ok')) avisar('Conectado ao Bling.');
    if (q.get('erro')) avisar(`Não foi possível conectar: ${q.get('erro')}`, 'erro');
    if (q.get('ok') || q.get('erro')) window.history.replaceState(null, '', '/bling');
  }, [avisar]);

  useEffect(() => {
    if (!status) return;
    setAbertas(status.situacoes_abertas);
    setSeparado(status.situacao_separado ? String(status.situacao_separado) : '');
  }, [status]);

  async function rodar(nome: string, f: () => Promise<void>) {
    setOcupado(nome);
    try { await f(); } catch (e) { avisar((e as Error).message, 'erro'); }
    setOcupado(null);
  }

  const conectar = () => rodar('conectar', async () => {
    const r = await api<{ url: string }>('/api/bling/conectar', { method: 'POST' });
    window.location.href = r.url;
  });
  const desconectar = () => rodar('desconectar', async () => {
    if (!confirm('Desconectar do Bling? Os pedidos param de chegar até conectar de novo. Nada do que já foi separado é apagado.')) return;
    await api('/api/bling/conectar', { method: 'DELETE' });
    await recarregarStatus();
    avisar('Desconectado do Bling.');
  });
  const salvar = () => rodar('salvar', async () => {
    await api('/api/bling/config', { body: { situacoes_abertas: abertas, situacao_separado: separado || null } });
    await recarregarStatus();
    avisar('Situações gravadas.');
  });
  const relerSituacoes = () => rodar('reler', async () => {
    await api('/api/bling/config', { body: { recarregar: true } });
    await recarregarStatus();
    avisar('Lista de situações atualizada.');
  });
  const sincronizar = () => rodar('sincronizar', async () => {
    const n = await sincronizarBling();
    await recarregar(TABELAS_DA_SEPARACAO);
    await recarregarStatus();
    avisar(n ? `${num(n)} ${n === 1 ? 'pedido atualizado' : 'pedidos atualizados'}.` : 'Tudo em dia com o Bling.');
  });

  if (carregando) return <Carregando />;
  if (!separacaoPronta) return <><Cabecalho titulo="Integração Bling" /><AvisoTabelas /></>;
  if (!status) return <><Cabecalho titulo="Integração Bling" />{erro ? <p className="text-framboesa">{erro}</p> : <Carregando />}</>;

  const situacoes: SituacaoBling[] = [...status.situacoes];
  const idSeparado = Number(separado);
  if (separado && !situacoes.some((s) => s.id === idSeparado)) situacoes.push({ id: idSeparado, nome: `Situação ${separado}` });
  const alternar = (id: number) => setAbertas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  return (
    <>
      <Cabecalho titulo="Integração Bling" sub="Os pedidos de venda chegam do Bling, e o Bling é avisado quando a sacola fica pronta." />

      {status.faltando.length > 0 && (
        <div className="mb-5 rounded-xl border border-ambar/40 bg-ambar-claro px-5 py-4 text-[15px]">
          <p className="font-display text-lg font-bold">Faltam configurações na Vercel</p>
          <p className="mt-1">Em Settings › Environment Variables, cadastre e faça um novo deploy:</p>
          <ul className="mt-2 list-disc pl-5 font-mono text-[13px]">{status.faltando.map((v) => <li key={v}>{v}</li>)}</ul>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Painel titulo="Conexão">
          <div className="flex items-center gap-3">
            <span className={cx('inline-block h-3 w-3 rounded-full', status.conectado ? 'bg-agua' : 'bg-linha/40')} />
            <span className="text-[16px] font-semibold">{status.conectado ? 'Conectado ao Bling' : 'Não conectado'}</span>
          </div>
          {status.conectado && <p className="mt-1 text-[14px] text-linha">Última atualização dos pedidos: {haTempo(status.ultima_sync)}.</p>}
          {status.ultimo_erro && <p className="mt-2 rounded-lg bg-framboesa-claro px-3 py-2 text-sm text-framboesa-escuro">{status.ultimo_erro}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {status.conectado ? (
              <>
                <Botao onClick={sincronizar} disabled={!!ocupado}><RefreshCw size={18} className={ocupado === 'sincronizar' ? 'animate-spin' : ''} />{ocupado === 'sincronizar' ? 'Atualizando…' : 'Atualizar pedidos agora'}</Botao>
                <Botao variante="perigo" onClick={desconectar} disabled={!!ocupado}><Unplug size={18} />Desconectar</Botao>
              </>
            ) : (
              <Botao variante="destaque" onClick={conectar} disabled={!!ocupado || status.faltando.length > 0}><Plug size={18} />Conectar ao Bling</Botao>
            )}
          </div>
        </Painel>

        <Painel titulo="Endereços para o aplicativo no Bling">
          <div className="space-y-4">
            <Copiavel rotulo="Link de redirecionamento" valor={origem ? `${origem}/api/bling/callback` : ''} />
            <Copiavel rotulo="Endereço do webhook de pedidos de venda (opcional)" valor={origem ? `${origem}/api/bling/webhook` : ''} />
            <p className="text-[13px] text-linha">
              O link de redirecionamento vai no cadastro do aplicativo. O webhook faz o pedido novo aparecer em segundos;
              sem ele, os pedidos chegam quando a tela de Separação é aberta e a cada 2 minutos enquanto ela fica aberta.
            </p>
          </div>
        </Painel>

        {status.conectado && (
          <Painel titulo="Situações dos pedidos" className="lg:col-span-2"
            acao={<Botao variante="fantasma" className="h-9 px-3 text-sm" onClick={relerSituacoes} disabled={!!ocupado}><RefreshCw size={16} />Reler do Bling</Botao>}>
            <div className="grid gap-6 md:grid-cols-2">
              <div role="group" aria-label="Situações que aparecem na separação">
                <p className="mb-2 text-[13px] font-semibold text-linha">Pedidos nestas situações viram cards na Separação</p>
                <ul className="space-y-1">
                  {situacoes.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-papel">
                        <input type="checkbox" className="h-5 w-5 accent-[#911C19]" checked={abertas.includes(s.id)} disabled={String(s.id) === separado} onChange={() => alternar(s.id)} />
                        <span className="text-[15px] font-semibold">{s.nome}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-linha">Ao tocar em "Pedido pronto", o Bling muda para</span>
                  <Selecao value={separado} onChange={(e) => { setSeparado(e.target.value); setAbertas((a) => a.filter((x) => String(x) !== e.target.value)); }}>
                    <option value="">Não avisar o Bling</option>
                    {situacoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </Selecao>
                  <span className="mt-1 block text-xs text-linha">Crie a situação "Separado" nos pedidos de venda do Bling e toque em "Reler do Bling" para ela aparecer aqui.</span>
                </label>
                <div>
                  <span className="mb-1.5 block text-[13px] font-semibold text-linha">Não apareceu na lista? Informe o número (ID) da situação</span>
                  <div className="flex gap-2">
                    <Texto inputMode="numeric" placeholder="123456" value={outroId} onChange={(e) => setOutroId(e.target.value.replace(/\D/g, ''))} aria-label="ID da situação" />
                    <Botao variante="secundario" className="shrink-0" disabled={!outroId} onClick={() => { setSeparado(outroId); setAbertas((a) => a.filter((x) => String(x) !== outroId)); setOutroId(''); }}>Usar</Botao>
                  </div>
                </div>
                <Botao onClick={salvar} disabled={!!ocupado || !abertas.length}>{ocupado === 'salvar' ? 'Gravando…' : 'Gravar situações'}</Botao>
              </div>
            </div>
          </Painel>
        )}
      </div>
    </>
  );
}
