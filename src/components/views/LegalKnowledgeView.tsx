'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  Scale,
  ShieldCheck,
  ExternalLink,
  AlertTriangle,
  FileText,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { LegalSource } from '../../domain/types';
import { OFFICIAL_LEGAL_SOURCES } from '../../domain/legal-knowledge';

interface LegalKnowledgeViewProps {
  sources?: LegalSource[];
}

export function LegalKnowledgeView({ sources }: LegalKnowledgeViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const officialSourcesList: LegalSource[] =
    sources && sources.length > 0 ? sources : Object.values(OFFICIAL_LEGAL_SOURCES);

  const filteredSources = officialSourcesList.filter((s) => {
    const matchesCategory =
      selectedCategory === 'all' ||
      (selectedCategory === 'statute' && s.sourceType === 'statute') ||
      (selectedCategory === 'ruling' && s.sourceType === 'court_ruling');

    const matchesSearch =
      !searchTerm ||
      s.actOrCaseId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.supportsClaim.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.quoteText.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Wersjonowane źródła i baza prawna
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Pamięć modelu nie jest źródłem prawa. Każda norma pochodzi z Dziennika Ustaw (ISAP/ELI) lub CBOSA.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-950 px-3 py-1.5 rounded-xl text-xs font-semibold self-start sm:self-auto">
          <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Stan prawny: Zweryfikowany oficjalnie</span>
        </div>
      </div>

      {/* Filter and search bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto text-xs">
          {[
            { id: 'all', label: 'Wszystkie źródła' },
            { id: 'statute', label: 'Ustawy (KPA, UPK, KC, UDIP)' },
            { id: 'ruling', label: 'Orzecznictwo (NSA, WSA, SN)' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap ${
                selectedCategory === cat.id
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Szukaj artykułu lub sygnatury..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 w-full sm:w-60"
          />
        </div>
      </div>

      {/* Sources list */}
      <div className="grid grid-cols-1 gap-4">
        {filteredSources.map((source) => (
          <div
            key={source.id}
            className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 hover:border-slate-300 transition-colors"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    {source.actOrCaseId}
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-xs text-slate-600 font-mono">
                    {source.articleOrPage}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Publikator: {source.publisher} (obowiązuje od: {source.effectiveFrom})
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>{source.verificationStatus === 'verified' ? 'Zweryfikowany' : source.verificationStatus}</span>
                </span>

                <a
                  href={source.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-slate-900 transition-colors p-1"
                  title="Otwórz oficjalny publikator ISAP / CBOSA"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Claim supported */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
              <strong className="text-slate-800">Znaczenie dla sprawy: </strong>
              <span className="text-slate-700">{source.supportsClaim}</span>
            </div>

            {/* Quote */}
            <div className="p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] leading-relaxed whitespace-pre-wrap border border-slate-800">
              {source.quoteText}
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
              <span>Wersja aktu: {source.versionId}</span>
              <span>SHA-256 normy: {source.contentHash.substring(0, 16)}...</span>
            </div>
          </div>
        ))}

        {filteredSources.length === 0 && (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
            <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
            <h2 className="text-sm font-bold text-slate-800 mt-2">
              Brak źródeł spełniających kryteria
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Zmień filtr kategorii lub wyczyść pole wyszukiwania.
            </p>
          </div>
        )}
      </div>

      {/* Legal Notice */}
      <div className="bg-slate-100 rounded-2xl p-5 border border-slate-200 text-xs text-slate-600 space-y-1.5 leading-relaxed">
        <h2 className="font-bold text-slate-800">
          Zastrzeżenie metodologiczne i jurysdykcyjne
        </h2>
        <p>
          Baza normatywna TyWygrywasz.pl bazuje na oficjalnych publikatorach Rzeczypospolitej Polskiej
          (Dziennik Ustaw, Monitor Polski, Centralna Baza Orzeczeń Sądów Administracyjnych). Żadna analiza wygenerowana
          przez model językowy nie zastępuje indywidualnej porady prawnej adwokata, radcy prawnego ani rzecznika konsumentów.
        </p>
      </div>
    </div>
  );
}
