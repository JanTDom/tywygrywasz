import { copyFile, cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modules = path.join(root, 'node_modules');
const output = path.join(root, 'public');
for (const folder of ['ocr/core', 'ocr/lang', 'pdf']) await mkdir(path.join(output, folder), { recursive: true });
await copyFile(path.join(modules, 'tesseract.js/dist/worker.min.js'), path.join(output, 'ocr/worker.min.js'));
for (const file of await readdir(path.join(modules, 'tesseract.js-core'))) {
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(file)) await copyFile(path.join(modules, 'tesseract.js-core', file), path.join(output, 'ocr/core', file));
}
for (const language of ['pol', 'eng']) {
  await copyFile(path.join(modules, `@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`), path.join(output, `ocr/lang/${language}.traineddata.gz`));
}
await copyFile(path.join(modules, 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'), path.join(output, 'pdf/pdf.worker.min.mjs'));
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) await cp(path.join(modules, 'pdfjs-dist', folder), path.join(output, 'pdf', folder), { recursive: true });
await copyFile(path.join(modules, 'pdfjs-dist/LICENSE'), path.join(output, 'pdf/LICENSE'));
await copyFile(path.join(modules, 'tesseract.js/LICENSE.md'), path.join(output, 'ocr/LICENSE.md'));
await copyFile(path.join(modules, 'tesseract.js-core/LICENSE'), path.join(output, 'ocr/core/LICENSE'));
console.log('Prepared local PDF.js worker, fonts and Polish/English OCR resources. No document data was read.');
