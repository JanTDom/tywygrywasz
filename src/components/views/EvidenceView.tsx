'use client';

import React from 'react';
import {
  Scale,
  FileCheck,
  AlertTriangle,
  HelpCircle,
  ShieldCheck,
  CheckCircle2,
  Users,
  Search,
} from 'lucide-react';
import { Case, LegalAnalysis, DocumentRecord } from '../../domain/types';

interface EvidenceViewProps {
  cases: Case[];
  activeCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  analysis: LegalAnalysis | null;
  documents: DocumentRecord[];
}

export function EvidenceView({
  cases,
  activeCaseId,
  onSelectCase,
  analysis,
}: EvidenceViewProps) {
  const currentCaseId = activeCaseId || cases[0]?.id;

  const getConfidenceBadge = (confidence: 'proven' | 'probable' | 'disputed' | 'unproven') => {
    switch (confidence) {
      case 'proven':
        return (
          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Udowodniony wprost</span>
          </span>
        );
      case 'probable':
        return (
          <span className="text-[10px] font-bold text-blue-800 bg-blue-100 border border-blue-300 px-2 py-0.5 rounded-full flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-blue-600" />
            <span>Prawdopodobny</span>
          </span>
        );
      case 'disputed':
        return (
          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>Sporny / sprzeczny</span>
          </span>
        );
      case 'unproven':
        return (
          <span className="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full flex items-center gap-1">
            <HelpCircle className="w-3 h-3 text-rose-600" />
            <span>Nieudowodniony</span>
          </span>
        );
    }
  };

  const getPartyRoleLabel = (role: LegalAnalysis['parties'][number]['role']) => {
    switch (role) {
      case 'citizen': return 'Użytkownik';
      case 'authority': return 'Organ / instytucja';
      case 'witness': return 'Świadek';
      case 'expert': return 'Ekspert';
      default: return 'Druga strona';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Dowody, stanowiska i sprzeczności
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Rzeczywista matryca dowodowa: powiązanie faktów z dokumentami, cytatami i stronami.
          </p>
        </div>

        <select
          value={currentCaseId || ''}
          onChange={(e) => onSelectCase(e.target.value)}
          className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900"
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} - {c.title}
            </option>
          ))}
        </select>
      </div>

      {analysis ? (
        <div className="space-y-6">
          {/* Section 1: Strony i Stanowiska */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-700" />
              <span>Strony postępowania i ich stanowiska</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.parties.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{p.name}</span>
                    <span className="text-[10px] uppercase font-bold text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded">
                      {getPartyRoleLabel(p.role)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <strong className="text-slate-800">Stanowisko: </strong>
                    {p.stance}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Żądania */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Scale className="w-4 h-4 text-slate-700" />
              <span>Żądania zgłoszone w sprawie</span>
            </h2>

            <div className="space-y-2">
              {analysis.demands.map((d) => (
                <div
                  key={d.id}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{d.title}</div>
                    <div className="text-slate-600 mt-0.5">{d.description}</div>
                    {d.legalBasis && (
                      <div className="text-[11px] text-slate-500 font-mono mt-1">
                        Podstawa prawna: {d.legalBasis}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-bold uppercase text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex-shrink-0">
                    W toku
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Matryca Dowodowa i Sprzeczności */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-slate-700" />
              <span>Zestawienie dowodów i sprzeczności</span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="pb-2 pr-4">Fakt do wykazania</th>
                    <th className="pb-2 px-3">Dowód wspierający (cytat)</th>
                    <th className="pb-2 px-3">Dowód przeciwny / zarzut</th>
                    <th className="pb-2 pl-3 text-right">Status dowodowy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analysis.evidenceMatrix.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-3 pr-4 font-semibold text-slate-900 align-top max-w-[200px]">
                        {item.fact}
                      </td>

                      <td className="py-3 px-3 text-slate-700 align-top max-w-[260px]">
                        {item.supportedBySnippet ? (
                          <div className="p-2 rounded bg-emerald-50 border border-emerald-100 font-mono text-[11px] leading-snug">
                            &quot;{item.supportedBySnippet}&quot;
                            {item.supportedByDocId && (
                              <div className="text-[10px] text-emerald-800 font-sans mt-1">
                                Plik: {item.supportedByDocId}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Brak dokumentu wspierającego</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-slate-700 align-top max-w-[260px]">
                        {item.contradictedBySnippet ? (
                          <div className="p-2 rounded bg-amber-50 border border-amber-100 font-mono text-[11px] leading-snug">
                            &quot;{item.contradictedBySnippet}&quot;
                            {item.contradictedByDocId && (
                              <div className="text-[10px] text-amber-800 font-sans mt-1">
                                Plik: {item.contradictedByDocId}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Brak sprzeczności</span>
                        )}
                      </td>

                      <td className="py-3 pl-3 text-right align-top whitespace-nowrap">
                        {getConfidenceBadge(item.confidence)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Brakujące informacje i dokumenty do poszukania */}
          {analysis.missingInformation.length > 0 && (
            <div className="bg-amber-50/60 rounded-2xl border border-amber-200 p-5 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                <Search className="w-4 h-4 text-amber-700" />
                <span>Dokumenty, których należy poszukać (brakujące informacje)</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysis.missingInformation.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-white border border-amber-200/80 text-xs space-y-1.5"
                  >
                    <div className="font-bold text-slate-900">{item.question}</div>
                    <div className="text-slate-600">
                      <strong className="text-slate-700">Wymagany dokument: </strong>
                      {item.neededDocType}
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      <strong className="text-slate-700">Dlaczego istotne: </strong>
                      {item.whyImportant}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Scale className="w-8 h-8 text-slate-400 mx-auto" />
          <h2 className="text-sm font-bold text-slate-800 mt-2">
            Brak analizy dowodowej dla wybranej sprawy
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Wczytaj sprawę syntetyczną w zakładce &quot;Dziś&quot; lub zaimportuj dokumenty z dysku.
          </p>
        </div>
      )}
    </div>
  );
}
