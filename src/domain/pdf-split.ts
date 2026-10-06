/** Creates separate local page copies. Source bytes are never modified. */
export async function splitLocalPdf(bytes: Uint8Array, ranges: Array<{ from: number; to: number; title: string }>) {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageCount = source.getPageCount();
  if (!ranges.length || ranges.length > 20) throw new Error('Wybierz od 1 do 20 części dokumentu.');
  for (const range of ranges) {
    if (!Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < 1 || range.to < range.from || range.to > pageCount) {
      throw new Error('Zakres wykracza poza rzeczywiste strony dokumentu.');
    }
  }
  return Promise.all(ranges.map(async (range, index) => {
    const copy = await PDFDocument.create();
    const pages = await copy.copyPages(source, Array.from({ length: range.to - range.from + 1 }, (_, offset) => range.from - 1 + offset));
    pages.forEach((page) => copy.addPage(page));
    const safeTitle = range.title.trim().replace(/[\\/<>:"|?*]/g, '_').slice(0, 100) || `czesc-${index + 1}`;
    return { ...range, fileName: `${safeTitle}.pdf`, bytes: await copy.save() };
  }));
}
