import * as XLSX from 'xlsx';

/** Gera e baixa um .xlsx com uma aba por item de `abas`. */
export function baixarPlanilha(nomeArquivo: string, abas: { nome: string; linhas: Record<string, unknown>[] }[]) {
  const wb = XLSX.utils.book_new();
  for (const a of abas) {
    const ws = XLSX.utils.json_to_sheet(a.linhas);
    const cols = Object.keys(a.linhas[0] ?? {});
    ws['!cols'] = cols.map((c) => ({ wch: Math.max(10, c.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, a.nome.slice(0, 31));
  }
  XLSX.writeFile(wb, nomeArquivo);
}
