import { describe, it, expect } from 'vitest';
import { LocalOcrEngine } from '../src/domain/ocr-engine';
import { DocumentRecord, DocumentVersion } from '../src/domain/types';

describe('LocalOcrEngine', () => {
  const engine = new LocalOcrEngine();

  it('przetwarza surowy tekst i generuje linie ze współrzędnymi oraz wskaźnikiem pewności', async () => {
    const input = {
      fileName: 'decyzja_skan.pdf',
      mimeType: 'application/pdf',
      rawPayload: 'DECYZJA NR 123/2026\nPrezydent m.st. Warszawy\nUchyla się w całości',
    };

    const result = await engine.processImageOrScan(input);

    expect(result.lines.length).toBe(3);
    expect(result.lines[0].text).toBe('DECYZJA NR 123/2026');
    expect(result.lines[0].pageNumber).toBe(1);
    expect(result.lines[0].confidence).toBeGreaterThanOrEqual(70);
    expect(result.averageConfidence).toBeGreaterThanOrEqual(70);
    expect(result.isDegradedQuality).toBe(false);
  });

  it('wykrywa obniżoną jakość skanu (rozmycie/artefakty/krótkie fragmenty)', async () => {
    const input = {
      fileName: 'bardzo_slaby_skan.jpg',
      mimeType: 'image/jpeg',
      rawPayload: '?? #\n_~',
    };

    const result = await engine.processImageOrScan(input);
    expect(result.isDegradedQuality).toBe(true);
    expect(result.averageConfidence).toBeLessThan(75);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('tworzy niemutowalną wersję OCR bez nadpisywania oryginału', async () => {
    const doc: DocumentRecord = {
      id: 'doc-scan-01',
      caseIds: ['case-01'],
      type: 'other',
      direction: 'incoming',
      origin: 'scan',
      originalFileName: 'skan.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      originalSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca4959911b7852b855',
      subfolder: '01_Otrzymane',
      activeVersionId: 'ver-orig-01',
      createdAt: '2026-10-04T10:00:00Z',
    }
    const ocrResult = await engine.processImageOrScan({
      fileName: doc.originalFileName,
      mimeType: doc.mimeType,
      rawPayload: 'Treść odczytana z dokumentu',
    });

    const newVersion: DocumentVersion = await engine.createOcrVersion(doc, ocrResult, 2);

    expect(newVersion.id).toBe('ver-doc-scan-01-ocr-v2');
    expect(newVersion.documentId).toBe('doc-scan-01');
    expect(newVersion.kind).toBe('ocr_extracted');
    expect(newVersion.versionNumber).toBe(2);
    expect(newVersion.textPayload).toBe('Treść odczytana z dokumentu');
    // Oryginał pozostaje nienaruszony (inny identyfikator niż ver-orig-01)
    expect(newVersion.id).not.toBe(doc.activeVersionId);
    expect(newVersion.contentSha256).not.toBe(doc.originalSha256);
    expect(newVersion.sourceOriginalSha256).toBe(ocrResult.sourceSha256);
  });
});
