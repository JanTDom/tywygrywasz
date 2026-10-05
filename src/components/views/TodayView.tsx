'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
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
  Download,
} from 'lucide-react';
import {
  buildActionSchedule,
  exportReminderCalendar,
  filterActionSchedule,
  scheduleCategoryLabel,
  ActionScheduleFilter,
} from '../../domain/action-schedule';
import { Case, ProceduralDeadline, getCaseInstitutions } from '../../domain/types';
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
  const [scheduleFilter, setScheduleFilter] = useState<ActionScheduleFilter>('all');
  const [scheduleCase, setScheduleCase] = useState('all');
  const today = useMemo(() => formatDate(new Date()), []);
  const schedule = useMemo(() => buildActionSchedule(cases, deadlines), [cases, deadlines]);
  const visibleSchedule = useMemo(() => filterActionSchedule(schedule, scheduleFilter, scheduleCase), [schedule, scheduleFilter, scheduleCase]);
  const primaryAction = visibleSchedule[0] || schedule[0];
  const primaryDeadline = primaryAction?.deadline;
  const primaryCase = primaryAction?.caseRecord || cases[0];
  const unknownDateDeadlines = schedule.filter((item) => item.needsDeliveryDate && item.deadline).map((item) => item.deadline as ProceduralDeadline);
  const activeDeadlines = schedule.filter((item) => item.deadline && item.category !== 'unknown').map((item) => item.deadline as ProceduralDeadline);

  const confirmDate = () => {
    if (!dateInput || !primaryDeadline) return;
    onConfirmDeliveryDate(selectedCaseForDate || primaryDeadline.caseId, dateInput);
  };

  const downloadCalendar = () => {
    const { content, count } = exportReminderCalendar(schedule);
    if (!count) return;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tywygrywasz-przypomnienia.ics';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-7">
      <section className="defense-rail" aria-labelledby="defense-rail-title">
        <div className="defense-rail-header">
          <div>
            <div className="defense-rail-kicker"><Sparkles size={14} /> KIEDY PRZYCHODZI PISMO Z URZĘDU</div>
            <h2 id="defense-rail-title">Nie odpowiadasz w ciemno. Widzisz kolejny ruch.</h2>
          </div>
          <div className="defense-rail-status"><span className="defense-rail-status-dot" /> PLAN SPRAWY AKTYWNY</div>
        </div>
        <div className="defense-rail-route" role="img" aria-label="Animacja procesu: urząd wysyła pismo, TyWygrywasz porządkuje fakty i instytucję, pilnuje terminu, a Ty wykonujesz kolejny ruch">
          <div className="defense-rail-line" aria-hidden="true" />
          <div className="defense-rail-beam" aria-hidden="true" />
          <div className="defense-rail-stop defense-rail-stop-alert">
            <span className="defense-rail-icon"><Building2 size={17} /></span>
            <span><strong>URZĄD WYSYŁA PISMO</strong><small>decyzja / wezwanie</small></span>
          </div>
          <div className="defense-rail-stop">
            <span className="defense-rail-icon"><FilePlus2 size={17} /></span>
            <span><strong>ODCZYTUJESZ FAKTY</strong><small>co naprawdę napisano</small></span>
          </div>
          <div className="defense-rail-stop">
            <span className="defense-rail-icon"><CalendarClock size={17} /></span>
            <span><strong>PILNUJESZ TERMINU</strong><small>ile masz czasu</small></span>
          </div>
          <div className="defense-rail-stop defense-rail-stop-action">
            <span className="defense-rail-icon"><CheckCircle2 size={17} /></span>
            <span><strong>WYKONUJESZ RUCH</strong><small>odpowiedź / odwołanie</small></span>
          </div>
        </div>
        <div className="defense-rail-foot"><span>TyWygrywasz</span> łączy dokumenty, wiele instytucji i terminy w jeden plan. Dane zostają lokalnie i są szyfrowane.</div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow">{cases.length ? 'CENTRUM SPRAW' : 'TYWYGRYWASZ · TWÓJ PLAN'}</div>
          <h1 className="page-title">{cases.length ? 'Dziś w Twoich sprawach' : 'Prowadź całą sprawę. Krok po kroku.'}</h1>
          <p className="page-lede">{cases.length ? 'Najważniejsze informacje, dokumenty i następny krok w jednym miejscu.' : 'Dokumenty, wiele instytucji i terminy w jednym spokojnym planie działania.'}</p>
        </div>
        <div className="today-date">{today}</div>
      </div>

      {!cases.length ? (
        <>
          <section className="photo-landing" aria-labelledby="photo-landing-title">
            <div className="photo-landing-copy">
              <div className="photo-landing-copy-mark"><ShieldCheck size={17} /> Dokumenty zostają na tym urządzeniu</div>
              <h2 id="photo-landing-title">Spokojny plan zaczyna się od dokumentów.</h2>
              <p>Połącz pisma, terminy i wiele instytucji. Zobacz, co już wiesz i jaki krok możesz wykonać teraz.</p>
              <div className="photo-landing-actions">
                <button type="button" className="button-primary" onClick={() => onNavigate('cases')}>Załóż pierwszą sprawę <ArrowRight size={17} /></button>
                <button type="button" className="button-link photo-landing-secondary" onClick={() => onNavigate('disk')}>Dodaj dokument <Upload size={16} /></button>
              </div>
              <div className="photo-landing-trust"><LockKeyhole size={15} /> Lokalny sejf działa od razu. To Ty decydujesz, co synchronizujesz.</div>
            </div>
            <figure className="photo-landing-media">
              <picture>
                <source media="(max-width: 640px)" srcSet="/images/sprawa-warszawa-640.webp" />
                <source media="(max-width: 1180px)" srcSet="/images/sprawa-warszawa-960.webp" />
                <img src="/images/sprawa-warszawa-1600.webp" srcSet="/images/sprawa-warszawa-640.webp 640w, /images/sprawa-warszawa-960.webp 960w, /images/sprawa-warszawa-1600.webp 1600w" sizes="(max-width: 1180px) 100vw, 58vw" width="1600" height="900" fetchPriority="high" alt="Trzy osoby wychodzą przed Urzędem m.st. Warszawy z dokumentami" />
              </picture>
              <figcaption>Wsparcie zaczyna się od uporządkowanych faktów.</figcaption>
            </figure>
          </section>

          <section className="photo-journey" aria-labelledby="photo-journey-title">
            <figure className="photo-journey-main">
              <picture>
                <source media="(max-width: 640px)" srcSet="/images/wspolny-krok-640.webp" />
                <img src="/images/wspolny-krok-960.webp" srcSet="/images/wspolny-krok-640.webp 640w, /images/wspolny-krok-960.webp 960w, /images/wspolny-krok-1600.webp 1600w" sizes="(max-width: 760px) 100vw, 52vw" width="1600" height="900" loading="lazy" alt="Para wspólnie czyta pismo przy laptopie" />
              </picture>
              <figcaption>Nie musisz porządkować wszystkiego naraz.</figcaption>
            </figure>
            <div className="photo-journey-copy">
              <div className="panel-kicker"><CheckCircle2 size={16} /> OD DOKUMENTU DO DZIAŁANIA</div>
              <h2 id="photo-journey-title">Kiedy wiesz, co masz, łatwiej zdecydować, co dalej.</h2>
              <p>TyWygrywasz.pl pomaga przejść od stosu dokumentów do jasnego planu: co już wiesz, czego brakuje i jaki krok możesz wykonać teraz.</p>
              <button type="button" className="button-secondary" onClick={() => { setShowDemo(true); window.setTimeout(() => document.getElementById('demo-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); }}><Play size={15} /> Zobacz przykład działania</button>
            </div>
          </section>

          <div className="photo-detail-strip" aria-label="Porządkowanie dokumentów">
            <figure>
              <picture>
                <source media="(max-width: 640px)" srcSet="/images/porzadek-dokumenty-640.webp" />
                <img src="/images/porzadek-dokumenty-640.webp" srcSet="/images/porzadek-dokumenty-640.webp 640w, /images/porzadek-dokumenty-960.webp 960w" sizes="(max-width: 760px) 100vw, 34vw" width="960" height="540" loading="lazy" alt="Osoba porządkuje decyzję i dokumenty przy biurku" />
              </picture>
              <figcaption>Odczytaj i uporządkuj</figcaption>
            </figure>
            <figure>
              <picture>
                <source media="(max-width: 640px)" srcSet="/images/spokojny-plan-640.webp" />
                <img src="/images/spokojny-plan-640.webp" srcSet="/images/spokojny-plan-640.webp 640w, /images/spokojny-plan-960.webp 960w" sizes="(max-width: 760px) 100vw, 34vw" width="960" height="540" loading="lazy" alt="Osoba pracuje wieczorem nad dokumentami" />
              </picture>
              <figcaption>Zachowaj swój rytm</figcaption>
            </figure>
          </div>
        </>
      ) : (
      <section className="surface hero-grid dashboard-next" aria-labelledby="next-step-title">
        <div className="dashboard-next-icon" aria-hidden="true"><Sparkles size={25} /></div>
        <div className="dashboard-next-copy">
          <div className="eyebrow eyebrow-teal">NASTĘPNY KROK</div>
          <h2 id="next-step-title">{primaryAction ? primaryAction.title : cases.length ? 'Dodaj dokument do swojej sprawy' : 'Załóż swoją pierwszą sprawę'}</h2>
          <p>
            {primaryAction
              ? primaryAction.guidance
              : cases.length
                ? 'Zacznij od dokumentu z dysku. Pokażemy Ci, co odczytaliśmy i gdzie go przypisać.'
                : 'Opisz własnymi słowami, co chcesz osiągnąć. Nazwa procedury nie jest potrzebna.'}
          </p>
          {primaryCase && <div className="dashboard-next-case"><span>{primaryCase.title}</span><span aria-hidden="true">·</span><span>{getCaseInstitutions(primaryCase).map((institution) => institution.name).join(' · ')}</span></div>}
        </div>
        <div className="dashboard-next-action">
          {primaryAction?.needsDeliveryDate ? (
            <button type="button" className="button-primary" onClick={() => document.getElementById('delivery-date')?.focus()}>
              Potwierdź datę <ArrowRight size={17} />
            </button>
          ) : primaryAction ? (
            <button type="button" className="button-primary" onClick={() => onNavigate(primaryAction.destination, primaryCase?.id)}>
              {primaryAction.buttonLabel} <ArrowRight size={17} />
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
          <button type="button" className="button-link" onClick={() => onNavigate(primaryAction ? primaryAction.destination : 'cases', primaryCase?.id)}>Zobacz szczegóły <ArrowUpRight size={15} /></button>
        </div>
      </section>
      )}

      <section className="value-bridge" aria-labelledby="value-bridge-title">
        <div className="value-bridge-head">
          <div>
            <div className="panel-kicker"><Sparkles size={16} /> DLACZEGO TYWYGRYWASZ?</div>
            <h2 id="value-bridge-title">Czat AI odpowiada. TyWygrywasz prowadzi całą sprawę.</h2>
            <p>Ogólny czat daje pojedynczą odpowiedź. TyWygrywasz pamięta całą sprawę: dokumenty, terminy, wersje pism i wszystkie instytucje, które biorą w niej udział.</p>
          </div>
          <div className="value-bridge-badge"><ShieldCheck size={16} /> Dane domyślnie zostają na urządzeniu</div>
        </div>

        <div className="value-bridge-grid">
          <article className="value-bridge-card">
            <span className="value-bridge-icon value-bridge-icon-teal"><FolderPlus size={18} /></span>
            <h3>Jeden obraz sprawy</h3>
            <p>Łączysz pisma, dowody, daty i instytucje w jednym miejscu. Nic nie ginie w kolejnych rozmowach.</p>
          </article>
          <article className="value-bridge-card">
            <span className="value-bridge-icon value-bridge-icon-blue"><ArrowRight size={18} /></span>
            <h3>Następny krok zamiast kolejnej porady</h3>
            <p>Dostajesz plan działania, terminy i listę braków. Ty zatwierdzasz informacje i decydujesz, co robisz dalej.</p>
          </article>
          <article className="value-bridge-card">
            <span className="value-bridge-icon value-bridge-icon-mint"><LockKeyhole size={18} /></span>
            <h3>Prywatność od pierwszego pliku</h3>
            <p>Domyślnie dokumenty i ich odczyt zostają na Twoim urządzeniu. Żadna chmura nie jest potrzebna do codziennej pracy.</p>
          </article>
        </div>

        <div className="value-bridge-privacy">
          <div className="value-bridge-privacy-icon"><LockKeyhole size={21} /></div>
          <div className="value-bridge-privacy-copy">
            <h3>Co dokładnie dzieje się z dokumentem?</h3>
            <p>Po dodaniu pliku jego treść trafia do lokalnego, zaszyfrowanego magazynu przeglądarki na Twoim urządzeniu. W trybie lokalnym możesz też pracować z katalogiem <strong>Moje_sprawy/</strong> na dysku. Bez klucza sejfu dane są nieczytelne. Przy opcjonalnej synchronizacji serwer otrzymuje tylko szyfrogram — nie treść dokumentu.</p>
          </div>
          <button type="button" className="button-link" onClick={() => onNavigate('privacy')}>Zobacz ochronę danych <ArrowRight size={15} /></button>
        </div>
      </section>

      {unknownDateDeadlines.length > 0 && (
        <section className="notice-card notice-amber" aria-labelledby="delivery-title">
          <div className="notice-icon"><AlertTriangle size={19} /></div>
          <div className="notice-copy">
            <h2 id="delivery-title">Nie mamy potwierdzonej daty odbioru</h2>
            <p>Sprawdź żółtą zwrotkę, kopertę ze stemplem lub historię ePUAP. Data utworzenia pliku nie jest datą doręczenia.</p>
            <div className="delivery-controls">
              <select aria-label="Wybierz sprawę" value={selectedCaseForDate || unknownDateDeadlines[0]?.caseId || ''} onChange={(e) => setSelectedCaseForDate(e.target.value)}>
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

      <section className="surface panel-card" aria-labelledby="action-queue-title">
        <div className="panel-head">
          <div><div className="panel-kicker"><CalendarClock size={16} /> KOLEJKA DZIAŁAŃ</div><h2 id="action-queue-title">Wszystkie sprawy, jeden spokojny plan</h2></div>
          <button type="button" className="panel-action" onClick={downloadCalendar} disabled={!schedule.some((item) => item.deadline && item.dueDate)}><Download size={15} /> Pobierz do kalendarza</button>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {([['all', 'Wszystkie'], ['expired', 'Po terminie'], ['today', 'Dzisiaj'], ['next7', 'Najbliższe 7 dni'], ['unknown', 'Do wyjaśnienia']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setScheduleFilter(id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${scheduleFilter === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}
          <select aria-label="Filtruj po sprawie" value={scheduleCase} onChange={(event) => setScheduleCase(event.target.value)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            <option value="all">Wszystkie sprawy</option>
            {cases.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}
          </select>
        </div>
        <div className="deadline-list">
          {visibleSchedule.length ? visibleSchedule.slice(0, 8).map((action) => <button key={action.id} type="button" className="deadline-row" onClick={() => onNavigate(action.destination, action.caseRecord.id)}>
            <span className={`deadline-date ${action.category === 'unknown' || action.category === 'expired' ? 'deadline-date-amber' : ''}`}>{action.dueDate ? action.dueDate.slice(8, 10) : '—'}<small>{action.dueDate ? action.dueDate.slice(5, 7) : scheduleCategoryLabel(action)}</small></span>
            <span className="deadline-copy"><strong>{action.title}</strong><span>{action.caseRecord.title} · {scheduleCategoryLabel(action)} · {action.guidance}</span></span><ChevronRight size={16} />
          </button>) : <div className="empty-panel"><CheckCircle2 size={20} /><span>Brak działań dla tego filtra.</span></div>}
        </div>
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
        <div className="demo-card" id="demo-card"><div className="panel-kicker"><Sparkles size={16} /> PIERWSZY RAZ?</div><h2>Zobacz, jak działa TyWygrywasz.pl</h2><p>Możesz wczytać jawnie oznaczone dane syntetyczne i przejść cały przebieg bez używania własnych dokumentów.</p>{showDemo ? <button type="button" className="button-secondary" onClick={onLoadSyntheticDemo} disabled={isLoadingDemo}><Play size={15} /> {isLoadingDemo ? 'Wczytuję…' : 'Wczytaj przykład'}</button> : <button type="button" className="button-link" onClick={() => setShowDemo(true)}>Pokaż opcję demonstracyjną <ArrowRight size={15} /></button>}</div>
      </section>
    </div>
  );
}
