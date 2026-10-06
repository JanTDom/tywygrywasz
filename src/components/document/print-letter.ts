/** The print frame contains only the reviewed export text, never the surrounding private UI. */
export function printLetterText(text: string): void {
  const frame = document.createElement('iframe');
  frame.title = 'Wydruk wybranego projektu pisma';
  frame.className = 'no-print';
  frame.style.cssText = 'position:fixed;left:-10000px;width:800px;height:1000px;border:0';
  document.body.appendChild(frame);
  const printDocument = frame.contentDocument;
  const printWindow = frame.contentWindow;
  if (!printDocument || !printWindow) { frame.remove(); throw new Error('Nie można przygotować wydruku pisma.'); }
  const style = printDocument.createElement('style');
  style.textContent = '@page{size:A4;margin:22mm}body{color:#000;background:#fff;font:12pt Georgia,serif;line-height:1.5}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}';
  printDocument.head.appendChild(style);
  printDocument.title = 'Projekt pisma';
  const content = printDocument.createElement('pre');
  content.textContent = text;
  printDocument.body.appendChild(content);
  printWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
  printWindow.focus();
  printWindow.print();
}
