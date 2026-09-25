'use client';

import { useMemo, useState } from 'react';
import { addDias, fimMes, hoje, inicioMes } from '@/lib/format';
import type { Filtro } from '@/lib/kpis';
import type { Oficina } from '@/lib/types';
import { Campo, Texto, Selecao } from './ui';

export type Preset = 'mes' | 'mes_passado' | '30d' | 'ano' | 'tudo' | 'custom';

export const PRESETS: { valor: Preset; rotulo: string }[] = [
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'mes_passado', rotulo: 'Mês passado' },
  { valor: '30d', rotulo: 'Últimos 30 dias' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: 'tudo', rotulo: 'Tudo' },
  { valor: 'custom', rotulo: 'Escolher datas' },
];

export function intervalo(p: Preset, custom: { de: string; ate: string }) {
  const h = hoje();
  switch (p) {
    case 'mes': return { de: inicioMes(h), ate: fimMes(h) };
    case 'mes_passado': { const d = addDias(inicioMes(h), -1); return { de: inicioMes(d), ate: fimMes(d) }; }
    case '30d': return { de: addDias(h, -29), ate: h };
    case 'ano': return { de: `${h.slice(0, 4)}-01-01`, ate: `${h.slice(0, 4)}-12-31` };
    case 'tudo': return { de: '2000-01-01', ate: '2999-12-31' };
    default: return custom;
  }
}

export function useFiltro(padrao: Preset = 'mes') {
  const [preset, setPreset] = useState<Preset>(padrao);
  const [custom, setCustom] = useState({ de: inicioMes(hoje()), ate: hoje() });
  const [oficinaId, setOficinaId] = useState<string | null>(null);
  const filtro: Filtro = useMemo(() => ({ ...intervalo(preset, custom), oficinaId }), [preset, custom, oficinaId]);
  return { preset, setPreset, custom, setCustom, oficinaId, setOficinaId, filtro };
}

export function BarraFiltro({ f, oficinas }: { f: ReturnType<typeof useFiltro>; oficinas: Oficina[] }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:flex md:flex-wrap md:items-end">
      <Campo rotulo="Período" className="md:w-48">
        <Selecao value={f.preset} onChange={(e) => f.setPreset(e.target.value as Preset)}>
          {PRESETS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
        </Selecao>
      </Campo>
      <Campo rotulo="Oficina" className="md:w-48">
        <Selecao value={f.oficinaId ?? ''} onChange={(e) => f.setOficinaId(e.target.value || null)}>
          <option value="">Todas</option>
          {oficinas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </Selecao>
      </Campo>
      {f.preset === 'custom' && (
        <>
          <Campo rotulo="De" className="md:w-44">
            <Texto type="date" value={f.custom.de} onChange={(e) => f.setCustom({ ...f.custom, de: e.target.value })} />
          </Campo>
          <Campo rotulo="Até" className="md:w-44">
            <Texto type="date" value={f.custom.ate} onChange={(e) => f.setCustom({ ...f.custom, ate: e.target.value })} />
          </Campo>
        </>
      )}
    </div>
  );
}
