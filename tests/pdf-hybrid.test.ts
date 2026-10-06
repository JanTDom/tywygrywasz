import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalOcrEngine } from '../src/domain/ocr-engine';
import { loadLocalPdf, pdfPageContainsRaster, readPdfPageLines } from '../src/domain/pdf-document';
import { extractFieldsFromText } from '../src/domain/extractor';

async function hybridPdfFixture(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const digital = pdf.addPage([600, 800]);
  digital.drawText('Pierwsza strona cyfrowa', { x: 60, y: 720, size: 14, font });
  // A real raster contains the evidence; a separate digital header must not suppress its OCR.
  const scan = createCanvas(1000, 500);
  const context = scan.getContext('2d');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, 1000, 500);
  context.fillStyle = '#000000'; context.font = '42px sans-serif';
  context.fillText('Znak: WAB.6740.88.2026', 40, 90);
  context.fillText('Tresc zeskanowanego dowodu', 40, 190);
  const raster = await pdf.embedPng(scan.toBuffer('image/png'));
  const hybrid = pdf.addPage([600, 800]);
  hybrid.drawText('Naglowek cyfrowy', { x: 60, y: 720, size: 14, font });
  hybrid.drawImage(raster, { x: 60, y: 320, width: 480, height: 240 });
  return pdf.save();
}

/** Keep PDF.js parsing and rendering real while substituting only the browser canvas DOM adapter. */
function installNodeCanvasAdapter(): void {
  vi.stubGlobal('document', {
    createElement(tag: string) {
      if (tag !== 'canvas') throw new Error('Only a local canvas is allowed in this test.');
      const canvas = createCanvas(1, 1);
      return Object.assign(canvas, {
        toBlob(callback: (blob: Blob) => void) {
          const png = new Uint8Array(canvas.toBuffer('image/png'));
          callback(new Blob([png.buffer], { type: 'image/png' }));
        },
      });
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('Hybrid PDF pages', () => {
  it('detects actual raster operators and reads the scanned body beside an exact digital header', async () => {
    const bytes = await hybridPdfFixture();
    const pdf = await loadLocalPdf(bytes);
    const digital = await pdf.getPage(1);
    const hybrid = await pdf.getPage(2);
    expect(await pdfPageContainsRaster(digital)).toBe(false);
    expect(await pdfPageContainsRaster(hybrid)).toBe(true);
    const [header] = await readPdfPageLines(hybrid);
    await pdf.dispose();
    installNodeCanvasAdapter();

    const recognize = vi.fn(async (input: { bytes: Uint8Array; mimeType: string }) => {
      expect(input.mimeType).toBe('image/png');
      const rendered = await loadImage(input.bytes);
      expect(rendered.width).toBe(1200);
      expect(rendered.height).toBe(1600);
      // Verify that the real scan reached the raster supplied to OCR, rather than a header-only image.
      const canvas = createCanvas(rendered.width, rendered.height);
      const context = canvas.getContext('2d'); context.drawImage(rendered, 0, 0);
      const body = context.getImageData(120, 480, 960, 480).data;
      expect(Array.from(body).filter((value, index) => index % 4 === 0 && value < 80).length).toBeGreaterThan(1000);
      return {
        text: 'Naglowek cyfrowy\nZnak: WAB.6740.88.2026\nTresc zeskanowanego dowodu\nNaglowek cyfrowy',
        confidence: 88,
        lines: [
          { text: 'Naglowek cyfrowy', bounds: header.bounds },
          { text: 'Znak: WAB.6740.88.2026', bounds: { x: 0.13, y: 0.325, width: 0.5, height: 0.035 } },
          { text: 'Tresc zeskanowanego dowodu', bounds: { x: 0.13, y: 0.385, width: 0.65, height: 0.035 } },
          // Identical text at another place is separate evidence, not a duplicate to discard.
          { text: 'Naglowek cyfrowy', bounds: { x: 0.13, y: 0.445, width: 0.4, height: 0.035 } },
        ],
      };
    });
    const result = await new LocalOcrEngine({ recognize }).processDocument({ fileName: 'hybryda.pdf', mimeType: 'application/pdf', rawPayload: bytes });
    expect(recognize).toHaveBeenCalledTimes(1);
    expect(result.pageCount).toBe(2);
    expect(result.extractionMethod).toBe('pdf-mixed');
    expect(result.fullText).toContain('Pierwsza strona cyfrowa');
    expect(result.fullText).toContain('Tresc zeskanowanego dowodu');
    expect(result.lines.filter((line) => line.text === 'Naglowek cyfrowy')).toHaveLength(2);
    expect(result.lines.find((line) => line.text === 'Naglowek cyfrowy')).toMatchObject({ pageNumber: 2, confidence: 96, bounds: header.bounds });
    const fields = extractFieldsFromText({ documentId: 'hybrid', versionId: 'hybrid-ocr', text: result.fullText, sourceLines: result.lines }).fields;
    expect(fields.find((field) => field.fieldName === 'case_signature')).toMatchObject({ pageNumber: 2, rawValue: 'WAB.6740.88.2026', sourceBounds: { x: 0.13, y: 0.325 } });
  });

  it('reports an OCR failure instead of presenting only the header as a complete page', async () => {
    installNodeCanvasAdapter();
    const bytes = await hybridPdfFixture();
    const engine = new LocalOcrEngine({ async recognize() { throw new Error('Synthetic OCR failure'); } });
    await expect(engine.processDocument({ fileName: 'hybryda.pdf', rawPayload: bytes })).rejects.toMatchObject({ code: 'MALFORMED_DOCUMENT' });
  });
});
