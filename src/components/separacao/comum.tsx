'use client';

import { Minus, Plus } from 'lucide-react';
import { cx } from '@/components/ui';

export function AvisoTabelas() {
  return (
    <div className="rounded-xl border border-ambar/40 bg-ambar-claro px-5 py-4 text-[15px]">
      <p className="font-display text-lg font-bold">Falta criar as tabelas de pedidos e estoque no banco</p>
      <p className="mt-1">
        No Supabase, abra o SQL Editor, cole o conteúdo do arquivo <strong>supabase/separacao.sql</strong> do projeto e clique em Run.
        Depois recarregue esta página.
      </p>
    </div>
  );
}

/** Quadradinho com o tamanho da peça, para bater o olho. */
export function Tamanho({ t, className }: { t: string | null; className?: string }) {
  return (
    <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-papel font-display text-[17px] font-bold', className)}>
      {t ?? '?'}
    </span>
  );
}

/** Contador grande de − e +, para dedo. */
export function Contador({ valor, min = 0, max, onChange }: { valor: number; min?: number; max: number; onChange: (v: number) => void }) {
  const botao = 'flex h-14 w-14 items-center justify-center rounded-xl border border-borda bg-tecido text-tinta disabled:opacity-30';
  return (
    <div className="flex items-center justify-center gap-4">
      <button type="button" className={botao} disabled={valor <= min} onClick={() => onChange(Math.max(min, valor - 1))} aria-label="Menos uma"><Minus size={24} /></button>
      <input
        inputMode="numeric" aria-label="Quantidade" value={String(valor)}
        onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, '') || '0', 10); onChange(Math.min(max, Math.max(min, n))); }}
        className="num h-14 w-24 rounded-xl border border-borda bg-tecido text-center font-display text-3xl font-bold focus:border-indigo focus:outline-none"
      />
      <button type="button" className={botao} disabled={valor >= max} onClick={() => onChange(Math.min(max, valor + 1))} aria-label="Mais uma"><Plus size={24} /></button>
    </div>
  );
}

/** "há 3 dias", "hoje", "ontem" */
export function haDias(dias: number) {
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

/** "há 5 min", "há 2 h", "agora" a partir de uma data ISO. */
export function haTempo(iso: string | null) {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}
