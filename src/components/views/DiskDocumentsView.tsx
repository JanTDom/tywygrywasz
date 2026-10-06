'use client';

import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  FolderOpen,
  FileText,
  FileCode,
  ShieldCheck,
  Split,
  Eye,
  Upload,
  X,
} from 'lucide-react';
import { DocumentRecord, DocumentVersion, DiskFileInfo, Case, ExtractedField } from '../../domain/types';
import { SideBySideViewer } from '../document/SideBySideViewer';
import { OriginalDocumentPreview } from '../document/OriginalDocumentPreview';

interface DiskDocumentsViewProps {
  cases: Case[];
  activeCaseId: string | null;
  documents: DocumentRecord[];
  versions: DocumentVersion[];
  diskFiles: DiskFileInfo[];
  extractedFields?: ExtractedField[];
  onScanDisk: () => Promise<void>;
  onImportFiles: (files: FileList | File[], contextNote?: string) => Promise<void>;
  onUpdateDocumentContext?: (documentId: string, contextNote: string) => Promise<void>;
  onSplitMultiPageScan: (docId: string, ranges: Array<{ from: number; to: number; title: string }>) => Promise<void>;
  onRunLocalOcr?: (docId: string) => Promise<void>;
  onSaveCorrection?: (docId: string, text: string, note: string) => Promise<void>;
  onConfirmField?: (fieldId: string, val: string) => void;
  onLoadOriginal?: (documentId: string) => Promise<Uint8Array | null>;
  onRelinkOriginal?: (documentId: string, file: File) => Promise<void>;
  isScanning: boolean;
}

export function DiskDocumentsView({
  cases,
  activeCaseId,
  documents,
  versions,
  diskFiles: _diskFiles,
  extractedFields = [],
  onScanDisk,
  onImportFiles,
  onUpdateDocumentContext,
  onSplitMultiPageScan,
  onRunLocalOcr,
  onSaveCorrection,
  onConfirmField,
  onLoadOriginal,
  onRelinkOriginal,
  isScanning,
}: DiskDocumentsViewProps) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [filterCaseId, setFilterCaseId] = useState<string>(activeCaseId || 'all');
  const [isSideBySideOpen, setIsSideBySideOpen] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [contextNote, setContextNote] = useState('');
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isContextEditing, setIsContextEditing] = useState(false);
  const [contextDraft, setContextDraft] = useState('');
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [relinkError, setRelinkError] = useState('');
  const [isRelinking, setIsRelinking] = useState(false);
  const [previewRefresh, setPreviewRefresh] = useState(0);
  const [splitRanges, setSplitRanges] = useState([{ from: 1, to: 1, title: 'Dokument 1' }]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitError, setSplitError] = useState('');
  useEffect(() => { setSplitRanges([{ from: 1, to: 1, title: 'Dokument 1' }]); setSplitError(''); }, [selectedDocId]);

  const filteredDocuments = documents.filter((d) => {
    if (filterCaseId === 'all') return true;
    return d.caseIds.includes(filterCaseId);
  });

  const selectedDoc = documents.find((d) => d.id === selectedDocId);
  const selectedVersions = versions.filter((v) => v.documentId === selectedDocId);
  const activeVersion = selectedVersions.find((v) => v.id === selectedDoc?.activeVersionId);


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Dokumenty na dysku
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            W wersji webowej pliki trafiają do zaszyfrowanego magazynu przeglądarki na tym urządzeniu — nie do naszej chmury.
            W lokalnym trybie możesz pracować z katalogiem <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-xs text-slate-800">Moje_sprawy/</code>.
            Tekst PDF oraz polski OCR zdjęć i skanów odczytujemy lokalnie za pomocą dołączonych silników.
          </p>
          <p className="text-xs text-slate-500 mt-2">Obsługiwane formaty: DOC, RTF, TXT, PDF, JPG, JPEG i PNG.</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 whitespace-nowrap">
          <label className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors shadow-sm cursor-pointer">
            <input type="file" multiple accept=".doc,.rtf,.txt,.pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(event) => { if (event.target.files?.length) { setPendingFiles(Array.from(event.target.files)); setContextNote(''); setImportError(''); setIsImportDialogOpen(true); event.currentTarget.value = ''; } }} />
            <Upload className="w-3.5 h-3.5" />
            <span>Dodaj pliki z dysku</span>
          </label>
          <button
            type="button"
            onClick={onScanDisk}
            disabled={isScanning}
            className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Skanowanie dysku...' : 'Odśwież stan z dysku'}</span>
          </button>
        </div>
      </div>

      {/* Case filter bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-500 font-medium">Filtruj sprawę:</span>
        <button
          type="button"
          onClick={() => setFilterCaseId('all')}
          className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
            filterCaseId === 'all'
              ? 'bg-slate-900 text-white font-semibold'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Wszystkie katalogi
        </button>
        {cases.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilterCaseId(c.id)}
            className={`px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap ${
              filterCaseId === c.id
                ? 'bg-slate-900 text-white font-semibold'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {c.id} ({c.folderName})
          </button>
        ))}
      </div>

      {/* Main Split: File Tree / List & Detail Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: List of files & disk structure (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Moje_sprawy/ ({filteredDocuments.length} dokumentów)
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                Lokalny system plików
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredDocuments.map((doc) => {
                const isSelected = selectedDocId === doc.id;
                const isMultiPage = versions.some((version) => version.documentId === doc.id && (version.pageCount || 0) > 1);

                return (
                  <div
                    key={doc.id}
                    onClick={() => { setSelectedDocId(doc.id); setIsContextEditing(false); setRelinkError(''); }}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-slate-100/80 border-l-4 border-slate-900' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <FileText className="w-4 h-4 text-slate-500 flex-shrink-0 mt-1" />
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {doc.originalFileName}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5 break-all">
                            {doc.diskRelativePath || `Moje_sprawy/Do_uporzadkowania/${doc.originalFileName}`}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {doc.caseIds.map((cid) => (
                              <span
                                key={cid}
                                className="text-[10px] uppercase font-bold text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded"
                              >
                                {cid}
                              </span>
                            ))}

                            <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                              {doc.fileSize} B
                            </span>

                            {doc.caseIds.length > 1 && (
                              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
                                Dokument powiązany z kilkoma sprawami
                              </span>
                            )}

                            {isMultiPage && (
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                Skan wielostronicowy
                              </span>
                            )}

                            {doc.isMissingOnDisk && (
                              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                                Brak pliku na dysku
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-[10px] font-mono text-slate-400">
                          {doc.originalSha256.substring(0, 10)}...
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredDocuments.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-500">
                  Brak dokumentów w wybranym katalogu.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Document Details and Local Preview (5 cols) */}
        <div className="lg:col-span-5">
          {selectedDoc ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 sticky top-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-slate-700" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Podgląd i integralność
                  </h3>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Hash oryginału zapisany</span>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Plik
                </span>
                <div className="text-xs font-bold text-slate-900 mt-0.5">
                  {selectedDoc.originalFileName}
                </div>
                <div className="text-[11px] font-mono text-slate-600 mt-1 break-all bg-slate-50 p-2 rounded-lg border border-slate-100">
                  {selectedDoc.diskRelativePath || 'Lokalizacja w skrzynce Do_uporzadkowania'}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Suma kontrolna (SHA-256 oryginału)
                </span>
                <div className="text-[11px] font-mono text-slate-700 mt-1 break-all bg-slate-50 p-2 rounded-lg border border-slate-100">
                  {selectedDoc.originalSha256}
                </div>
              </div>

              <OriginalDocumentPreview key={`${selectedDoc.id}-${previewRefresh}`} document={selectedDoc} onLoadOriginal={onLoadOriginal} />
              {onRelinkOriginal && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <p className="mb-2 text-slate-600">Brakuje oryginału albo plik został przeniesiony? Wskaż go ponownie. Zapis nastąpi wyłącznie po zgodności SHA-256 i rozmiaru.</p>
                <label className={`inline-flex cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 ${isRelinking ? 'opacity-50' : ''}`}>
                  <input type="file" className="sr-only" disabled={isRelinking} onChange={async (event) => {
                    const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (!file) return;
                    setIsRelinking(true); setRelinkError('');
                    try { await onRelinkOriginal(selectedDoc.id, file); setPreviewRefresh((value) => value + 1); }
                    catch (error) { setRelinkError(error instanceof Error ? error.message : 'Nie udało się powiązać pliku.'); }
                    finally { setIsRelinking(false); }
                  }} />
                  {isRelinking ? 'Weryfikowanie…' : 'Wskaż ponownie oryginał'}
                </label>
                {relinkError && <p role="alert" className="mt-2 text-rose-700">{relinkError}</p>}
              </div>}

              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-semibold text-indigo-950 uppercase tracking-wider">
                      Kontekst od Ciebie
                    </span>
                    {selectedDoc.contextNote ? (
                      <p className="mt-1 text-xs leading-relaxed text-indigo-950 whitespace-pre-wrap">{selectedDoc.contextNote}</p>
                    ) : (
                      <p className="mt-1 text-[11px] leading-relaxed text-indigo-800">
                        Dodaj krótką notatkę, która pomoże Ci rozpoznać dokument. To prywatna, niepotwierdzona informacja — nie jest dowodem.
                      </p>
                    )}
                  </div>
                  {onUpdateDocumentContext && !isContextEditing && (
                    <button type="button" onClick={() => { setContextDraft(selectedDoc.contextNote || ''); setIsContextEditing(true); }} className="shrink-0 text-[11px] font-semibold text-indigo-700 hover:text-indigo-950">
                      {selectedDoc.contextNote ? 'Edytuj' : 'Dodaj'}
                    </button>
                  )}
                </div>
                {isContextEditing && onUpdateDocumentContext && (
                  <div className="space-y-2">
                    <textarea
                      value={contextDraft}
                      onChange={(event) => setContextDraft(event.target.value)}
                      maxLength={2000}
                      rows={4}
                      aria-label="Kontekst dokumentu"
                      className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="Np. Otrzymane pocztą 4 marca; dotyczy odwołania od decyzji."
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-indigo-700">{contextDraft.length}/2000 znaków · zapis lokalny</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setIsContextEditing(false)} className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-indigo-50">Anuluj</button>
                        <button
                          type="button"
                          disabled={isSavingContext}
                          onClick={async () => {
                            setIsSavingContext(true);
                            try {
                              await onUpdateDocumentContext(selectedDoc.id, contextDraft);
                              setIsContextEditing(false);
                            } finally {
                              setIsSavingContext(false);
                            }
                          }}
                          className="rounded-lg bg-indigo-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                        >
                          {isSavingContext ? 'Zapisywanie…' : 'Zapisz kontekst'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Verification & OCR Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsSideBySideOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors shadow-sm"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Porównaj tekst / OCR</span>
                </button>

                {onRunLocalOcr && (
                  <button
                    type="button"
                    disabled={isOcrProcessing}
                    onClick={async () => {
                      setIsOcrProcessing(true);
                      try {
                        await onRunLocalOcr(selectedDoc.id);
                      } finally {
                        setIsOcrProcessing(false);
                      }
                    }}
                    className="inline-flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isOcrProcessing ? 'animate-spin' : ''}`} />
                    <span>{isOcrProcessing ? 'OCR w toku...' : 'Lokalny OCR'}</span>
                  </button>
                )}
              </div>

              {/* Multi-page Scan Splitting Action */}
              {(selectedDoc.mimeType === 'application/pdf' || /\.pdf$/i.test(selectedDoc.originalFileName)) && (activeVersion?.pageCount || 0) > 1 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-950">
                    <Split className="w-4 h-4 text-blue-700" />
                    <span>Wyodrębnij wybrane strony PDF</span>
                  </div>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Wybierz zakresy stron z {activeVersion?.pageCount}-stronicowego oryginału. Każdy zakres utworzy osobny PDF powiązany z dowodem źródłowym; oryginał pozostanie nienaruszony.
                  </p>
                  {splitRanges.map((range, index) => <div key={index} className="space-y-1 rounded-lg border border-blue-200 bg-white p-2">
                    <input aria-label={`Tytuł dokumentu ${index + 1}`} value={range.title} onChange={(event) => setSplitRanges((ranges) => ranges.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} maxLength={120} className="w-full rounded border border-blue-100 px-2 py-1 text-xs" />
                    <div className="flex items-center gap-2 text-[11px] text-blue-900">
                      <label>Od <input aria-label={`Pierwsza strona zakresu ${index + 1}`} type="number" min={1} max={activeVersion?.pageCount} value={range.from} onChange={(event) => setSplitRanges((ranges) => ranges.map((item, i) => i === index ? { ...item, from: Number(event.target.value) } : item))} className="w-14 rounded border border-blue-100 px-1 py-1" /></label>
                      <label>do <input aria-label={`Ostatnia strona zakresu ${index + 1}`} type="number" min={range.from} max={activeVersion?.pageCount} value={range.to} onChange={(event) => setSplitRanges((ranges) => ranges.map((item, i) => i === index ? { ...item, to: Number(event.target.value) } : item))} className="w-14 rounded border border-blue-100 px-1 py-1" /></label>
                      {splitRanges.length > 1 && <button type="button" onClick={() => setSplitRanges((ranges) => ranges.filter((_, i) => i !== index))} className="ml-auto font-semibold">Usuń zakres</button>}
                    </div>
                  </div>)}
                  <button type="button" onClick={() => setSplitRanges((ranges) => [...ranges, { from: 1, to: 1, title: `Dokument ${ranges.length + 1}` }])} className="text-[11px] font-semibold text-blue-800">+ Dodaj zakres</button>
                  <button
                    type="button"
                    disabled={isSplitting}
                    onClick={async () => {
                      if (splitRanges.some((range) => !range.title.trim() || !Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || range.from < 1 || range.to < range.from || range.to > (activeVersion?.pageCount || 0))) { setSplitError('Podaj tytuł i poprawny zakres stron dla każdego dokumentu.'); return; }
                      setIsSplitting(true); setSplitError('');
                      try { await onSplitMultiPageScan(selectedDoc.id, splitRanges); }
                      catch (error) { setSplitError(error instanceof Error ? error.message : 'Nie udało się wyodrębnić stron.'); }
                      finally { setIsSplitting(false); }
                    }}
                    className="w-full text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {isSplitting ? 'Wyodrębnianie…' : 'Utwórz powiązane kopie wybranych stron'}
                  </button>
                  {splitError && <p role="alert" className="text-xs text-rose-700">{splitError}</p>}
                </div>
              )}

              {/* Versions list */}
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Wersje i pochodne ({selectedVersions.length})
                </span>
                <div className="mt-2 space-y-1.5">
                  {selectedVersions.map((v) => (
                    <div
                      key={v.id}
                      className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-semibold text-slate-800">
                          v{v.versionNumber} ({v.kind})
                        </span>
                        <div className="text-[10px] text-slate-500">
                          {v.pageRange ? `${v.pageRange.end - v.pageRange.start + 1} str.` : v.pageCount ? `${v.pageCount} str.` : 'Liczba stron nieustalona'} | {v.createdAt.slice(0, 10)}
                        </div>
                      </div>
                      {v.id === selectedDoc.activeVersionId && (
                        <span className="text-[10px] font-bold text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded">
                          Aktywna
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Text content preview */}
              {activeVersion && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Odczytana treść (tekst lokalny)
                  </span>
                  <div className="mt-1.5 p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap border border-slate-800">
                    {activeVersion.textPayload}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500 shadow-sm">
              <FileCode className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="font-bold text-slate-800 mt-2">Wybierz dokument z listy</h3>
              <p className="mt-1">
                Wybierz dokument z lewego panelu, aby sprawdzić historię wersji, integralność i zweryfikować odczytaną treść.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Side-by-Side Modal */}
      {isSideBySideOpen && selectedDoc && activeVersion && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto border border-slate-300">
            <SideBySideViewer
              document={selectedDoc}
              originalVersion={selectedVersions[0] || activeVersion}
              activeVersion={activeVersion}
              extractedFields={extractedFields.filter((f) => f.documentId === selectedDoc.id)}
              onSaveCorrection={async (text, note) => {
                if (onSaveCorrection) {
                  await onSaveCorrection(selectedDoc.id, text, note);
                }
              }}
              onConfirmField={(fieldId, val) => {
                if (onConfirmField) {
                  onConfirmField(fieldId, val);
                }
              }}
              onLoadOriginal={onLoadOriginal}
            />
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsSideBySideOpen(false)}
                className="text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-xl transition-colors"
              >
                Zamknij podgląd weryfikacji
              </button>
            </div>
          </div>
        </div>
      )}

      {isImportDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h2 id="import-dialog-title" className="text-base font-bold text-slate-900">Dodaj dokument do sejfu</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">Pliki zostaną zapisane lokalnie i zaszyfrowane na tym urządzeniu. Możesz dodać własny opis, żeby później łatwiej ocenić znaczenie dokumentu.</p>
              </div>
              <button type="button" disabled={isImporting} onClick={() => setIsImportDialogOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40" aria-label="Zamknij okno dodawania"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-800">Wybrane pliki ({pendingFiles.length})</p>
              <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-[11px] text-slate-600">
                {pendingFiles.map((file) => <li key={`${file.name}-${file.size}-${file.lastModified}`} className="truncate">{file.name} · {file.size} B</li>)}
              </ul>
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-semibold text-slate-800">Kontekst od Ciebie <span className="font-normal text-slate-500">(opcjonalnie; wspólny dla wybranych plików)</span></span>
              <textarea
                value={contextNote}
                onChange={(event) => setContextNote(event.target.value)}
                maxLength={2000}
                rows={4}
                aria-describedby="import-context-help"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                placeholder="Np. Pismo otrzymane 4 marca; dotyczy decyzji o odmowie pozwolenia."
              />
            </label>
            <p id="import-context-help" className="mt-1.5 text-[11px] leading-relaxed text-slate-500">To Twoja notatka robocza, a nie ustalenie prawne ani treść dowodu. Nie trafia do OCR ani AI; przy włączonej synchronizacji jest objęta wyłącznie szyfrowanym manifestem.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={isImporting} onClick={() => setIsImportDialogOpen(false)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Anuluj</button>
              <button type="button" disabled={isImporting || !pendingFiles.length} onClick={async () => {
                setIsImporting(true); setImportError('');
                try { await onImportFiles(pendingFiles, contextNote.trim() || undefined); setPendingFiles([]); setContextNote(''); setIsImportDialogOpen(false); }
                catch (error) { setImportError(error instanceof Error ? error.message : 'Nie udało się zaimportować plików.'); }
                finally { setIsImporting(false); }
              }} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50">{isImporting ? 'Zapis i lokalny odczyt…' : 'Dodaj do sejfu'}</button>
            </div>
            {importError && <p role="alert" className="mt-3 text-xs text-rose-700">{importError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
