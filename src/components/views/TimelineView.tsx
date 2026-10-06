'use client';

import React, { useState } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Plus,
  HelpCircle,
} from 'lucide-react';
import { Case, CaseEvent, DatePrecision, EventType } from '../../domain/types';

interface TimelineViewProps {
  cases: Case[];
  activeCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  events: CaseEvent[];
  onAddEvent: (newEvent: Omit<CaseEvent, 'id'>) => void;
}

export function TimelineView({
  cases,
  activeCaseId,
  onSelectCase,
  events,
  onAddEvent,
}: TimelineViewProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('2026-09-18');
  const [eventType, setEventType] = useState<EventType>('citizen_action');
  const [datePrecision, setDatePrecision] = useState<DatePrecision>('exact');
  const [eventNotes, setEventNotes] = useState('');

  const currentCaseId = activeCaseId || cases[0]?.id;
  const filteredEvents = events
    .filter((e) => !currentCaseId || e.caseId === currentCaseId)
    .sort((a, b) => {
      if (a.date === 'unknown') return 1;
      if (b.date === 'unknown') return -1;
      return a.date.localeCompare(b.date);
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCaseId || !eventTitle) return;

    onAddEvent({
      caseId: currentCaseId,
      title: eventTitle,
      date: datePrecision === 'unknown' ? 'unknown' : eventDate,
      type: eventType,
      datePrecision,
      isConfirmed: true,
      notes: eventNotes || undefined,
    });

    setEventTitle('');
    setEventNotes('');
    setIsAddOpen(false);
  };

  const getPrecisionBadge = (precision: DatePrecision) => {
    switch (precision) {
      case 'exact':
        return (
          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Dokładna data</span>
          </span>
        );
      case 'uncertain':
        return (
          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
            <HelpCircle className="w-3 h-3 text-amber-600" />
            <span>Przybliżona data</span>
          </span>
        );
      case 'unknown':
        return (
          <span className="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>Brak potwierdzonej daty</span>
          </span>
        );
    }
  };

  const getEventTypeLabel = (type: EventType) => {
    switch (type) {
      case 'document_delivered':
        return 'Doręczenie pisma';
      case 'document_issued':
        return 'Wydanie aktu / pisma';
      case 'document_sent':
        return 'Wysłanie przesyłki';
      case 'citizen_action':
        return 'Działanie użytkownika';
      case 'deadline_calculated':
        return 'Koniec terminu procesowego';
      case 'payment_due':
        return 'Płatność / roszczenie';
      default:
        return 'Zdarzenie procesowe';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Oś czasu i chronologia
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Rzeczywisty przebieg zdarzeń z podziałem na daty pewne, przybliżone oraz nieznane.
          </p>
        </div>

        <div className="flex items-center gap-3">
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

          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Dodaj zdarzenie</span>
          </button>
        </div>
      </div>

      {/* Modal: Add event */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">
              Nowe zdarzenie w osi czasu
            </h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Tytuł zdarzenia
                </label>
                <input
                  type="text"
                  required
                  placeholder="np. Otrzymanie decyzji odmownej za zwrotnym poświadczeniem"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Precyzja daty
                  </label>
                  <select
                    value={datePrecision}
                    onChange={(e) => setDatePrecision(e.target.value as DatePrecision)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900"
                  >
                    <option value="exact">Dokładna (znana data)</option>
                    <option value="uncertain">Przybliżona</option>
                    <option value="unknown">Brak daty (nieznana)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Data zdarzenia
                  </label>
                  <input
                    type="date"
                    disabled={datePrecision === 'unknown'}
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900 disabled:opacity-40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Typ zdarzenia
                </label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as EventType)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900"
                >
                  <option value="document_delivered">Doręczenie pisma / decyzji</option>
                  <option value="document_issued">Wydanie pisma przez organ / firmę</option>
                  <option value="citizen_action">Działanie strony / zgłoszenie</option>
                  <option value="document_sent">Wysłanie pisma / przesyłki</option>
                  <option value="payment_due">Płatność lub wymagalność</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Notatka / szczegóły
                </label>
                <textarea
                  rows={2}
                  placeholder="np. Podpis złożony na żółtej zwrotce w obecności doręczyciela"
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="text-xs font-semibold text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-100"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="text-xs font-semibold bg-slate-900 text-white px-3.5 py-2 rounded-lg hover:bg-slate-800"
                >
                  Zapisz zdarzenie
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Timeline vertical list */}
      <div className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-6">
        {filteredEvents.map((evt) => (
          <div key={evt.id} className="relative group">
            {/* Timeline node marker */}
            <div
              className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 bg-white ${
                evt.datePrecision === 'unknown'
                  ? 'border-rose-500 ring-4 ring-rose-100'
                  : evt.datePrecision === 'uncertain'
                  ? 'border-amber-500 ring-4 ring-amber-100'
                  : 'border-slate-900 ring-4 ring-slate-100'
              }`}
            />

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:border-slate-300 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-900">
                    {evt.date === 'unknown' ? 'Brak ustalonej daty' : evt.date}
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-xs text-slate-600 font-medium">
                    {getEventTypeLabel(evt.type)}
                  </span>
                </div>
                {getPrecisionBadge(evt.datePrecision)}
              </div>

              <h2 className="text-sm font-bold text-slate-900 mt-2">
                {evt.title}
              </h2>

              {evt.notes && (
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {evt.notes}
                </p>
              )}

              {evt.proofDocumentId && (
                <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Dowód powiązany: {evt.proofDocumentId}</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {filteredEvents.length === 0 && (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
            <Clock className="w-8 h-8 text-slate-400 mx-auto" />
            <h2 className="text-sm font-bold text-slate-800 mt-2">
              Brak zarejestrowanych zdarzeń
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Dodaj zdarzenie ręcznie lub wczytaj przykładowe dane w zakładce &quot;Dziś&quot;.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
