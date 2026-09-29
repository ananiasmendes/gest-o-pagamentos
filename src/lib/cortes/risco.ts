import { chave } from '../format';
import type { Grade, Modelo } from '../types';

export interface ModeloRisco { nomeBruto: string; nome: string; codigo: string | null; grade: Grade }
export interface Risco {
  tecido: string | null;
  comprimento_m: number | null;
  largura_m: number | null;
  gramatura_kg_m2: number | null;
  aproveitamento: number | null;
  modelos: ModeloRisco[];
}

const num = (s: string | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Interpreta o texto do relatório de encaixe do Audaces (uma linha por item). */
export function interpretarRisco(linhas: string[]): Risco {
  const texto = linhas.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const tudo = texto.join('\n');
  const pega = (re: RegExp) => tudo.match(re)?.[1];

  const modelos: ModeloRisco[] = [];
  for (const l of texto) {
    const m = l.match(/^Modelo:\s*(.+?)\s+((?:\d+\s*-\s*[A-Za-z0-9]+\s*)+)$/);
    if (!m) continue;
    const grade: Grade = {};
    for (const g of m[2].matchAll(/(\d+)\s*-\s*([A-Za-z0-9]+)/g)) grade[g[2].toUpperCase()] = (grade[g[2].toUpperCase()] ?? 0) + Number(g[1]);
    const nomeBruto = m[1].trim();
    const cod = nomeBruto.match(/^(\d{3,6})\s+(.+)$/);
    modelos.push({ nomeBruto, nome: cod ? cod[2] : nomeBruto, codigo: cod ? cod[1] : null, grade });
  }

  const aprov = num(pega(/Aproveitamento:\s*([\d.,]+)\s*%/i));
  return {
    tecido: pega(/Tecido:\s*(.+?)\s+Tipo:/i)?.trim() ?? pega(/Tecido:\s*(\S+)/i) ?? null,
    comprimento_m: num(pega(/Comprimento:\s*([\d.,]+)\s*m/i)),
    largura_m: num(pega(/Largura:\s*([\d.,]+)\s*m/i)),
    gramatura_kg_m2: num(pega(/Peso:\s*([\d.,]+)\s*kg/i)),
    aproveitamento: aprov,
    modelos,
  };
}

/** Lê o texto de um PDF no navegador, reconstruindo as linhas pela posição vertical. */
export async function lerTextoPdf(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const linhas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const conteudo = await page.getTextContent();
    const porY = new Map<number, { x: number; s: string }[]>();
    for (const it of conteudo.items as { str?: string; transform?: number[] }[]) {
      if (!it.str || !it.transform) continue;
      const y = Math.round(it.transform[5]);
      const chaveY = Array.from(porY.keys()).find((k) => Math.abs(k - y) <= 2) ?? y;
      (porY.get(chaveY) ?? porY.set(chaveY, []).get(chaveY)!).push({ x: it.transform[4], s: it.str });
    }
    Array.from(porY.entries()).sort((a, b) => b[0] - a[0])
      .forEach(([, its]) => linhas.push(its.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ')));
  }
  return linhas;
}

/** Acha o modelo cadastrado: primeiro pelo nome, depois pelo código. */
export function casarModelo(r: ModeloRisco, modelos: Modelo[]): Modelo | null {
  const norm = (s: string) => chave(s).replace(/^conj\.?\s+/, 'conjunto ');
  const alvo = norm(r.nome);
  return modelos.find((m) => norm(m.nome) === alvo)
    ?? (r.codigo ? modelos.find((m) => m.codigo === r.codigo) : undefined)
    ?? null;
}
