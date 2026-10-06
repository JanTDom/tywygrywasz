/**
 * Local document text extraction and OCR boundary.
 *
 * Text and RTF are decoded in-process. PDFs with an embedded text layer are
 * parsed locally without a network request. Raster images and scanned PDFs
 * are delegated to an injected local OCR provider (for example Tesseract.js
 * configured with bundled Polish traineddata); the default provider fails
 * closed instead of pretending that a heuristic is OCR.
 */

import { computeSha256 } from './crypto';
import { DocumentRecord, DocumentVersion, DocumentSourceLine, SourceBounds } from './types';
import { loadLocalPdf, pdfPageAsPng, pdfPageContainsRaster, readPdfPageLines } from './pdf-document';
import { BundledPolishOcrProvider } from './local-ocr-provider';

export type OcrBoundingBox = DocumentSourceLine;

export interface OcrProgress {
  phase: 'decode' | 'pdf-text' | 'ocr' | 'complete';
  progress: number;
  message: string;
}

export interface LocalOcrProviderInput {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  signal?: AbortSignal;
  onProgress?: (progress: OcrProgress) => void;
}

export interface LocalOcrProviderResult {
  text: string;
  confidence?: number;
  lines?: Array<{ text: string; pageNumber?: number; confidence?: number; bounds?: SourceBounds }>;
  detectedLanguage?: string;
}

export interface LocalOcrProvider {
  recognize(input: LocalOcrProviderInput): Promise<LocalOcrProviderResult>;
}

export interface OcrResult {
  fullText: string;
  averageConfidence: number;
  lines: OcrBoundingBox[];
  detectedLanguage: string;
  sourceSha256: string;
  isDegradedQuality: boolean;
  warnings: string[];
  extractionMethod?: 'text' | 'rtf' | 'pdf-text' | 'ocr' | 'pdf-mixed';
  pageCount?: number;
}

export interface DocumentProcessingParams {
  fileName: string;
  mimeType?: string;
  rawPayload: string | ArrayBuffer | Uint8Array;
  pageCount?: number;
  signal?: AbortSignal;
  onProgress?: (progress: OcrProgress) => void;
}

export class LocalDocumentError extends Error {
  public readonly code: 'UNSUPPORTED_FORMAT' | 'OCR_PROVIDER_UNAVAILABLE' | 'CANCELLED' | 'MALFORMED_DOCUMENT' | 'PASSWORD_REQUIRED';

  constructor(code: LocalDocumentError['code'], message: string) {
    super(message);
    this.name = 'LocalDocumentError';
    this.code = code;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new LocalDocumentError('CANCELLED', 'Przetwarzanie dokumentu anulowano.');
}

function asBytes(rawPayload: string | ArrayBuffer | Uint8Array): Uint8Array {
  if (typeof rawPayload === 'string') return new TextEncoder().encode(rawPayload);
  if (rawPayload instanceof Uint8Array) return rawPayload.slice();
  return new Uint8Array(rawPayload.slice(0));
}

function extension(fileName: string): string {
  return fileName.trim().toLowerCase().split('.').pop() || '';
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '');
}

/** Decode the subset of RTF controls used by ordinary office exports. */
export function parseRtf(input: string): string {
  let text = input
    .replace(/\\par[d]?\b\s?/gi, '\n')
    .replace(/\\line\b\s?/gi, '\n')
    .replace(/\\tab\b\s?/gi, '\t')
    .replace(/\\u(-?\d+)\??/g, (_match, code: string) => {
      const value = Number.parseInt(code, 10);
      return Number.isFinite(value) ? String.fromCharCode(value < 0 ? value + 65536 : value) : '';
    })
    .replace(/\\'[0-9a-f]{2}/gi, (match) => {
      const byte = Number.parseInt(match.slice(2), 16);
      return new TextDecoder('windows-1250').decode(new Uint8Array([byte]));
    });

  // Remove destinations and formatting groups, keeping text groups. This is
  // deliberately conservative; binary/embedded objects are ignored.
  text = text.replace(/\\(?:fonttbl|colortbl|stylesheet|info|pict|object)\b[\s\S]*?(?=\\pard|\\par|})/gi, '');
  text = text.replace(/\\[a-z]+-?\d* ?/gi, '');
  text = text.replace(/[{}]/g, '');
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

/** Extract a real PDF text layer with decompression, Unicode fonts and page identity. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await loadLocalPdf(bytes);
  try {
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      pages.push((await readPdfPageLines(page)).map((line) => line.text).join('\n'));
      page.cleanup();
    }
    return pages.join('\n\f\n').trim();
  } finally { await pdf.dispose(); }
}

function lineConfidence(line: string): number {
  const suspicious = (line.match(/[^\p{L}\p{N} .,:;/\\()\-+%€@]/gu) || []).length;
  return Math.max(45, Math.min(99, Math.round(99 - (suspicious / Math.max(1, line.length)) * 100)));
}

function makeLines(text: string, pageCount: number, confidence?: number): OcrBoundingBox[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => ({
    // Plain text has no physical page map; never invent pagination.
    pageNumber: 1,
    lineIndex: index + 1,
    text: line,
    confidence: confidence ?? lineConfidence(line),
  }));
}

function buildResult(text: string, sourceSha256: string, method: OcrResult['extractionMethod'], pageCount: number, confidence?: number, detectedLanguage = 'pol', warnings: string[] = []): OcrResult {
  const lines = makeLines(text, pageCount, confidence);
  const averageConfidence = lines.length ? Math.round(lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length) : 0;
  const finalWarnings = [...warnings];
  const isDegradedQuality = averageConfidence < 75 || finalWarnings.length > 0;
  if (isDegradedQuality && !finalWarnings.some((warning) => warning.includes('weryfikacji'))) {
    finalWarnings.unshift('Wynik wymaga ręcznej weryfikacji z oryginałem dokumentu.');
  }
  return { fullText: text, averageConfidence, lines, pageCount, detectedLanguage, sourceSha256, isDegradedQuality, warnings: finalWarnings, extractionMethod: method };
}

function sameLocatedLine(embedded: OcrBoundingBox, recognized: OcrBoundingBox): boolean {
  const normalize = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pl');
  if (normalize(embedded.text) !== normalize(recognized.text) || !embedded.bounds || !recognized.bounds) return false;
  const a = embedded.bounds;
  const b = recognized.bounds;
  const overlapWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const overlapHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return smallerArea > 0 && overlapWidth * overlapHeight / smallerArea >= 0.5;
}

/** Keep exact digital text and its bounds; remove only the same text at the same location. */
function mergePdfPageLines(embedded: OcrBoundingBox[], recognized: OcrBoundingBox[], pageNumber: number): OcrBoundingBox[] {
  const additional = recognized.filter((line) => !embedded.some((digital) => sameLocatedLine(digital, line)));
  const combined = [...embedded, ...additional];
  // Located mixed lines follow the displayed page. Unlocated OCR remains in provider order.
  if (combined.every((line) => line.bounds)) {
    combined.sort((a, b) => a.bounds!.y - b.bounds!.y || a.bounds!.x - b.bounds!.x);
  }
  return combined.map((line, index) => ({ ...line, pageNumber, lineIndex: index + 1 }));
}

export class LocalOcrEngine {
  private readonly provider?: LocalOcrProvider;

  constructor(provider?: LocalOcrProvider) {
    this.provider = provider ?? (typeof window !== 'undefined' ? new BundledPolishOcrProvider() : undefined);
  }

  public async processDocument(params: DocumentProcessingParams): Promise<OcrResult> {
    throwIfAborted(params.signal);
    const bytes = asBytes(params.rawPayload);
    const sourceSha256 = await computeSha256(bytes);
    const ext = extension(params.fileName);
    const mime = (params.mimeType || '').toLowerCase();
    const pageCount = params.pageCount || 1;
    params.onProgress?.({ phase: 'decode', progress: 0.1, message: 'Odczytywanie dokumentu lokalnie…' });

    // The historical API accepted a text payload even when callers supplied
    // a PDF/image filename. Preserve that useful test/import path: a string
    // is already decoded text, while binary raster/PDF inputs remain strict.
    if (typeof params.rawPayload === 'string' && ext !== 'rtf' && ext !== 'pdf' && ext !== 'doc') {
      return buildResult(params.rawPayload, sourceSha256, 'text', pageCount, undefined);
    }
    if (typeof params.rawPayload === 'string' && ext === 'pdf' && !params.rawPayload.startsWith('%PDF-')) {
      return buildResult(params.rawPayload, sourceSha256, 'text', pageCount, undefined);
    }

    if (ext === 'txt' || mime === 'text/plain') {
      return buildResult(decodeUtf8(bytes), sourceSha256, 'text', pageCount, 99);
    }
    if (ext === 'rtf' || mime === 'application/rtf' || mime === 'text/rtf') {
      return buildResult(parseRtf(decodeUtf8(bytes)), sourceSha256, 'rtf', pageCount, 97);
    }
    if (ext === 'pdf' || mime === 'application/pdf') {
      params.onProgress?.({ phase: 'pdf-text', progress: 0.25, message: 'Wyszukiwanie tekstu osadzonego w PDF…' });
      let pdf;
      try { pdf = await loadLocalPdf(bytes, params.signal); }
      catch (error) {
        throwIfAborted(params.signal);
        if (error instanceof Error && error.name === 'PasswordException') {
          throw new LocalDocumentError('PASSWORD_REQUIRED', 'PDF jest chroniony hasłem. Oryginał pozostaje nienaruszony; odblokuj kopię lokalnie i dodaj ją jako nową wersję.');
        }
        throw new LocalDocumentError('MALFORMED_DOCUMENT', 'Nie można odczytać struktury PDF. Sprawdź plik w lokalnym czytniku; oryginał pozostaje zachowany.');
      }
      const lines: OcrBoundingBox[] = [];
      const warnings: string[] = [];
      let ocrPages = 0;
      let embeddedPages = 0;
      try {
        for (let number = 1; number <= pdf.numPages; number++) {
          throwIfAborted(params.signal);
          const page = await pdf.getPage(number);
          const embedded = await readPdfPageLines(page);
          if (embedded.length) embeddedPages++;
          const needsOcr = !embedded.length || await pdfPageContainsRaster(page);
          if (!needsOcr) lines.push(...embedded);
          else {
            ocrPages++;
            if (!this.provider) throw new LocalDocumentError('OCR_PROVIDER_UNAVAILABLE', 'Rozpoznawanie skanów PDF wymaga lokalnego środowiska przeglądarki.');
            params.onProgress?.({ phase: 'ocr', progress: number / pdf.numPages, message: `Lokalny OCR: strona ${number} z ${pdf.numPages}…` });
            const recognized = await this.provider.recognize({ bytes: await pdfPageAsPng(page, params.signal), fileName: 'page.png', mimeType: 'image/png', signal: params.signal, onProgress: params.onProgress });
            const pageLines = recognized.lines?.length ? recognized.lines : makeLines(recognized.text.trim(), 1, recognized.confidence);
            const recognizedLines = pageLines.map((line, index) => ({ ...line, pageNumber: number, lineIndex: index + 1, confidence: line.confidence ?? recognized.confidence ?? 70, bounds: line.bounds }));
            lines.push(...mergePdfPageLines(embedded, recognizedLines, number));
            if (!recognized.text.trim()) warnings.push(`Na stronie ${number} nie rozpoznano tekstu. Sprawdź oryginał.`);
          }
          page.cleanup();
        }
        const text = Array.from({ length: pdf.numPages }, (_, index) => lines.filter((line) => line.pageNumber === index + 1).map((line) => line.text).join('\n')).join('\n\f\n').trim();
        const method = !ocrPages ? 'pdf-text' : embeddedPages ? 'pdf-mixed' : 'ocr';
        const result = buildResult(text, sourceSha256, method, pdf.numPages, undefined, 'pol', warnings);
        result.lines = lines;
        result.averageConfidence = lines.length ? Math.round(lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length) : 0;
        result.isDegradedQuality = result.averageConfidence < 75 || warnings.length > 0;
        params.onProgress?.({ phase: 'complete', progress: 1, message: 'Lokalny odczyt PDF zakończony.' });
        return result;
      } catch (error) {
        throwIfAborted(params.signal);
        if (error instanceof LocalDocumentError) throw error;
        throw new LocalDocumentError('MALFORMED_DOCUMENT', 'Nie udało się odczytać strony PDF lokalnie. Oryginał jest zachowany.');
      } finally { await pdf.dispose(); }
    }
    if (ext === 'doc' || mime === 'application/msword') {
      throw new LocalDocumentError('UNSUPPORTED_FORMAT', 'Stary format DOC można przechować i pobrać, ale lokalny parser nie odczytuje jego treści. Zapisz dokument jako DOCX, PDF, RTF lub TXT.');
    }
    if (['jpg', 'jpeg', 'png'].includes(ext) || mime.startsWith('image/')) {
      if (!this.provider) {
        throw new LocalDocumentError('OCR_PROVIDER_UNAVAILABLE', 'Lokalny silnik OCR nie jest jeszcze dostępny w tej instalacji. Obraz został zachowany bez wysyłania go do zewnętrznej usługi.');
      }
    }
    if (!this.provider) throw new LocalDocumentError('UNSUPPORTED_FORMAT', `Nieobsługiwany format dokumentu: ${ext || mime || 'nieznany'}.`);

    throwIfAborted(params.signal);
    params.onProgress?.({ phase: 'ocr', progress: 0.35, message: 'Rozpoznawanie tekstu lokalnie…' });
    let recognized: LocalOcrProviderResult;
    try { recognized = await this.provider.recognize({ bytes, fileName: params.fileName, mimeType: mime, signal: params.signal, onProgress: params.onProgress }); }
    catch { throwIfAborted(params.signal); throw new LocalDocumentError('MALFORMED_DOCUMENT', 'Lokalny OCR nie może odczytać obrazu. Sprawdź format i kompletność pliku.'); }
    throwIfAborted(params.signal);
    params.onProgress?.({ phase: 'complete', progress: 1, message: 'Lokalne rozpoznawanie zakończone.' });
    const text = recognized.text.trim();
    const result = buildResult(text, sourceSha256, 'ocr', pageCount, recognized.confidence, recognized.detectedLanguage || 'pol', text ? [] : ['OCR nie rozpoznał tekstu.']);
    if (recognized.lines?.length) result.lines = recognized.lines.map((line, index) => ({ pageNumber: line.pageNumber || 1, lineIndex: index + 1, text: line.text, confidence: line.confidence ?? recognized.confidence ?? 70, bounds: line.bounds }));
    return result;
  }

  /** Compatibility entry point retained for existing callers. */
  public async processImageOrScan(params: DocumentProcessingParams): Promise<OcrResult> {
    return this.processDocument(params);
  }

  public async createOcrVersion(doc: DocumentRecord, ocrResult: OcrResult, versionNumber: number): Promise<DocumentVersion> {
    return {
      id: `ver-${doc.id}-ocr-v${versionNumber}`,
      documentId: doc.id,
      versionNumber,
      parentVersionId: doc.activeVersionId,
      kind: 'ocr_extracted',
      contentSha256: await computeSha256(ocrResult.fullText),
      sourceOriginalSha256: ocrResult.sourceSha256,
      textPayload: ocrResult.fullText,
      pageCount: ocrResult.pageCount,
      sourceLines: ocrResult.lines,
      extractionMethod: ocrResult.extractionMethod,
      createdAt: new Date().toISOString(),
      toolOrAuthor: `Lokalny silnik (${ocrResult.extractionMethod || 'OCR'}, jakość: ${ocrResult.averageConfidence}%)`,
    };
  }
}
