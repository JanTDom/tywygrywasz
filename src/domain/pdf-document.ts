/** PDF.js parses local byte buffers. No document URL or private query leaves this module. */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { DocumentSourceLine, SourceBounds } from './types';

export type LocalPdfDocument = PDFDocumentProxy & { dispose: () => Promise<void> };

export async function loadLocalPdf(bytes: Uint8Array, signal?: AbortSignal): Promise<LocalPdfDocument> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    stopAtErrors: true,
    verbosity: 0,
    ...(typeof window !== 'undefined' ? {
      cMapUrl: '/pdf/cmaps/', cMapPacked: true,
      standardFontDataUrl: '/pdf/standard_fonts/', wasmUrl: '/pdf/wasm/',
    } : {}),
  });
  const abort = () => { void task.destroy(); };
  if (signal?.aborted) { await task.destroy(); throw new Error('CANCELLED'); }
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 200) { await task.destroy(); throw new Error('PDF_PAGE_LIMIT'); }
    return Object.assign(pdf, { dispose: () => task.destroy() });
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

function bounded(value: number): number { return Math.max(0, Math.min(1, value)); }

/** Text items retain their actual page and viewport position, including rotated pages. */
export async function readPdfPageLines(page: PDFPageProxy): Promise<DocumentSourceLine[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const lines: DocumentSourceLine[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const transform = pdfjs.Util.transform(viewport.transform, item.transform);
    const height = Math.hypot(transform[2], transform[3]);
    const style = content.styles[item.fontName];
    const ascent = style?.ascent ?? (style?.descent !== undefined ? 1 + style.descent : 0.8);
    const angle = Math.atan2(transform[1], transform[0]);
    // Use all four corners of the oriented text box, rather than assuming a horizontal page.
    const w = item.width * viewport.scale;
    const x = transform[4] + Math.sin(angle) * height * ascent;
    const y = transform[5] - Math.cos(angle) * height * ascent;
    const corners = [[x, y], [x + Math.cos(angle) * w, y + Math.sin(angle) * w],
      [x - Math.sin(angle) * height, y + Math.cos(angle) * height],
      [x + Math.cos(angle) * w - Math.sin(angle) * height, y + Math.sin(angle) * w + Math.cos(angle) * height]];
    const minX = Math.min(...corners.map((point) => point[0]));
    const minY = Math.min(...corners.map((point) => point[1]));
    const maxX = Math.max(...corners.map((point) => point[0]));
    const maxY = Math.max(...corners.map((point) => point[1]));
    const bounds: SourceBounds = { x: bounded(minX / viewport.width), y: bounded(minY / viewport.height),
      width: bounded((maxX - minX) / viewport.width), height: bounded((maxY - minY) / viewport.height) };
    const previous = lines.at(-1);
    // Merge text pieces on the same baseline to retain phrases split between font runs.
    if (previous?.bounds && Math.abs(previous.bounds.y - bounds.y) < bounds.height * 0.25
      && bounds.x >= previous.bounds.x && bounds.x - (previous.bounds.x + previous.bounds.width) < bounds.height * 1.5) {
      previous.text += `${bounds.x - (previous.bounds.x + previous.bounds.width) > bounds.height * 0.1 ? ' ' : ''}${item.str}`;
      previous.bounds.width = bounded(bounds.x + bounds.width - previous.bounds.x);
      previous.bounds.height = Math.max(previous.bounds.height, bounds.height);
    } else {
      lines.push({ pageNumber: page.pageNumber, lineIndex: lines.length + 1, text: item.str, confidence: 96, bounds });
    }
  }
  return lines;
}

/** A text layer may be only a header above a scanned body; inspect actual paint operations. */
export async function pdfPageContainsRaster(page: PDFPageProxy): Promise<boolean> {
  const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const rasterOperations = new Set([
    OPS.paintImageXObject, OPS.paintImageXObjectRepeat,
    OPS.paintInlineImageXObject, OPS.paintInlineImageXObjectGroup,
    OPS.paintImageMaskXObject, OPS.paintImageMaskXObjectGroup,
    OPS.paintImageMaskXObjectRepeat, OPS.paintSolidColorImageMask,
  ]);
  const operators = await page.getOperatorList();
  return operators.fnArray.some((operation) => rasterOperations.has(operation));
}

export async function renderLocalPdfPage(page: PDFPageProxy, canvas: HTMLCanvasElement, scale = 1.4, signal?: AbortSignal): Promise<void> {
  const initial = page.getViewport({ scale });
  const safeScale = initial.width * initial.height > 10_000_000 ? scale * Math.sqrt(10_000_000 / (initial.width * initial.height)) : scale;
  const viewport = page.getViewport({ scale: safeScale });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_UNAVAILABLE');
  const render = page.render({ canvas, canvasContext: context, viewport });
  const abort = () => render.cancel();
  signal?.addEventListener('abort', abort, { once: true });
  try { if (signal?.aborted) render.cancel(); await render.promise; }
  finally { signal?.removeEventListener('abort', abort); }
}

export async function pdfPageAsPng(page: PDFPageProxy, signal?: AbortSignal): Promise<Uint8Array> {
  if (typeof document === 'undefined') throw new Error('PDF_RASTER_BROWSER_REQUIRED');
  const canvas = document.createElement('canvas');
  await renderLocalPdfPage(page, canvas, 2, signal);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PDF_RASTER_FAILED')), 'image/png'));
  canvas.width = canvas.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}
