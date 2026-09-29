/* Geração dos PDFs do corte (pedido de material, etiquetas, romaneio), no navegador. */
import type { Insumo } from '../types';
import { COMPOSICAO_POR_FOLHA, TAGS_POR_FOLHA, textoCompra, textoConsumo, type LinhaMaterial } from './calc';

type Doc = import('jspdf').jsPDF;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Celula = any;

const TINTA: [number, number, number] = [35, 31, 53];
const LINHA: [number, number, number] = [110, 104, 135];
const FUNDO: [number, number, number] = [244, 243, 248];
const num = (n: number) => n.toLocaleString('pt-BR');

async function novoDoc(paisagem = false) {
  const { jsPDF } = await import('jspdf');
  // opções da tabela montadas com objetos livres (caixinhas); a tipagem fica solta de propósito
  const autoTable = (await import('jspdf-autotable')).default as unknown as (doc: Doc, opcoes: Celula) => void;
  const doc = new jsPDF({ orientation: paisagem ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  return { doc, autoTable };
}

export interface Cabecalho { titulo: string; corte: string; detalhes: string[] }

function cabecalho(doc: Doc, c: Cabecalho) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...TINTA);
  doc.text(c.titulo, 14, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(c.corte, 14, 25);
  doc.setFontSize(9); doc.setTextColor(...LINHA);
  c.detalhes.forEach((d, i) => doc.text(d, 14, 31 + i * 4.5));
  return 31 + c.detalhes.length * 4.5 + 2;
}

function rodape(doc: Doc) {
  const n = doc.getNumberOfPages();
  const larg = doc.internal.pageSize.getWidth(), alt = doc.internal.pageSize.getHeight();
  const quando = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...LINHA);
    doc.text(`Gerado em ${quando}`, 14, alt - 8);
    doc.text(`Página ${i} de ${n}`, larg - 14, alt - 8, { align: 'right' });
  }
}

/** Célula com caixinha de marcar. */
const caixa = (texto: string, feito = false): Celula => ({ content: texto, caixa: true, feito });

/** Desenha as caixinhas nas células marcadas com `caixa`. */
function desenharCaixas(doc: Doc) {
  return (data: Celula) => {
    const raw = data.cell.raw;
    if (data.section !== 'body' || !raw || typeof raw !== 'object' || !raw.caixa) return;
    const t = 3.4, x = data.cell.x + 1.6, y = data.cell.y + data.cell.height / 2 - t / 2;
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.3); doc.rect(x, y, t, t);
    if (raw.feito) {
      doc.setLineWidth(0.5);
      doc.line(x + 0.7, y + 1.8, x + 1.5, y + 2.7); doc.line(x + 1.5, y + 2.7, x + 2.9, y + 0.7);
    }
  };
}

const estiloBase = {
  styles: { font: 'helvetica', fontSize: 9, textColor: TINTA, cellPadding: 1.8, lineColor: [227, 224, 236] as [number, number, number], lineWidth: 0.2 },
  headStyles: { fillColor: TINTA, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
  alternateRowStyles: { fillColor: FUNDO },
  margin: { left: 14, right: 14, bottom: 16 },
};

// ---------------- Pedido de material + etiquetas (um PDF só) ---------------

export interface DadosPedido {
  cab: Cabecalho;
  cores: { id: string; nome: string }[];
  linhas: LinhaMaterial[];
  notaTecido?: string;
  tamanhos: string[];
  tags: { modelo: string; modelo_id: string; porTam: Record<string, { qtd: number; folhas: number }>; qtd: number; folhas: number }[];
  composicao: { tamanho: string; qtd: number; folhas: number }[];
  feito: (chave: string) => boolean;
}

const paddingCaixa = (d: Celula) => {
  if (d.section === 'body' && d.cell.raw?.caixa) d.cell.styles.cellPadding = { left: 6.5, right: 1.5, top: 1.8, bottom: 1.8 };
};

function titulo(doc: Doc, texto: string, y: number) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...TINTA);
  doc.text(texto, 14, y);
}

/** Página 1: materiais para comprar. Em seguida: tags e composição para imprimir. */
export async function pdfPedidoEtiquetas(p: DadosPedido) {
  const paisagem = p.cores.length > 4;
  const { doc, autoTable } = await novoDoc(paisagem);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fimTabela = () => (doc as any).lastAutoTable.finalY as number;

  // --- Materiais
  let y = cabecalho(doc, p.cab);
  titulo(doc, 'Material para comprar', y + 3); y += 6;
  if (p.notaTecido) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...LINHA); doc.text(p.notaTecido, 14, y + 1); y += 5; }
  if (!p.linhas.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...LINHA);
    doc.text('Nenhum material selecionado para o pedido.', 14, y + 4);
  } else {
    autoTable(doc, {
      ...estiloBase, startY: y,
      head: [['Insumo', ...p.cores.map((c) => c.nome), 'Total']],
      body: p.linhas.map((l) => {
        const ins = l.insumo;
        const celulasCor = p.cores.map((c) => {
          if (!ins.por_cor) return '';
          const q = l.compra.get(c.id);
          return q ? caixa(textoCompra(q, ins), p.feito(`mat:${ins.id}:${c.id}`)) : '';
        });
        const total = ins.por_cor ? textoCompra(l.compraTotal, ins) : caixa(textoCompra(l.compraTotal, ins), p.feito(`mat:${ins.id}:*`));
        return [{ content: ins.nome + (l.peloRisco ? ' (pelo risco)' : ''), styles: { fontStyle: 'bold' } }, ...celulasCor, total];
      }),
      styles: { ...estiloBase.styles, fontSize: paisagem ? 8 : 9, valign: 'middle' },
      columnStyles: { 0: { cellWidth: paisagem ? 46 : 50 } },
      didParseCell: paddingCaixa,
      didDrawCell: desenharCaixas(doc),
    });
  }

  // --- Etiquetas (página nova, em pé)
  doc.addPage('a4', 'portrait');
  y = cabecalho(doc, { ...p.cab, titulo: 'Etiquetas para imprimir' });
  titulo(doc, `Tags (${TAGS_POR_FOLHA} por folha)`, y + 3); y += 6;
  const opc = { ...estiloBase, didDrawCell: desenharCaixas(doc), didParseCell: paddingCaixa };
  autoTable(doc, {
    ...opc, startY: y,
    head: [['Modelo', ...p.tamanhos, 'Total']],
    body: [
      ...p.tags.map((t) => [
        { content: t.modelo, styles: { fontStyle: 'bold' } },
        ...p.tamanhos.map((tam) => (t.porTam[tam] ? caixa(`${num(t.porTam[tam].qtd)} (${num(t.porTam[tam].folhas)} fl.)`, p.feito(`tag:${t.modelo_id}:${tam}`)) : '')),
        `${num(t.qtd)} (${num(t.folhas)} fl.)`,
      ]),
      [{ content: 'Total', styles: { fontStyle: 'bold' } },
        ...p.tamanhos.map((tam) => {
          const q = p.tags.reduce((s, t) => s + (t.porTam[tam]?.qtd ?? 0), 0);
          const f = p.tags.reduce((s, t) => s + (t.porTam[tam]?.folhas ?? 0), 0);
          return q ? `${num(q)} (${num(f)} fl.)` : '';
        }),
        { content: `${num(p.tags.reduce((s, t) => s + t.qtd, 0))} (${num(p.tags.reduce((s, t) => s + t.folhas, 0))} fl.)`, styles: { fontStyle: 'bold' } }],
    ],
  });

  y = fimTabela() + 10;
  titulo(doc, `Composição (${COMPOSICAO_POR_FOLHA} por folha)`, y); y += 3;
  autoTable(doc, {
    ...opc, startY: y, tableWidth: 110,
    head: [['Tamanho', 'Etiquetas', 'Folhas']],
    body: [
      ...p.composicao.map((c) => [caixa(c.tamanho, p.feito(`comp:${c.tamanho}`)), num(c.qtd), num(c.folhas)]),
      [{ content: 'Total', styles: { fontStyle: 'bold' } }, num(p.composicao.reduce((s, c) => s + c.qtd, 0)), num(p.composicao.reduce((s, c) => s + c.folhas, 0))],
    ],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  });
  rodape(doc);
  return doc;
}

// ---------------- Romaneio por oficina -------------------------------------

export interface BlocoRomaneio {
  oficina: string;
  modelos: { nome: string; porCorTam: Map<string, Record<string, number>>; total: number }[];
  aviamentos: { insumo: Insumo; consumoPorCor: Map<string, number>; consumoTotal: number }[];
  total: number;
}

export async function pdfRomaneio(p: { cab: Cabecalho; cores: { id: string; nome: string }[]; tamanhos: string[]; blocos: BlocoRomaneio[] }) {
  const { doc, autoTable } = await novoDoc(p.cores.length > 5);
  p.blocos.forEach((b, i) => {
    if (i > 0) doc.addPage();
    let y = cabecalho(doc, { ...p.cab, titulo: `Romaneio: ${b.oficina}`, detalhes: [...p.cab.detalhes, `${num(b.total)} peças para esta oficina`] });
    for (const m of b.modelos) {
      autoTable(doc, {
        ...estiloBase, startY: y,
        head: [[m.nome, ...p.cores.map((c) => c.nome), 'Total']],
        body: [
          ...p.tamanhos.filter((t) => p.cores.some((c) => m.porCorTam.get(c.id)?.[t])).map((t) => [
            { content: t, styles: { fontStyle: 'bold' } },
            ...p.cores.map((c) => (m.porCorTam.get(c.id)?.[t] ? num(m.porCorTam.get(c.id)![t]) : '')),
            num(p.cores.reduce((s, c) => s + (m.porCorTam.get(c.id)?.[t] ?? 0), 0)),
          ]),
          [{ content: 'Total', styles: { fontStyle: 'bold' } },
            ...p.cores.map((c) => num(Object.values(m.porCorTam.get(c.id) ?? {}).reduce((s, v) => s + v, 0))),
            { content: num(m.total), styles: { fontStyle: 'bold' } }],
        ],
        columnStyles: Object.fromEntries(p.cores.map((_, j) => [j + 1, { halign: 'right' }]).concat([[p.cores.length + 1, { halign: 'right' }]])),
        rowPageBreak: 'avoid',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 5;
    }
    if (b.aviamentos.length) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...TINTA);
      if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 18; }
      doc.text('Aviamentos para enviar', 14, y + 3); y += 5;
      autoTable(doc, {
        ...estiloBase, startY: y,
        head: [['Insumo', ...p.cores.map((c) => c.nome), 'Total']],
        body: b.aviamentos.map((a) => [
          { content: a.insumo.nome, styles: { fontStyle: 'bold' } },
          ...p.cores.map((c) => (a.consumoPorCor.get(c.id) ? textoConsumo(a.consumoPorCor.get(c.id)!, a.insumo) : '')),
          textoConsumo(a.consumoTotal, a.insumo),
        ]),
        styles: { ...estiloBase.styles, fontSize: 8 },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 14;
    }
    if (y > doc.internal.pageSize.getHeight() - 25) { doc.addPage(); y = 25; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TINTA);
    doc.text('Recebido por: ______________________________     Data: ____/____/______', 14, y);
  });
  rodape(doc);
  return doc;
}

// ---------------- Entrega ---------------------------------------------------

/** No celular abre o compartilhamento (WhatsApp etc.); no computador baixa o arquivo. */
export async function entregarPdf(doc: Doc, nomeArquivo: string, modo: 'baixar' | 'compartilhar' = 'baixar') {
  if (modo === 'compartilhar') {
    const arquivo = new File([doc.output('blob')], nomeArquivo, { type: 'application/pdf' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [arquivo] })) {
      try { await nav.share({ files: [arquivo], title: nomeArquivo }); return; } catch { /* cancelado: cai no download */ return; }
    }
  }
  doc.save(nomeArquivo);
}

export const podeCompartilharArquivo = () => {
  if (typeof navigator === 'undefined' || typeof File === 'undefined') return false;
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  try { return !!nav.canShare?.({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] }); } catch { return false; }
};
