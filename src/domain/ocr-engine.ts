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
import { DocumentRecord, DocumentVersion } from './types';

export interface OcrBoundingBox {
  pageNumber: number;
  lineIndex: number;
  text: string;
  confidence: number;
}

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
  lines?: Array<{ text: string; pageNumber?: number; confidence?: number }>;
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
  extractionMethod?: 'text' | 'rtf' | 'pdf-text' | 'ocr';
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
  public readonly code: 'UNSUPPORTED_FORMAT' | 'OCR_PROVIDER_UNAVAILABLE' | 'CANCELLED' | 'MALFORMED_DOCUMENT';

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

/**
 * Extract visible literal strings and simple TJ arrays from an uncompressed
 * PDF text layer. Scanned/image-only PDFs intentionally return an empty text
 * result so the caller can invoke the injected OCR provider.
 */
export function extractPdfText(bytes: Uint8Array): string {
  const source = new TextDecoder('latin1').decode(bytes);
  if (!source.startsWith('%PDF-')) throw new LocalDocumentError('MALFORMED_DOCUMENT', 'Plik nie zawiera poprawnego nagłówka PDF.');

  const output: string[] = [];
  const literal = /\((?:\\.|[^\\)])*\)/g;
  let match: RegExpExecArray | null;
  while ((match = literal.exec(source))) {
    const value = match[0].slice(1, -1)
      .replace(/\\([()\\])/g, '$1')
      .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
      .replace(/\\([0-7]{1,3})/g, (_all, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
    if (/[A-Za-zÀ-ž0-9]/.test(value)) output.push(value);
  }

  const tj = /\[([^\]]+)\]\s*TJ/g;
  while ((match = tj.exec(source))) {
    const chunks = match[1].match(/\((?:\\.|[^\\)])*\)/g) || [];
    const value = chunks.map((chunk) => chunk.slice(1, -1).replace(/\\([()\\])/g, '$1')).join('');
    if (/[A-Za-zÀ-ž0-9]/.test(value)) output.push(value);
  }
  return output.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function lineConfidence(line: string): number {
  const suspicious = (line.match(/[^\p{L}\p{N} .,:;/\\()\-+%€@]/gu) || []).length;
  return Math.max(45, Math.min(99, Math.round(99 - (suspicious / Math.max(1, line.length)) * 100)));
}

function makeLines(text: string, pageCount: number, confidence?: number): OcrBoundingBox[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => ({
    pageNumber: Math.min(Math.max(1, pageCount), Math.floor(index / 45) + 1),
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
  return { fullText: text, averageConfidence, lines, detectedLanguage, sourceSha256, isDegradedQuality, warnings: finalWarnings, extractionMethod: method };
}

export class LocalOcrEngine {
  private readonly provider?: LocalOcrProvider;

  constructor(provider?: LocalOcrProvider) {
    this.provider = provider;
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
      const text = extractPdfText(bytes);
      if (text) return buildResult(text, sourceSha256, 'pdf-text', pageCount, 96);
      if (!this.provider) {
        throw new LocalDocumentError('OCR_PROVIDER_UNAVAILABLE', 'Ten PDF jest skanem bez warstwy tekstowej. Dodaj lokalny silnik OCR z polskim modelem, aby go rozpoznać. Oryginał pozostaje dostępny.');
      }
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
    const recognized = await this.provider.recognize({ bytes, fileName: params.fileName, mimeType: mime, signal: params.signal, onProgress: params.onProgress });
    throwIfAborted(params.signal);
    params.onProgress?.({ phase: 'complete', progress: 1, message: 'Lokalne rozpoznawanie zakończone.' });
    const text = recognized.text.trim();
    const result = buildResult(text, sourceSha256, 'ocr', pageCount, recognized.confidence, recognized.detectedLanguage || 'pol', text ? [] : ['OCR nie rozpoznał tekstu.']);
    if (recognized.lines?.length) result.lines = recognized.lines.map((line, index) => ({ pageNumber: line.pageNumber || 1, lineIndex: index + 1, text: line.text, confidence: line.confidence ?? recognized.confidence ?? 70 }));
    return result;
  }

  /** Compatibility entry point retained for existing callers. */
  public async processImageOrScan(params: DocumentProcessingParams): Promise<OcrResult> {
    return this.processDocument(params);
  }

  public createOcrVersion(doc: DocumentRecord, ocrResult: OcrResult, versionNumber: number): DocumentVersion {
    return {
      id: `ver-${doc.id}-ocr-v${versionNumber}`,
      documentId: doc.id,
      versionNumber,
      parentVersionId: doc.activeVersionId,
      kind: 'ocr_extracted',
      contentSha256: ocrResult.sourceSha256,
      textPayload: ocrResult.fullText,
      createdAt: new Date().toISOString(),
      toolOrAuthor: `Lokalny silnik (${ocrResult.extractionMethod || 'OCR'}, jakość: ${ocrResult.averageConfidence}%)`,
    };
  }
}
