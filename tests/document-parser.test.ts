import { describe, expect, it } from 'vitest';
import { LocalDocumentError, LocalOcrEngine, extractPdfText, parseRtf } from '../src/domain/ocr-engine';

describe('Local document parser', () => {
  it('decodes common RTF controls and Polish Unicode escapes', () => {
    expect(parseRtf('{\\rtf1\\ansi Pierwsza\\par Druga: \\u321?}')).toContain('Pierwsza\nDruga: Ł');
  });

  it('extracts a text layer from a simple local PDF stream', () => {
    const pdf = new TextEncoder().encode('%PDF-1.7\nBT (Decyzja 123/2026) Tj ET\n%%EOF');
    expect(extractPdfText(pdf)).toContain('Decyzja 123/2026');
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
