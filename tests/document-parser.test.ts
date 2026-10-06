import { describe, expect, it } from 'vitest';
import { LocalDocumentError, LocalOcrEngine, extractPdfText, parseRtf } from '../src/domain/ocr-engine';
import { multiPagePdfFixture } from './fixtures/pdf-fixture';
import { extractFieldsFromText } from '../src/domain/extractor';

describe('Local document parser', () => {
  it('decodes common RTF controls and Polish Unicode escapes', () => {
    expect(parseRtf('{\\rtf1\\ansi Pierwsza\\par Druga: \\u321?}')).toContain('Pierwsza\nDruga: Ł');
  });

  it('decompresses valid PDF streams without importing invisible metadata as evidence', async () => {
    const text = await extractPdfText(multiPagePdfFixture());
    expect(text).toContain('Pierwsza strona dowodu');
    expect(text).toContain('WAB.6740.12.2026');
    expect(text).not.toContain('Invisible metadata');
  });

  it('retains real pages and bounds for extracted critical fields on a rotated page', async () => {
    const result = await new LocalOcrEngine().processDocument({ fileName: 'dowod.pdf', mimeType: 'application/pdf', rawPayload: multiPagePdfFixture() });
    expect(result.pageCount).toBe(2);
    expect(result.extractionMethod).toBe('pdf-text');
    expect(result.lines[0].pageNumber).toBe(1);
    const fields = extractFieldsFromText({ documentId: 'doc-fixture', versionId: 'ver-fixture', text: result.fullText, sourceLines: result.lines }).fields;
    const signature = fields.find((field) => field.fieldName === 'case_signature')!;
    expect(signature.pageNumber).toBe(2);
    expect(signature.sourceBounds?.width).toBeGreaterThan(0);
    expect(signature.sourceBounds?.height).toBeGreaterThan(0);
    expect(signature.sourceBounds?.x).toBeGreaterThanOrEqual(0);
    expect(signature.sourceBounds?.y).toBeGreaterThanOrEqual(0);
    expect(fields.find((field) => field.fieldName === 'delivery_date')).toMatchObject({ status: 'unknown', pageNumber: 0 });
  });

  it('rejects malformed PDF bytes instead of treating strings outside a page as evidence', async () => {
    await expect(new LocalOcrEngine().processDocument({ fileName: 'bad.pdf', rawPayload: new TextEncoder().encode('%PDF-1.7\nBT (Fake date 2026-01-01) Tj ET') })).rejects.toMatchObject({ code: 'MALFORMED_DOCUMENT' });
  });

  it('fails closed for legacy binary DOC content', async () => {
    const engine = new LocalOcrEngine();
    await expect(engine.processDocument({
      fileName: 'stary.doc',
      mimeType: 'application/msword',
      rawPayload: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]),
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' } satisfies Partial<LocalDocumentError>);
  });

  it('uses an injected local OCR provider and reports cancellation', async () => {
    const engine = new LocalOcrEngine({
      async recognize(input) {
        input.onProgress?.({ phase: 'ocr', progress: 0.8, message: 'test' });
        return { text: 'Odczyt z obrazu', confidence: 91, detectedLanguage: 'pol' };
      },
    });
    const result = await engine.processDocument({
      fileName: 'scan.png',
      mimeType: 'image/png',
      rawPayload: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });
    expect(result.extractionMethod).toBe('ocr');
    expect(result.fullText).toBe('Odczyt z obrazu');

    const controller = new AbortController();
    controller.abort();
    await expect(engine.processDocument({ fileName: 'scan.png', rawPayload: new Uint8Array([1]), signal: controller.signal }))
      .rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
