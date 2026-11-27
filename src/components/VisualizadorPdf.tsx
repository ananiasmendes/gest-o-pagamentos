'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Printer, Share2, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { PdfPronto } from '@/lib/cortes/pdf';
import { Botao, cx } from './ui';

/**
 * Mostra um PDF dentro do site, página por página (desenhada com o pdf.js, que funciona igual no
 * celular e no computador), com botões para baixar, compartilhar e imprimir.
 */
export default function VisualizadorPdf({ pdf, onFechar }: { pdf: PdfPronto | null; onFechar: () => void }) {
  const area = useRef<HTMLDivElement>(null);
  const [paginas, setPaginas] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  // trava a rolagem da página de trás e fecha com Esc
  useEffect(() => {
    if (!pdf) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [pdf, onFechar]);

  useEffect(() => {
    if (!pdf || !area.current) return;
    let cancelado = false;
    const alvo = area.current;
    alvo.innerHTML = '';
    setErro(''); setCarregando(true);
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await pdf.blob.arrayBuffer()) }).promise;
        if (cancelado) return;
        setPaginas(doc.numPages);
        const largura = Math.min(alvo.clientWidth - 16, 900) * zoom;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        for (let i = 1; i <= doc.numPages; i++) {
          const pagina = await doc.getPage(i);
          if (cancelado) return;
          const base = pagina.getViewport({ scale: 1 });
          const escala = largura / base.width;
          const vp = pagina.getViewport({ scale: escala * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
          canvas.style.width = `${Math.floor(largura)}px`;
          canvas.style.height = `${Math.floor(base.height * escala)}px`;
          canvas.className = 'mx-auto mb-4 block rounded bg-white shadow-md';
          canvas.setAttribute('aria-label', `Página ${i} de ${doc.numPages}`);
          alvo.appendChild(canvas);
          await pagina.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        }
      } catch (e) {
        if (!cancelado) setErro(`Não foi possível mostrar o PDF: ${(e as Error).message}. Use o botão Baixar.`);
      } finally { if (!cancelado) setCarregando(false); }
    })();
    return () => { cancelado = true; };
  }, [pdf, zoom]);

  if (!pdf) return null;

  const arquivo = () => new File([pdf.blob], pdf.nome, { type: 'application/pdf' });
  const nav = typeof navigator !== 'undefined' ? navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean } : null;
  const podeCompartilhar = !!nav?.canShare && (() => { try { return nav!.canShare!({ files: [arquivo()] }); } catch { return false; } })();

  function baixar() {
    const url = URL.createObjectURL(pdf!.blob);
    const a = document.createElement('a');
    a.href = url; a.download = pdf!.nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function compartilhar() {
    try { await nav!.share({ files: [arquivo()], title: pdf!.nome }); } catch { /* cancelado */ }
  }
  function imprimir() {
    const url = URL.createObjectURL(pdf!.blob);
    const ehIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ehIOS) { window.open(url, '_blank'); return; } // no iPhone a impressão sai pelo compartilhar do Safari
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.src = url;
    frame.onload = () => { try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { window.open(url, '_blank'); } };
    document.body.appendChild(frame);
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000);
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-tinta/80" role="dialog" aria-modal="true" aria-label={pdf.titulo}>
      <div className="flex flex-wrap items-center gap-2 bg-tecido px-3 py-2.5 shadow md:px-5">
        <button onClick={onFechar} aria-label="Fechar" className="rounded-lg p-2 text-linha hover:bg-papel"><X size={22} /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{pdf.titulo}</div>
          <div className="text-xs text-linha">{carregando ? 'Carregando…' : `${paginas} ${paginas === 1 ? 'página' : 'páginas'}`}</div>
        </div>
        <div className="hidden items-center gap-1 sm:flex">
          <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} aria-label="Diminuir" className="rounded-lg p-2 text-linha hover:bg-papel"><ZoomOut size={19} /></button>
          <span className="num w-11 text-center text-sm text-linha">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(1)))} aria-label="Aumentar" className="rounded-lg p-2 text-linha hover:bg-papel"><ZoomIn size={19} /></button>
        </div>
        <div className="flex gap-1.5">
          <Botao variante="secundario" className="h-10 px-3" onClick={imprimir} aria-label="Imprimir"><Printer size={17} /><span className="hidden md:inline">Imprimir</span></Botao>
          {podeCompartilhar && <Botao variante="secundario" className="h-10 px-3" onClick={compartilhar} aria-label="Compartilhar"><Share2 size={17} /></Botao>}
          <Botao className="h-10 px-3" onClick={baixar}><Download size={17} /><span className="hidden md:inline">Baixar</span></Botao>
        </div>
      </div>
      <div className={cx('flex-1 overflow-auto px-2 py-4 md:px-6')} onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
        {erro && <p className="mx-auto max-w-md rounded-lg bg-tecido px-4 py-3 text-sm text-framboesa">{erro}</p>}
        <div ref={area} />
      </div>
    </div>
  );
}
