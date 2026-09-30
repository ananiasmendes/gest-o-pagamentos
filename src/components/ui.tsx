'use client';

import { createContext, forwardRef, useCallback, useContext, useEffect, useState, ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { X } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

// ---------------- Botões ----------------------------------------------
type Variante = 'primario' | 'destaque' | 'secundario' | 'fantasma' | 'perigo';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-tinta text-white hover:bg-[#43241F] disabled:bg-linha/50',
  destaque: 'bg-framboesa text-white hover:bg-framboesa-escuro disabled:bg-linha/50',
  secundario: 'bg-tecido text-tinta border border-borda hover:border-linha/60',
  fantasma: 'text-tinta hover:bg-borda/60',
  perigo: 'text-framboesa hover:bg-framboesa-claro',
};
/** Classes de botão, para usar também em <Link> e <a>. */
export const classeBotao = (variante: Variante = 'primario', extra?: string) =>
  cx('inline-flex items-center justify-center gap-2 rounded-lg px-4 h-11 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed', VARIANTES[variante], extra);

export function Botao({ variante = 'primario', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return <button {...p} className={classeBotao(variante, className)} />;
}

// ---------------- Campos ----------------------------------------------
/**
 * Rótulo + campo. Para grupos de botões (pílulas, busca com lista), use `grupo`: um <label> em volta de botões
 * repassa o clique para o primeiro botão quando o botão clicado some da tela, desfazendo a escolha.
 */
export function Campo({ rotulo, dica, children, className, grupo }: { rotulo: string; dica?: ReactNode; children: ReactNode; className?: string; grupo?: boolean }) {
  const Tag = grupo ? 'div' : 'label';
  return (
    <Tag className={cx('block', className)} {...(grupo ? { role: 'group', 'aria-label': rotulo } : {})}>
      <span className="mb-1.5 block text-[13px] font-semibold text-linha">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-linha">{dica}</span>}
    </Tag>
  );
}

const baseInput = 'w-full h-11 rounded-lg border border-borda bg-tecido px-3 text-[15px] text-tinta placeholder:text-linha/60 focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo/15';
export const Texto = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Texto(p, ref) {
  return <input ref={ref} {...p} className={cx(baseInput, p.className)} />;
});
export const Selecao = ({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cx(baseInput, 'selecao', p.className)}>{children}</select>
);

// ---------------- Seletor em pílulas (poucas opções) -------------------
export function Pilulas<T extends string>({ opcoes, valor, onChange, rotulo }: {
  opcoes: { valor: T; rotulo: ReactNode }[]; valor: T; onChange: (v: T) => void; rotulo?: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-2">
      {opcoes.map((o) => (
        <button
          key={o.valor} type="button" role="radio" aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cx('h-10 rounded-full px-4 text-sm font-semibold border transition-colors',
            valor === o.valor ? 'bg-tinta text-white border-tinta' : 'bg-tecido text-tinta border-borda hover:border-linha/60')}
        >{o.rotulo}</button>
      ))}
    </div>
  );
}

// ---------------- Estrutura -------------------------------------------
export function Cabecalho({ titulo, sub, acoes }: { titulo: string; sub?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-bold leading-tight md:text-[32px]">{titulo}</h1>
        {sub && <p className="mt-1 text-[15px] text-linha">{sub}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </header>
  );
}

export function Painel({ titulo, acao, children, className }: { titulo?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-borda bg-tecido p-4 md:p-5', className)}>
      {(titulo || acao) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {titulo && <h2 className="text-[17px] font-bold">{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-borda bg-tecido/60 px-5 py-10 text-center">
      <p className="font-display text-lg font-bold">{titulo}</p>
      {children && <div className="mt-2 text-[15px] text-linha">{children}</div>}
    </div>
  );
}

export function Carregando() {
  return <div className="py-16 text-center text-linha">Carregando…</div>;
}

// ---------------- Modal (folha no celular, janela no computador) -------
export function Modal({ aberto, titulo, onFechar, children, rodape }: {
  aberto: boolean; titulo: string; onFechar: () => void; children: ReactNode; rodape?: ReactNode;
}) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/40 md:items-center md:p-6" onMouseDown={onFechar}>
      <div
        role="dialog" aria-modal="true" aria-label={titulo}
        className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-tecido shadow-xl md:max-w-lg md:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-5 py-4">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1.5 text-linha hover:bg-borda/60"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="pb-safe flex gap-2 border-t border-borda px-5 py-3">{rodape}</div>}
      </div>
    </div>
  );
}

// ---------------- Avisos (toasts) --------------------------------------
type Aviso = { id: number; texto: string; tipo: 'ok' | 'erro' };
const AvisoCtx = createContext<(texto: string, tipo?: 'ok' | 'erro') => void>(() => {});
export const useAviso = () => useContext(AvisoCtx);

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, tipo: 'ok' | 'erro' = 'ok') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 7000 : 3500);
  }, []);
  return (
    <AvisoCtx.Provider value={avisar}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {avisos.map((a) => (
          <div key={a.id} className={cx('pointer-events-auto max-w-md rounded-lg px-4 py-3 text-[15px] font-medium shadow-lg',
            a.tipo === 'ok' ? 'bg-tinta text-white' : 'bg-framboesa text-white')}>{a.texto}</div>
        ))}
      </div>
    </AvisoCtx.Provider>
  );
}

// ---------------- Etiqueta de valor (o destaque visual) -----------------
/** Cartão com borda de "costura": fundo claro na cor da oficina e texto escuro na mesma cor. */
export function Etiqueta({ cor, children, className }: { cor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('etiqueta p-4 pl-5', className)}
      style={{ background: `color-mix(in srgb, ${cor} 13%, #ffffff)`, color: `color-mix(in srgb, ${cor} 72%, #000000)` }}>
      {children}
    </div>
  );
}
