const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numFmt = new Intl.NumberFormat('pt-BR');
const decFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const brl = (n: number) => brlFmt.format(Math.abs(n) < 0.005 ? 0 : n);
export const num = (n: number) => numFmt.format(Math.round(n));
export const dec = (n: number) => decFmt.format(n);
export const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoje = () => toISO(new Date());
export const fromISO = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDias = (iso: string, n: number) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const diffDias = (de: string, ate: string) => Math.round((fromISO(ate).getTime() - fromISO(de).getTime()) / 86400000);
export const inicioMes = (iso: string) => iso.slice(0, 8) + '01';
export const fimMes = (iso: string) => { const d = fromISO(iso); return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
export const mesKey = (iso: string) => iso.slice(0, 7);

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export const mesCurto = (key: string) => `${MESES[Number(key.slice(5, 7)) - 1]}/${key.slice(2, 4)}`;
export const mesLongo = (key: string) => `${MESES_LONGOS[Number(key.slice(5, 7)) - 1]} de ${key.slice(0, 4)}`;
export const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const diaSemana = (iso: string) => SEMANA[fromISO(iso).getDay()];

/** Lê números digitados em pt-BR ("1.234,56", "1,2") ou en ("1234.56"). */
export function parseNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Aceita Date, número serial do Excel, "dd/mm/aaaa", "dd/mm/aa" ou "aaaa-mm-dd". */
export function parseData(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return toISO(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${pad(+m[2])}-${pad(+m[1])}`; }
  return null;
}

/** Normaliza texto para comparar nomes: sem acento, minúsculo, espaços únicos. */
export const chave = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
