'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FilePlus2,
  FolderPlus,
  Inbox,
  LockKeyhole,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Case, ProceduralDeadline } from '../../domain/types';
import { ViewType } from '../Navigation';

interface TodayViewProps {
  cases: Case[];
  deadlines: ProceduralDeadline[];
  inboxCount: number;
  onNavigate: (view: ViewType, caseId?: string) => void;
  onConfirmDeliveryDate: (caseId: string, date: string) => void;
  onLoadSyntheticDemo: () => void;
  isLoadingDemo: boolean;
}

const formatDate = (date: Date) => new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);

export function TodayView({ cases, deadlines, inboxCount, onNavigate, onConfirmDeliveryDate, onLoadSyntheticDemo, isLoadingDemo }: TodayViewProps) {
  const [selectedCaseForDate, setSelectedCaseForDate] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [showDemo, setShowDemo] = useState(false);
  const today = useMemo(() => formatDate(new Date()), []);
  const activeDeadlines = deadlines.filter((d) => d.status === 'active' || d.status === 'unknown');
  const unknownDateDeadlines = deadlines.filter((d) => d.status === 'unknown' || d.startDate === 'unknown' || d.calculatedEndDate === 'unknown');
  const primaryDeadline = unknownDateDeadlines[0] || activeDeadlines[0];
  const primaryCase = primaryDeadline ? cases.find((c) => c.id === primaryDeadline.caseId) : cases[0];

  const confirmDate = () => {
    if (!dateInput || !primaryDeadline) return;
    onConfirmDeliveryDate(selectedCaseForDate || primaryDeadline.caseId, dateInput);
  };

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow">CENTRUM SPRAW</div>
          <h1 className="page-title">Dziś w Twoich sprawach</h1>
          <p className="page-lede">Najważniejsze informacje, dokumenty i następny krok w jednym miejscu.</p>
        </div>
        <div className="today-date">{today}</div>
      </div>

      <section className="surface hero-grid dashboard-next" aria-labelledby="next-step-title">
        <div className="dashboard-next-icon" aria-hidden="true"><Sparkles size={25} /></div>
        <div className="dashboard-next-copy">
          <div className="eyebrow eyebrow-teal">NASTĘPNY KROK</div>
          <h2 id="next-step-title">{primaryDeadline ? 'Potwierdź datę doręczenia' : cases.length ? 'Dodaj dokument do swojej sprawy' : 'Załóż swoją pierwszą sprawę'}</h2>
          <p>
            {primaryDeadline
              ? 'Bez potwierdzonej daty nie wyliczamy terminu domysłem. Sprawdź zwrotkę lub potwierdzenie ePUAP.'
              : cases.length
                ? 'Zacznij od dokumentu z dysku. Pokażemy Ci, co odczytaliśmy i gdzie go przypisać.'
                : 'Opisz własnymi słowami, co chcesz osiągnąć. Nazwa procedury nie jest potrzebna.'}
          </p>
          {primaryCase && <div className="dashboard-next-case"><span>{primaryCase.title}</span><span aria-hidden="true">·</span><span>{primaryCase.authorityOrOpponentName}</span></div>}
        </div>
        <div className="dashboard-next-action">
          {primaryDeadline ? (
            <button type="button" className="button-primary" onClick={() => document.getElementById('delivery-date')?.focus()}>
              Potwierdź datę <ArrowRight size={17} />
            </button>
          ) : cases.length ? (
            <button type="button" className="button-primary" onClick={() => onNavigate('disk')}>
              Dodaj dokument <Upload size={17} />
            </button>
          ) : (
            <button type="button" className="button-primary" onClick={() => onNavigate('cases')}>
              Załóż sprawę <ArrowRight size={17} />
            </button>
          )}
          <button type="button" className="button-link" onClick={() => onNavigate(primaryDeadline ? 'timeline' : 'cases', primaryCase?.id)}>Zobacz szczegóły <ArrowUpRight size={15} /></button>
        </div>
      </section>

      {unknownDateDeadlines.length > 0 && (
        <section className="notice-card notice-amber" aria-labelledby="delivery-title">
          <div className="notice-icon"><AlertTriangle size={19} /></div>
          <div className="notice-copy">
            <h2 id="delivery-title">Nie mamy potwierdzonej daty odbioru</h2>
            <p>Sprawdź żółtą zwrotkę, kopertę ze stemplem lub historię ePUAP. Data utworzenia pliku nie jest datą doręczenia.</p>
            <div className="delivery-controls">
              <select aria-label="Wybierz sprawę" value={selectedCaseForDate || primaryDeadline?.caseId || ''} onChange={(e) => setSelectedCaseForDate(e.target.value)}>
                {unknownDateDeadlines.map((d) => <option key={d.id} value={d.caseId}>{d.actionRequired}</option>)}
              </select>
              <input id="delivery-date" aria-label="Potwierdzona data doręczenia" type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
              <button type="button" className="button-amber" onClick={confirmDate} disabled={!dateInput}>Zapisz datę</button>
            </div>
          </div>
          <button type="button" className="notice-help" aria-label="Dlaczego potrzebujemy daty"><CircleHelp size={17} /></button>
        </section>
      )}

      <section className="dashboard-metrics" aria-label="Stan Twojego sejfu">
        <button type="button" className="surface surface-hover metric-card" onClick={() => onNavigate('cases')}>
          <span className="metric-icon metric-icon-teal"><FolderPlus size={19} /></span>
          <span className="metric-copy"><span className="metric-label">Aktywne sprawy</span><strong>{cases.length}</strong><span className="metric-sub">{cases.length ? 'Sprawy w toku' : 'Dodaj pierwszą sprawę'}</span></span>
          <ChevronRight className="metric-arrow" size={18} />
        </button>
        <button type="button" className="surface surface-hover metric-card" onClick={() => onNavigate('inbox')}>
          <span className="metric-icon metric-icon-blue"><Inbox size={19} /></span>
          <span className="metric-copy"><span className="metric-label">Nowe dokumenty</span><strong>{inboxCount}</strong><span className="metric-sub">{inboxCount ? 'Czekają na uporządkowanie' : 'Wszystko uporządkowane'}</span></span>
          <ChevronRight className="metric-arrow" size={18} />
        </button>
        <button type="button" className="surface surface-hover metric-card" onClick={() => onNavigate('privacy')}>
          <span className="metric-icon metric-icon-mint"><ShieldCheck size={19} /></span>
          <span className="metric-copy"><span className="metric-label">Sejf lokalny</span><strong className="metric-status"><span className="status-check"><CheckCircle2 size={15} /></span> Aktywny</strong><span className="metric-sub">Dane zostają na tym urządzeniu</span></span>
          <ChevronRight className="metric-arrow" size={18} />
        </button>
      </section>

      <div className="dashboard-grid">
        <section className="surface panel-card" aria-labelledby="deadline-title">
          <div className="panel-head"><div><div className="panel-kicker"><CalendarClock size={16} /> TERMINY</div><h2 id="deadline-title">Pilne i ważne</h2></div><button type="button" className="panel-action" onClick={() => onNavigate('timeline')}>Zobacz oś czasu <ArrowUpRight size={15} /></button></div>
          <div className="deadline-list">
            {activeDeadlines.length ? activeDeadlines.slice(0, 3).map((d) => (
              <button key={d.id} type="button" className="deadline-row" onClick={() => onNavigate('timeline', d.caseId)}>
                <span className={`deadline-date ${d.status === 'unknown' ? 'deadline-date-amber' : ''}`}>{d.calculatedEndDate && d.calculatedEndDate !== 'unknown' ? d.calculatedEndDate.slice(8, 10) : '—'}<small>{d.calculatedEndDate && d.calculatedEndDate !== 'unknown' ? d.calculatedEndDate.slice(5, 7) : 'brak daty'}</small></span>
                <span className="deadline-copy"><strong>{d.actionRequired}</strong><span>{d.status === 'unknown' ? 'Wymaga potwierdzenia daty odbioru' : 'Termin wyliczony według zapisanej reguły'}</span></span><ChevronRight size={16} />
              </button>
            )) : <div className="empty-panel"><CheckCircle2 size={20} /><span>Brak aktywnych terminów. Możesz spokojnie uporządkować dokumenty.</span></div>}
          </div>
        </section>

        <section className="surface panel-card" aria-labelledby="inbox-title">
          <div className="panel-head"><div><div className="panel-kicker"><Inbox size={16} /> DOKUMENTY</div><h2 id="inbox-title">Do uporządkowania</h2></div><button type="button" className="panel-action" onClick={() => onNavigate('inbox')}>Otwórz listę <ArrowUpRight size={15} /></button></div>
          <div className="document-preview">
            {inboxCount ? <>
              <div className="document-preview-row"><span className="document-file-icon"><FilePlus2 size={17} /></span><span><strong>Nowe dokumenty z dysku</strong><small>{inboxCount} {inboxCount === 1 ? 'plik czeka' : 'pliki czekają'} na przypisanie do sprawy</small></span><span className="document-dot" /></div>
              <div className="document-preview-help"><LockKeyhole size={15} /> Nazwa pliku zostaje lokalnie. Najpierw wybierzesz, co z nim zrobić.</div>
            </> : <div className="empty-panel"><CheckCircle2 size={20} /><span>Nie ma nowych dokumentów. Dodaj plik z dysku, gdy będziesz gotowa.</span></div>}
          </div>
        </section>
      </div>

      <section className="surface progress-card" aria-labelledby="progress-title">
        <div className="panel-head"><div><div className="panel-kicker"><Sparkles size={16} /> POSTĘP</div><h2 id="progress-title">Od dokumentu do działania</h2></div><button type="button" className="panel-action" onClick={() => onNavigate('plan')}>Plan działania <ArrowUpRight size={15} /></button></div>
        <div className="progress-rail"><div className="progress-line"><span style={{ width: cases.length ? '58%' : '12%' }} /></div>{[['1', 'Dodaj dokument', cases.length > 0], ['2', 'Sprawdź odczyt', cases.length > 0 && inboxCount === 0], ['3', 'Wybierz działanie', false], ['4', 'Przygotuj pismo', false], ['5', 'Złóż samodzielnie', false]].map(([number, label, done]) => <div className={`progress-step ${done ? 'progress-step-done' : ''}`} key={number as string}><span>{done ? <CheckCircle2 size={17} /> : number}</span><strong>{label}</strong></div>)}</div>
      </section>

      <section className="dashboard-bottom">
        <div className="quick-actions"><div className="panel-kicker"><Plus size={16} /> SKRÓTY</div><h2>Co chcesz zrobić teraz?</h2><div className="quick-action-list"><button type="button" onClick={() => onNavigate('cases')}><FolderPlus size={18} /><span>Założyć nową sprawę</span><ArrowRight size={15} /></button><button type="button" onClick={() => onNavigate('disk')}><Upload size={18} /><span>Dodać dokument z dysku</span><ArrowRight size={15} /></button><button type="button" onClick={() => onNavigate('letters')}><FilePlus2 size={18} /><span>Przygotować pismo</span><ArrowRight size={15} /></button></div></div>
        <div className="demo-card"><div className="panel-kicker"><Sparkles size={16} /> PIERWSZY RAZ?</div><h2>Zobacz, jak działa TyWygrywasz.pl</h2><p>Możesz wczytać jawnie oznaczone dane syntetyczne i przejść cały przebieg bez używania własnych dokumentów.</p>{showDemo ? <button type="button" className="button-secondary" onClick={onLoadSyntheticDemo} disabled={isLoadingDemo}><Play size={15} /> {isLoadingDemo ? 'Wczytuję…' : 'Wczytaj przykład'}</button> : <button type="button" className="button-link" onClick={() => setShowDemo(true)}>Pokaż opcję demonstracyjną <ArrowRight size={15} /></button>}</div>
      </section>
    </div>
  );
}
