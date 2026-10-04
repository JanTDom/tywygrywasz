'use client';

import React, { useState } from 'react';
import {
  Inbox,
  Sparkles,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  HelpCircle,
  FolderOpen,
  FileText,
  AlertCircle,
  Check,
} from 'lucide-react';
import { DocumentRecord, InboxProposal, Case, CaseSubfolder } from '../../domain/types';

interface InboxViewProps {
  inboxDocuments: DocumentRecord[];
  proposals: Record<string, InboxProposal>;
  cases: Case[];
  onApproveProposal: (docId: string, targetCaseId: string, targetSubfolder: CaseSubfolder) => Promise<void>;
  onManualMove: (docId: string, targetCaseId: string, targetSubfolder: CaseSubfolder) => Promise<void>;
  undoStackLength: number;
  onUndoLastMove: () => Promise<void>;
  lastMoveDescription: string | null;
}

export function InboxView({
  inboxDocuments,
  proposals,
  cases,
  onApproveProposal,
  onManualMove,
  undoStackLength,
  onUndoLastMove,
  lastMoveDescription,
}: InboxViewProps) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [customCaseId, setCustomCaseId] = useState<string>('');
  const [customSubfolder, setCustomSubfolder] = useState<CaseSubfolder>('01_Otrzymane');
  const [isProcessing, setIsProcessing] = useState(false);

  const subfolderOptions: { id: CaseSubfolder; label: string }[] = [
    { id: '00_Plan_i_opis', label: '00_Plan_i_opis' },
    { id: '01_Otrzymane', label: '01_Otrzymane (pisma z urzędu/firmy)' },
    { id: '02_Wyslane', label: '02_Wyslane (pisma użytkownika)' },
    { id: '03_Dowody', label: '03_Dowody (faktury, zdjęcia, wypisy)' },
    { id: '04_Potwierdzenia', label: '04_Potwierdzenia (zwrotki pocztowe, UPO)' },
    { id: '05_Projekty_pism', label: '05_Projekty_pism (szkice i formularze)' },
    { id: '06_Prawo_i_analizy', label: '06_Prawo_i_analizy (orzeczenia, przepisy)' },
    { id: '07_Wynik_sprawy', label: '07_Wynik_sprawy (decyzja ostateczna)' },
  ];

  const handleApprove = async (docId: string, targetCaseId: string, targetSubfolder: CaseSubfolder) => {
    setIsProcessing(true);
    try {
      await onApproveProposal(docId, targetCaseId, targetSubfolder);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManual = async (docId: string) => {
    if (!customCaseId) return;
    setIsProcessing(true);
    try {
      await onManualMove(docId, customCaseId, customSubfolder);
      setSelectedDocId(null);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Skrzynka: Do uporządkowania
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Nowe pliki trafiają do folderu <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-xs text-slate-800">Moje_sprawy/Do_uporzadkowania/</code>.
            Algorytm analizuje treść dokumentu i proponuje przyporządkowanie bez zgadywania.
          </p>
        </div>

        {undoStackLength > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onUndoLastMove}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
              <span>Cofnij ostatnie przeniesienie ({undoStackLength})</span>
            </button>
          </div>
        )}
      </div>

      {lastMoveDescription && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{lastMoveDescription}</span>
        </div>
      )}

      {/* Main Inbox List */}
      <div className="space-y-4">
        {inboxDocuments.map((doc) => {
          const proposal = proposals[doc.id];
          const confidencePercent = proposal ? Math.round(proposal.confidence * 100) : 40;
          const isSelected = selectedDocId === doc.id;

          const suggestedCase = cases.find((c) => c.id === proposal?.proposedCaseId);

          return (
            <div
              key={doc.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 hover:border-slate-300 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      {doc.originalFileName}
                    </h2>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      {doc.fileSize} B | SHA-256: {doc.originalSha256.substring(0, 16)}...
                    </div>
                  </div>
                </div>

                {proposal && (
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className="text-xs text-slate-500 font-medium">Pewność:</span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        confidencePercent >= 80
                          ? 'bg-emerald-100 text-emerald-800'
                          : confidencePercent >= 60
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {confidencePercent}%
                    </span>
                  </div>
                )}
              </div>

              {/* Proposal Box */}
              {proposal && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Sparkles className="w-3.5 h-3.5 text-slate-700" />
                    <span>Proponowane przyporządkowanie:</span>
                    <span className="bg-slate-900 text-white px-2 py-0.5 rounded text-[11px]">
                      {proposal.proposedCaseId} ({suggestedCase?.folderName || proposal.proposedCaseId})
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                    <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded text-[11px] font-mono">
                      {proposal.proposedSubfolder}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed">
                    <strong className="text-slate-900">Uzasadnienie: </strong>
                    {proposal.rationale}
                  </p>

                  {/* Clarification question if present */}
                  {proposal.clarificationQuestion && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-950">
                      <HelpCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-semibold">Pytanie weryfikacyjne: </strong>
                        {proposal.clarificationQuestion}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Actions row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  {proposal && proposal.proposedCaseId && (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => {
                        if (proposal.proposedCaseId) {
                          handleApprove(doc.id, proposal.proposedCaseId, proposal.proposedSubfolder);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Zatwierdź propozycję i przenieś na dysku</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDocId(isSelected ? null : doc.id);
                      setCustomCaseId(proposal?.proposedCaseId || cases[0]?.id || '');
                      setCustomSubfolder(proposal?.proposedSubfolder || '01_Otrzymane');
                    }}
                    className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
                  >
                    <span>{isSelected ? 'Ukryj wybór ręczny' : 'Wskaż inny folder lub sprawę'}</span>
                  </button>
                </div>
              </div>

              {/* Manual selection expanded panel */}
              {isSelected && (
                <div className="mt-4 p-4 rounded-xl bg-slate-100 border border-slate-200 space-y-3">
                  <div className="text-xs font-bold text-slate-900">
                    Ręczne wskazanie lokalizacji docelowej:
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Wybierz sprawę docelową
                      </label>
                      <select
                        value={customCaseId}
                        onChange={(e) => setCustomCaseId(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900"
                      >
                        {cases.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.id} - {c.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Wybierz podfolder
                      </label>
                      <select
                        value={customSubfolder}
                        onChange={(e) => setCustomSubfolder(e.target.value as CaseSubfolder)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900"
                      >
                        {subfolderOptions.map((sf) => (
                          <option key={sf.id} value={sf.id}>
                            {sf.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isProcessing || !customCaseId}
                      onClick={() => handleManual(doc.id)}
                      className="text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Przenieś fizycznie do wybranego folderu
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {inboxDocuments.length === 0 && (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <h2 className="text-base font-bold text-slate-900 mt-3">
              Wszystkie dokumenty są uporządkowane
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
              Folder <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-800">Moje_sprawy/Do_uporzadkowania/</code> jest pusty.
              Gdy dodasz nowe pliki do katalogu roboczego, pojawią się tutaj do akceptacji.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
