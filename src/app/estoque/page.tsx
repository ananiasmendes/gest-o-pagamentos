'use client';

import { useMemo, useState } from 'react';
import { ClipboardCheck, Download, Scissors, ShoppingBag } from 'lucide-react';
import { useData } from '@/lib/data';
import { supabase, mensagemErro } from '@/lib/supabase';
import { alocar, calcularPrateleira, chaveSku, TAMANHOS_ESTOQUE, type SituacaoSku } from '@/lib/separacao';
import { baixarPlanilha } from '@/lib/exportar';
import { chave, dataBR, hoje, num } from '@/lib/format';
import type { Modelo } from '@/lib/types';
import { Botao, Cabecalho, Carregando, Modal, Painel, Pilulas, Texto, Vazio, cx, useAviso } from '@/components/ui';
import { AvisoTabelas } from '@/components/separacao/comum';

type Filtro = 'todos' | 'com' | 'produzir';
const ZERO: SituacaoSku = { prateleira: 0, nasSacolas: 0, reservado: 0, livre: 0, produzir: 0 };

function Numero({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <div className="min-w-0 py-2 md:px-5 md:py-1">
      <div className="text-[13px] font-semibold text-linha">{rotulo}</div>
      <div className={cx('num font-display text-[26px] font-bold leading-tight', cor)}>{valor}</div>
      {detalhe && <div className="text-xs text-linha">{detalhe}</div>}
    </div>
  );
}

export default function EstoquePage() {
  const { modelos, pedidos, pedidoItens, sacola, entradas, estoqueMov, estoqueInicio, skusBling, carregando, separacaoPronta, recarregar } = useData();
  const avisar = useAviso();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [contando, setContando] = useState<{ modelo: Modelo; valores: Record<string, string> } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const calc = useMemo(() => {
    const prateleira = calcularPrateleira({ entradas, movimentos: estoqueMov, sacola, inicio: estoqueInicio });
    const { skus } = alocar({ pedidos, itens: pedidoItens, sacola, prateleira });
    // tamanhos de cada modelo: os que existem no Bling, mais os que já tiveram movimento
    const tamanhos = new Map<string, Set<string>>();
    const add = (m: string, t: string) => { const s = tamanhos.get(m); if (s) s.add(t); else tamanhos.set(m, new Set([t])); };
    for (const s of skusBling) add(s.modelo_id, s.tamanho);
    skus.forEach((_v, k) => { const [m, t] = k.split('|'); add(m, t); });
    return { skus, tamanhos };
  }, [entradas, estoqueMov, sacola, estoqueInicio, pedidos, pedidoItens, skusBling]);

  const sku = (m: string, t: string) => calc.skus.get(chaveSku(m, t)) ?? ZERO;
  const tamanhosDe = (m: string) => {
    const s = calc.tamanhos.get(m);
    return TAMANHOS_ESTOQUE.filter((t) => (s ? s.has(t) : t !== 'U'));
  };

  const linhas = useMemo(() => {
    const k = chave(busca);
    return modelos
      .map((m) => {
        const ts = tamanhosDe(m.id).map((t) => ({ t, ...sku(m.id, t) }));
        const soma = (f: (x: SituacaoSku) => number) => ts.reduce((s, x) => s + f(x), 0);
        return { m, ts, prateleira: soma((x) => x.prateleira), nasSacolas: soma((x) => x.nasSacolas), livre: soma((x) => x.livre), produzir: soma((x) => x.produzir), mexeu: ts.some((x) => x.prateleira || x.nasSacolas || x.produzir) };
      })
      .filter((l) => (l.m.ativo || l.mexeu) && (!k || chave(l.m.nome).includes(k) || (l.m.codigo ?? '').includes(k)))
      .filter((l) => (filtro === 'todos' ? true : filtro === 'com' ? l.prateleira > 0 || l.nasSacolas > 0 : l.produzir > 0))
      .sort((a, b) => (filtro === 'produzir' ? b.produzir - a.produzir : 0) || a.m.nome.localeCompare(b.m.nome));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelos, calc, busca, filtro]);

  const total = useMemo(() => {
    const t = { prateleira: 0, nasSacolas: 0, livre: 0, produzir: 0 };
    calc.skus.forEach((s) => { t.prateleira += Math.max(0, s.prateleira); t.nasSacolas += s.nasSacolas; t.livre += Math.max(0, s.livre); t.produzir += s.produzir; });
    return t;
  }, [calc]);

  function abrirContagem(m: Modelo) {
    const valores: Record<string, string> = {};
    for (const t of TAMANHOS_ESTOQUE) valores[t] = String(sku(m.id, t).prateleira);
    setContando({ modelo: m, valores });
  }

  async function salvarContagem() {
    if (!contando) return;
    const { modelo, valores } = contando;
    const mov: { modelo_id: string; tamanho: string; quantidade: number; motivo: string; observacao: string }[] = [];
    for (const t of TAMANHOS_ESTOQUE) {
      const digitado = valores[t].trim();
      if (digitado === '' || !/^-?\d+$/.test(digitado)) continue;
      const diferenca = parseInt(digitado, 10) - sku(modelo.id, t).prateleira;
      if (diferenca) mov.push({ modelo_id: modelo.id, tamanho: t, quantidade: diferenca, motivo: 'contagem', observacao: `Contagem de ${dataBR(hoje())}` });
    }
    if (!mov.length) { setContando(null); return; }
    setSalvando(true);
    const { error } = await supabase.from('estoque_mov').insert(mov);
    setSalvando(false);
    if (error) { avisar(mensagemErro(error), 'erro'); return; }
    await recarregar(['estoque_mov']);
    avisar(`Contagem de ${modelo.nome} gravada.`);
    setContando(null);
  }

  function exportar() {
    const out: Record<string, unknown>[] = [];
    for (const l of linhas) for (const x of l.ts) {
      out.push({ Modelo: l.m.nome, 'Código': l.m.codigo ?? '', Tipo: l.m.tipo, Tamanho: x.t, 'Na prateleira': x.prateleira, 'Nas sacolas': x.nasSacolas, 'Reservado para pedidos': x.reservado, 'Livre para vender': x.livre, 'Falta produzir': x.produzir });
    }
    if (!out.length) { avisar('Nada para exportar neste filtro.', 'erro'); return; }
    baixarPlanilha(`estoque-${hoje()}.xlsx`, [{ nome: 'Estoque', linhas: out }]);
  }

  if (carregando) return <Carregando />;
  if (!separacaoPronta) return <><Cabecalho titulo="Estoque" /><AvisoTabelas /></>;

  const semContagem = estoqueMov.length === 0;

  return (
    <>
      <Cabecalho titulo="Estoque" sub="O que está livre para vender, o que já está em sacola e o que os pedidos ainda esperam."
        acoes={<Botao variante="secundario" onClick={exportar}><Download size={18} />Excel</Botao>} />

      {semContagem && (
        <div className="mb-5 rounded-xl border border-ambar/40 bg-ambar-claro px-5 py-4 text-[15px]">
          <p className="font-display text-lg font-bold">Comece contando o que há na prateleira</p>
          <p className="mt-1">
            Toque em <strong>Contar</strong> em cada modelo e digite quantas peças soltas existem por tamanho. Peças que já estão em sacola de pedido
            entram pela tela de Separação, não aqui. Depois da contagem, as Entradas das oficinas somam sozinhas
            {estoqueInicio ? <> (valem as lançadas a partir de {dataBR(estoqueInicio.slice(0, 10))})</> : null}.
          </p>
        </div>
      )}

      <Painel className="mb-5">
        <div className="grid grid-cols-2 divide-borda md:grid-cols-4 md:divide-x">
          <Numero rotulo="Livre para vender" valor={num(total.livre)} detalhe="na prateleira e sem dono" cor="text-agua" />
          <Numero rotulo="Na prateleira" valor={num(total.prateleira)} detalhe={`${num(total.prateleira - total.livre)} reservadas para pedidos`} />
          <Numero rotulo="Nas sacolas" valor={num(total.nasSacolas)} detalhe="separadas, ainda na fábrica" />
          <Numero rotulo="Falta produzir" valor={num(total.produzir)} detalhe="para fechar os pedidos em aberto" cor={total.produzir ? 'text-ambar' : undefined} />
        </div>
      </Painel>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Texto className="max-w-xs" placeholder="Buscar modelo ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Pilulas rotulo="Filtro" valor={filtro} onChange={setFiltro} opcoes={[
          { valor: 'todos', rotulo: 'Todos' }, { valor: 'com', rotulo: 'Com estoque' }, { valor: 'produzir', rotulo: 'Falta produzir' },
        ]} />
      </div>

      {!linhas.length ? <Vazio titulo="Nenhum modelo neste filtro" /> : (
        <ul className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {linhas.map(({ m, ts, produzir }) => (
            <li key={m.id} className="rounded-xl border border-borda bg-tecido p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={cx('truncate font-display text-lg font-bold', !m.ativo && 'text-linha')}>{m.nome}</div>
                  <div className="text-[12px] text-linha">{m.tipo}{m.codigo ? `, código ${m.codigo}` : ''}{produzir > 0 ? <span className="font-semibold text-ambar"> · faltam {num(produzir)}</span> : null}</div>
                </div>
                <Botao variante="secundario" className="h-9 shrink-0 px-3 text-sm" onClick={() => abrirContagem(m)}><ClipboardCheck size={16} />Contar</Botao>
              </div>
              <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${ts.length}, minmax(0, 1fr))` }}>
                {ts.map((x) => (
                  <div key={x.t} className="rounded-lg bg-papel px-1 py-2 text-center">
                    <div className="text-[12px] font-semibold text-linha">{x.t}</div>
                    <div className={cx('num font-display text-xl font-bold', x.livre < 0 ? 'text-framboesa' : x.livre === 0 ? 'text-linha/60' : 'text-tinta')}>{num(x.livre)}</div>
                    <div className="num flex min-h-[18px] items-center justify-center gap-1.5 text-[11px] font-semibold">
                      {x.nasSacolas > 0 && <span className="inline-flex items-center gap-0.5 text-agua" title="Nas sacolas"><ShoppingBag size={11} />{num(x.nasSacolas)}</span>}
                      {x.produzir > 0 && <span className="inline-flex items-center gap-0.5 text-ambar" title="Falta produzir"><Scissors size={11} />{num(x.produzir)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[13px] text-linha">
        O número grande é o que está livre para vender. <ShoppingBag size={12} className="inline text-agua" /> peças em sacola de pedido.{' '}
        <Scissors size={12} className="inline text-ambar" /> peças que os pedidos em aberto esperam e ainda não existem. Número vermelho: saiu mais do que havia, confira a contagem.
      </p>

      <Modal aberto={!!contando} onFechar={() => !salvando && setContando(null)} titulo={contando ? `Contar ${contando.modelo.nome}` : ''}
        rodape={<>
          <Botao variante="secundario" className="flex-1" onClick={() => setContando(null)} disabled={salvando}>Cancelar</Botao>
          <Botao className="flex-1" onClick={salvarContagem} disabled={salvando}>{salvando ? 'Gravando…' : 'Gravar contagem'}</Botao>
        </>}>
        {contando && (
          <div className="space-y-4">
            <p className="text-[15px] text-linha">Digite quantas peças soltas existem na prateleira agora. Não conte o que já está em sacola de pedido.</p>
            <div className="grid grid-cols-5 gap-2">
              {TAMANHOS_ESTOQUE.map((t) => (
                <label key={t} className="block text-center">
                  <span className="mb-1.5 block font-display text-lg font-bold">{t}</span>
                  <Texto inputMode="numeric" className="h-14 px-1 text-center text-xl font-bold" value={contando.valores[t]}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setContando({ ...contando, valores: { ...contando.valores, [t]: e.target.value.replace(/[^\d-]/g, '') } })} />
                </label>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
