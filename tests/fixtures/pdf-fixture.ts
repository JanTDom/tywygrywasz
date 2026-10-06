import { deflateSync } from 'node:zlib';

/** A valid synthetic PDF with compressed text streams and a rotated second page. */
export function multiPagePdfFixture(): Uint8Array {
  const objects: Buffer[] = [];
  const add = (value: string | Buffer) => objects.push(typeof value === 'string' ? Buffer.from(value, 'latin1') : value);
  const stream = (text: string) => {
    const compressed = deflateSync(Buffer.from(text, 'latin1'));
    return Buffer.concat([Buffer.from(`<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`), compressed, Buffer.from('\nendstream')]);
  };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>');
  add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>');
  add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Rotate 90 /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  add(stream('BT /F1 14 Tf 60 720 Td (Pierwsza strona dowodu) Tj ET'));
  add(stream('BT /F1 14 Tf 60 720 Td (Znak: WAB.6740.12.2026) Tj 0 -30 Td (POUCZENIE: w terminie 14 dni) Tj ET'));
  add('<< /Producer (Invisible metadata must not become document evidence) >>');
  const parts = [Buffer.from('%PDF-1.7\n', 'latin1')];
  const offsets = [0];
  let size = parts[0].length;
  for (let index = 0; index < objects.length; index++) {
    offsets.push(size);
    const object = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), objects[index], Buffer.from('\nendobj\n')]);
    parts.push(object); size += object.length;
  }
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${size}\n%%EOF`;
  return new Uint8Array(Buffer.concat([...parts, Buffer.from(xref)]));
}
