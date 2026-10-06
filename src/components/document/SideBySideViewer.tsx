'use client';

import React, { useEffect, useState } from 'react';
import {
  FileText,
  Eye,
  Edit3,
  Save,
  Check,
  Sparkles,
} from 'lucide-react';
import { DocumentRecord, DocumentVersion, ExtractedField } from '../../domain/types';
import { OriginalDocumentPreview } from './OriginalDocumentPreview';

interface SideBySideViewerProps {
  document: DocumentRecord;
  originalVersion: DocumentVersion;
  activeVersion: DocumentVersion;
  extractedFields: ExtractedField[];
  onSaveCorrection: (correctedText: string, note: string) => Promise<void>;
  onConfirmField: (fieldId: string, confirmedValue: string) => void;
  onLoadOriginal?: (documentId: string) => Promise<Uint8Array | null>;
}

export function SideBySideViewer({
  document,
  originalVersion,
  activeVersion,
  extractedFields,
  onSaveCorrection,
  onConfirmField,
  onLoadOriginal,
}: SideBySideViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [correctedText, setCorrectedText] = useState(activeVersion.textPayload || '');
  const [correctionNote, setCorrectionNote] = useState('Korekta literówek i formatowania OCR');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  useEffect(() => { setCorrectedText(activeVersion.textPayload || ''); }, [activeVersion.id, activeVersion.textPayload]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveCorrection(correctedText, correctionNote);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Top Bar */}
      <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <Eye className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">
              Weryfikacja: Oryginał obok odczytanego tekstu (OCR)
            </h2>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              {document.originalFileName} | SHA-256 oryginału: {document.originalSha256.substring(0, 16)}...
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {!isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-slate-300" />
              <span>Popraw tekst OCR</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-xs font-semibold text-slate-400 hover:text-white px-2.5 py-1.5 transition-colors"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Zapisywanie...' : 'Zapisz nową wersję'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Side-by-Side Comparison Container */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 min-h-[420px]">
        {/* Left Column: Immutable Original File Content */}
        <div className="p-4 flex flex-col bg-slate-50/50">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Nienaruszalny oryginał (v{originalVersion.versionNumber})</span>
            </span>
            <span className="text-[10px] font-mono text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full font-semibold">
              Bajty lokalnego sejfu
            </span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[620px]">
            <OriginalDocumentPreview document={document} onLoadOriginal={onLoadOriginal} sourceField={extractedFields.find((field) => field.id === selectedFieldId)} />
          </div>
        </div>

        {/* Right Column: OCR Extracted / User Corrected View */}
        <div className="p-4 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Warstwa odczytana / OCR (v{activeVersion.versionNumber} - {activeVersion.kind})</span>
            </span>
            <span className="text-[10px] text-slate-500 font-medium">
              {activeVersion.toolOrAuthor}
            </span>
          </div>

          {isEditing ? (
            <div className="flex-1 flex flex-col space-y-2">
              <textarea
                aria-label="Edycja treści OCR"
                rows={14}
                value={correctedText}
                onChange={(e) => setCorrectedText(e.target.value)}
                className="w-full flex-1 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Uzasadnienie korekty (notatka weryfikacyjna)
                </label>
                <input
                  type="text"
                  value={correctionNote}
                  onChange={(e) => setCorrectionNote(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900"
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="bg-slate-900 text-slate-200 font-mono text-xs leading-relaxed p-4 rounded-xl border border-slate-800 overflow-y-auto max-h-[340px] whitespace-pre-wrap">
                {activeVersion.textPayload}
              </div>

              {/* Extracted Key Fields Table */}
              {extractedFields.length > 0 && (
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Odczytane dane kluczowe
                  </span>
                  <div className="space-y-1.5">
                    {extractedFields.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between text-xs p-2 bg-white rounded-lg border border-slate-200"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <span className="font-semibold text-slate-800">{f.label}: </span>
                          {f.status === 'confirmed' ? <span className="font-mono text-slate-900">{f.parsedValue || f.rawValue}</span> : <input aria-label={`Wartość pola: ${f.label}`} value={fieldValues[f.id] ?? f.parsedValue ?? f.rawValue} onChange={(event) => setFieldValues((values) => ({ ...values, [f.id]: event.target.value }))} placeholder="Brak danych — uzupełnij na podstawie dowodu" className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs" />}
                          {f.pageNumber > 0 ? <button type="button" onClick={() => setSelectedFieldId(f.id)} className="mt-1 text-[10px] font-semibold text-indigo-700">Pokaż źródło · strona {f.pageNumber}</button> : <p className="mt-1 text-[10px] text-slate-500">Brak zlokalizowanego źródła</p>}
                        </div>
                        {f.status === 'confirmed' ? (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Potwierdzone</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={!(fieldValues[f.id] ?? f.parsedValue ?? f.rawValue).trim()}
                            onClick={() => onConfirmField(f.id, (fieldValues[f.id] ?? f.parsedValue ?? f.rawValue).trim())}
                            className="text-[10px] font-semibold bg-slate-900 text-white px-2 py-0.5 rounded hover:bg-slate-800 disabled:opacity-40"
                          >
                            Zatwierdź
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
