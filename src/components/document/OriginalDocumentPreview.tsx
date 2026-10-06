'use client';

import { useEffect, useRef, useState } from 'react';
import type { DocumentRecord, ExtractedField } from '../../domain/types';
import { loadLocalPdf, renderLocalPdfPage, type LocalPdfDocument } from '../../domain/pdf-document';
import { verifyOriginalBytes, type DocumentIntegrityStatus } from '../../domain/document-integrity';

interface Props {
  document: DocumentRecord;
  onLoadOriginal?: (documentId: string) => Promise<Uint8Array | null>;
  sourceField?: ExtractedField;
}

export function OriginalDocumentPreview({ document: record, onLoadOriginal, sourceField }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<LocalPdfDocument | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [status, setStatus] = useState<DocumentIntegrityStatus | 'loading' | 'unavailable'>('loading');
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let currentPdf: LocalPdfDocument | null = null;
    let localUrl = '';
    setStatus('loading'); setPdf(null); setBytes(null); setImageUrl(''); setError(''); setPageNumber(1);
    void (async () => {
      try {
        const original = onLoadOriginal ? await onLoadOriginal(record.id) : null;
        if (controller.signal.aborted) return;
        const integrity = await verifyOriginalBytes(record, original);
        if (controller.signal.aborted) return;
        setStatus(integrity);
        if (!original || integrity !== 'verified') return;
        setBytes(original);
        const ext = record.originalFileName.split('.').pop()?.toLowerCase();
        if (record.mimeType === 'application/pdf' || ext === 'pdf') {
          currentPdf = await loadLocalPdf(original, controller.signal);
          if (controller.signal.aborted) { await currentPdf.dispose(); return; }
          setPdf(currentPdf);
        } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext || '') || ['image/png', 'image/jpeg', 'image/webp'].includes(record.mimeType)) {
          localUrl = URL.createObjectURL(new Blob([original.slice().buffer], { type: record.mimeType.startsWith('image/') ? record.mimeType : `image/${ext === 'jpg' ? 'jpeg' : ext}` }));
          setImageUrl(localUrl);
        }
      } catch {
        if (!controller.signal.aborted) {
          setStatus((current) => current === 'loading' ? 'unavailable' : current);
          setError('Podgląd nie może otworzyć tego pliku. Sprawdź magazyn lokalny lub wskaż ponownie zgodny oryginał. PDF może być uszkodzony lub chroniony hasłem.');
        }
      }
    })();
    return () => { controller.abort(); if (localUrl) URL.revokeObjectURL(localUrl); if (currentPdf) void currentPdf.dispose(); };
    // The record's immutable identity is the load key. The callback may be recreated during UI refreshes.
  }, [record.id, record.originalSha256, record.isMissingOnDisk]);

  useEffect(() => { if (sourceField && sourceField.pageNumber > 0) setPageNumber(sourceField.pageNumber); }, [sourceField]);
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    const controller = new AbortController();
    setRendering(true);
    void pdf.getPage(Math.min(pdf.numPages, pageNumber)).then((page) => {
      if (!controller.signal.aborted && canvasRef.current) return renderLocalPdfPage(page, canvasRef.current, 1.4, controller.signal);
    }).catch(() => { if (!controller.signal.aborted) setError('Nie udało się wyświetlić tej strony PDF.'); })
      .finally(() => { if (!controller.signal.aborted) setRendering(false); });
    return () => controller.abort();
  }, [pdf, pageNumber]);

  const bounds = sourceField?.pageNumber === pageNumber ? sourceField.sourceBounds : undefined;
  const download = () => {
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: record.mimeType }));
    const link = globalThis.document.createElement('a'); link.href = url; link.download = record.originalFileName; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-3">
      <div role="status" className={`rounded-lg border px-3 py-2 text-[11px] font-medium ${status === 'verified' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : status === 'loading' ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
        {status === 'loading' ? 'Sprawdzanie bajtów i SHA-256 lokalnego oryginału…' : status === 'verified' ? 'SHA-256 i rozmiar zgodne — bajty oryginału zweryfikowane.' : status === 'missing' ? 'Brak bajtów oryginału w magazynie. Wskaż ponownie plik o tej samej sumie kontrolnej.' : status === 'unavailable' ? 'Nie można odczytać lokalnego oryginału. Sprawdź magazyn lub wskaż ponownie zgodny plik.' : 'Bajty mają inną sumę kontrolną lub rozmiar. Oryginał nie został zastąpiony; sprawdź plik.'}
      </div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {pdf && <div className="flex items-center justify-between gap-2 text-xs">
        <button type="button" disabled={pageNumber <= 1} onClick={() => setPageNumber((page) => page - 1)} className="rounded-lg border px-2 py-1 disabled:opacity-40">Poprzednia</button>
        <span>Strona {pageNumber} z {pdf.numPages}{rendering ? ' · odczyt…' : ''}</span>
        <button type="button" disabled={pageNumber >= pdf.numPages} onClick={() => setPageNumber((page) => page + 1)} className="rounded-lg border px-2 py-1 disabled:opacity-40">Następna</button>
      </div>}
      {(pdf || imageUrl) && <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white">
        {pdf ? <canvas ref={canvasRef} aria-label={`Oryginał dokumentu, strona ${pageNumber}`} className="block h-auto w-full" /> : <img src={imageUrl} alt="Lokalny oryginał dokumentu" className="block h-auto w-full" />}
        {bounds && <div aria-label="Fragment będący źródłem wybranego pola" className="pointer-events-none absolute border-2 border-amber-500 bg-amber-200/35" style={{ left: `${bounds.x * 100}%`, top: `${bounds.y * 100}%`, width: `${bounds.width * 100}%`, height: `${bounds.height * 100}%` }} />}
      </div>}
      {bytes && !pdf && !imageUrl && !error && <div className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-xs">{record.mimeType.startsWith('text/') || /\.(txt|rtf)$/i.test(record.originalFileName) ? new TextDecoder().decode(bytes) : 'Ten format można pobrać i otworzyć w lokalnej aplikacji.'}</div>}
      {bytes && <button type="button" onClick={download} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Pobierz nienaruszony oryginał</button>}
    </div>
  );
}
