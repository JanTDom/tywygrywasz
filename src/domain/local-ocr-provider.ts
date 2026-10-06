import type { LocalOcrProvider, LocalOcrProviderInput, LocalOcrProviderResult } from './ocr-engine';
import type { SourceBounds } from './types';

/** Explicit same-origin paths prevent Tesseract's default CDN fallback. */
export const LOCAL_OCR_ASSETS = Object.freeze({
  workerPath: '/ocr/worker.min.js', corePath: '/ocr/core', langPath: '/ocr/lang',
});

export class BundledPolishOcrProvider implements LocalOcrProvider {
  public async recognize(input: LocalOcrProviderInput): Promise<LocalOcrProviderResult> {
    if (typeof window === 'undefined') throw new Error('OCR_BROWSER_REQUIRED');
    if (input.signal?.aborted) throw new Error('CANCELLED');
    const { createWorker } = await import('tesseract.js');
    // Decode only locally selected bytes; private names never enter a resource URL.
    const blob = new Blob([input.bytes.slice().buffer], { type: input.mimeType || 'image/png' });
    const image = await createImageBitmap(blob);
    const width = image.width;
    const height = image.height;
    image.close();
    if (width * height > 40_000_000) throw new Error('IMAGE_PIXEL_LIMIT');
    const worker = await createWorker('pol+eng', 1, {
      ...LOCAL_OCR_ASSETS, workerBlobURL: false, cacheMethod: 'none', gzip: true,
      logger: ({ progress }) => input.onProgress?.({ phase: 'ocr', progress, message: 'Rozpoznawanie tekstu na tym urządzeniu…' }),
      errorHandler: () => { /* Never log private OCR input or library payloads. */ },
    });
    const abort = () => { void worker.terminate(); };
    input.signal?.addEventListener('abort', abort, { once: true });
    try {
      if (input.signal?.aborted) throw new Error('CANCELLED');
      const { data } = await worker.recognize(blob, {}, { text: true, blocks: true });
      const lines = (data.blocks || []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)).map((line) => ({
        text: line.text, confidence: line.confidence, pageNumber: 1,
        bounds: { x: line.bbox.x0 / width, y: line.bbox.y0 / height, width: (line.bbox.x1 - line.bbox.x0) / width,
          height: (line.bbox.y1 - line.bbox.y0) / height } satisfies SourceBounds,
      }));
      return { text: data.text, confidence: data.confidence, detectedLanguage: 'pol+eng', lines };
    } finally {
      input.signal?.removeEventListener('abort', abort);
      await worker.terminate();
    }
  }
}
