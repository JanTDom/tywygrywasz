import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { splitLocalPdf } from '../src/domain/pdf-split';
import { LocalOcrEngine } from '../src/domain/ocr-engine';
import { computeSha256 } from '../src/domain/crypto';

describe('local PDF page copies', () => {
  it('copies the selected actual page while preserving the source bytes', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText('FIRST PAGE', { font });
    pdf.addPage().drawText('SECOND PAGE', { font });
    const original = await pdf.save();
    const before = await computeSha256(original);
    const [part] = await splitLocalPdf(original, [{ from: 2, to: 2, title: 'Dowod' }]);
    const result = await new LocalOcrEngine().processDocument({ fileName: part.fileName, mimeType: 'application/pdf', rawPayload: part.bytes });
    expect(result.fullText).toContain('SECOND PAGE');
    expect(result.fullText).not.toContain('FIRST PAGE');
    expect(result.pageCount).toBe(1);
    expect(await computeSha256(original)).toBe(before);
    await expect(splitLocalPdf(original, [{ from: 2, to: 3, title: '' }])).rejects.toThrow('Zakres');
  });
});
