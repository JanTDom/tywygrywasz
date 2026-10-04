import { Case, ProceduralDeadline } from './types';

export type ActionScheduleFilter = 'all' | 'expired' | 'today' | 'next7' | 'unknown';
export type ActionScheduleCategory = 'expired' | 'today' | 'next7' | 'unknown' | 'later' | 'case_action';

export interface ScheduledAction {
  id: string;
  caseRecord: Case;
  deadline?: ProceduralDeadline;
  category: ActionScheduleCategory;
  dueDate?: string;
  daysRemaining?: number;
  title: string;
  guidance: string;
  buttonLabel: string;
  destination: 'timeline' | 'plan' | 'letters';
  needsDeliveryDate: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CATEGORY_ORDER: Record<ActionScheduleCategory, number> = {
  expired: 0, today: 1, next7: 2, unknown: 3, later: 4, case_action: 5,
};

/** A calendar date, not an elapsed 24-hour clock; safe across DST changes. */
export function calendarDateDay(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  if (new Date(timestamp).toISOString().slice(0, 10) !== iso) return null;
  return Math.floor(timestamp / DAY_MS);
}

export function polishCalendarDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function scheduleDeadline(caseRecord: Case, deadline: ProceduralDeadline, today: number): ScheduledAction {
  const endDay = calendarDateDay(deadline.calculatedEndDate);
  const startDay = calendarDateDay(deadline.startDate);
  const unknown = deadline.status === 'unknown' || endDay === null || startDay === null;
  const daysRemaining = unknown || endDay === null ? undefined : endDay - today;
  const category: ActionScheduleCategory = unknown ? 'unknown'
    : deadline.status === 'expired' || (daysRemaining !== undefined && daysRemaining < 0) ? 'expired'
    : daysRemaining === 0 ? 'today'
    : daysRemaining !== undefined && daysRemaining <= 7 ? 'next7'
    : 'later';
  const needsDeliveryDate = startDay === null;

  if (category === 'unknown') {
    return {
      id: deadline.id, caseRecord, deadline, category, daysRemaining,
      title: needsDeliveryDate ? 'Potwierdź datę odbioru' : 'Wyjaśnij termin w tej sprawie',
      guidance: needsDeliveryDate
        ? 'Sprawdź zwrotkę, kopertę lub urzędowe potwierdzenie odbioru. Data pliku nie jest datą doręczenia.'
        : 'Data odbioru jest zapisana, ale termin nie jest jeszcze ustalony. Sprawdź założenia i regułę na osi czasu.',
      buttonLabel: needsDeliveryDate ? 'Zapisz datę odbioru' : 'Sprawdź założenia',
      destination: 'timeline', needsDeliveryDate,
    };
  }
  if (category === 'expired') {
    return {
      id: deadline.id, caseRecord, deadline, category, dueDate: deadline.calculatedEndDate, daysRemaining,
      title: 'Sprawdź wykonanie działania po terminie',
      guidance: `Zapisany termin minął. Sprawdź, czy wykonano „${deadline.actionRequired}” i zachowano dowód nadania lub odbioru. Jeśli nie, przejrzyj dalsze możliwości w planie sprawy.`,
      buttonLabel: 'Sprawdź termin i dowód', destination: 'timeline', needsDeliveryDate: false,
    };
  }
  return {
    id: deadline.id, caseRecord, deadline, category, dueDate: deadline.calculatedEndDate, daysRemaining,
    title: category === 'today' ? deadline.actionRequired : `Przygotuj: ${deadline.actionRequired}`,
    guidance: category === 'today'
      ? 'Termin jest dziś. Sprawdź treść, podpis i sposób złożenia. Po wykonaniu zachowaj potwierdzenie.'
      : 'Data odbioru jest znana. Przejdź do planu, sprawdź potrzebne dokumenty i przygotuj działanie przed terminem.',
    buttonLabel: category === 'today' ? 'Sprawdź działanie na dziś' : 'Otwórz plan sprawy',
    destination: category === 'today' ? 'timeline' : 'plan', needsDeliveryDate: false,
  };
}

/** A single queue across all open cases; never mutates domain records. */
export function buildActionSchedule(
  cases: Case[],
  deadlines: ProceduralDeadline[],
  todayIso = polishCalendarDate(),
): ScheduledAction[] {
  const today = calendarDateDay(todayIso);
  if (today === null) throw new Error('Nieprawidłowa data panelu działań.');
  const activeCases = cases.filter((item) => item.status !== 'closed');
  const caseById = new Map(activeCases.map((item) => [item.id, item]));
  const withDeadline = new Set<string>();
  const actions: ScheduledAction[] = [];
  for (const deadline of deadlines) {
    const caseRecord = caseById.get(deadline.caseId);
    if (!caseRecord || deadline.status === 'suspended') continue;
    withDeadline.add(caseRecord.id);
    actions.push(scheduleDeadline(caseRecord, deadline, today));
  }
  for (const caseRecord of activeCases) {
    if (withDeadline.has(caseRecord.id)) continue;
    actions.push({
      id: `case-action-${caseRecord.id}`, caseRecord, category: 'case_action',
      title: caseRecord.nextAction || 'Sprawdź następny krok sprawy',
      guidance: 'W tej sprawie nie ma zapisanego aktywnego terminu. Otwórz plan i sprawdź, co jest potrzebne do kolejnego kroku.',
      buttonLabel: 'Otwórz plan sprawy', destination: 'plan', needsDeliveryDate: false,
    });
  }
  return actions.sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
    || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
    || a.caseRecord.title.localeCompare(b.caseRecord.title, 'pl')
    || a.id.localeCompare(b.id));
}

export function filterActionSchedule(actions: ScheduledAction[], filter: ActionScheduleFilter, caseId = 'all'): ScheduledAction[] {
  return actions.filter((action) => (caseId === 'all' || action.caseRecord.id === caseId)
    && (filter === 'all' || action.category === filter));
}

export function scheduleCategoryLabel(action: ScheduledAction): string {
  if (action.category === 'expired') return 'Termin minął';
  if (action.category === 'today') return 'Dzisiaj';
  if (action.category === 'unknown') return 'Do wyjaśnienia';
  if (action.category === 'case_action') return 'Następny krok';
  return action.daysRemaining === 1 ? 'Jutro' : `Za ${action.daysRemaining} dni`;
}

function escapeCalendarText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

/** RFC 5545 physical lines are at most 75 octets, including UTF-8 text. */
function foldCalendarLine(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let part = '';
  let bytes = 0;
  for (const char of line) {
    const length = encoder.encode(char).length;
    if (bytes + length > 75) {
      lines.push(part);
      part = ' ';
      bytes = 1;
    }
    part += char;
    bytes += length;
  }
  lines.push(part);
  return lines.join('\r\n');
}

function nextCalendarDate(iso: string): string {
  return new Date(((calendarDateDay(iso) as number) + 1) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Local calendar export. Includes no attendees, e-mail, invitation, or network
 * action. The user chooses whether and where to import this file.
 */
export function exportReminderCalendar(actions: ScheduledAction[], now = new Date()): { content: string; count: number } {
  const eligible = actions.filter((action) => action.deadline && action.dueDate && calendarDateDay(action.dueDate) !== null);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TyWygrywasz.pl//Przypomnienia//PL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const action of eligible) {
    const deadline = action.deadline as ProceduralDeadline;
    const dueDate = action.dueDate as string;
    lines.push('BEGIN:VEVENT', `UID:${encodeURIComponent(deadline.id)}@tywygrywasz.pl`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dueDate.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${nextCalendarDate(dueDate).replace(/-/g, '')}`,
      `SUMMARY:${escapeCalendarText(deadline.actionRequired)}`,
      `DESCRIPTION:${escapeCalendarText(`Sprawa: ${action.caseRecord.title}\n${action.guidance}\nTermin z zapisanej reguły ${deadline.ruleVersion}. Sprawdź aktualność danych w TyWygrywasz.pl.`)}`,
      'TRANSP:TRANSPARENT', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P1D',
      `DESCRIPTION:${escapeCalendarText(`Jutro: ${deadline.actionRequired}`)}`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return { content: `${lines.map(foldCalendarLine).join('\r\n')}\r\n`, count: eligible.length };
}
