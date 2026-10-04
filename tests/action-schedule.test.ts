import { describe, expect, it } from 'vitest';
import {
  buildActionSchedule,
  exportReminderCalendar,
  filterActionSchedule,
} from '../src/domain/action-schedule';
import { Case, ProceduralDeadline } from '../src/domain/types';

const caseRecord: Case = {
  id: 'S-0001', folderName: 'S-0001_Test', title: 'Odwołanie od decyzji', goalDescription: 'Uchylenie decyzji',
  procedureType: 'administrative', opponentType: 'public_authority', authorityOrOpponentName: 'Urząd', authorityJurisdictionReason: 'Organ I instancji',
  institutions: [{ id: 'inst-1', name: 'Urząd', kind: 'office', roles: ['issuing_authority'], isPrimary: true }], status: 'analyzing',
  nextAction: 'Dodaj potwierdzenie doręczenia', missingFacts: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

function deadline(id: string, end: string | 'unknown', status: ProceduralDeadline['status'] = 'active'): ProceduralDeadline {
  return { id, caseId: caseRecord.id, baseEventId: `event-${id}`, ruleVersion: 'KPA-2026', legalBasisId: 'KPA-ART-57', legalStateDate: '2026-01-01', daysCount: 14, startDate: end === 'unknown' ? 'unknown' : '2026-10-01', calculatedEndDate: end, status, assumptions: [], calculationLog: [], isWeekendOrHolidayShifted: false, actionRequired: 'Złóż odwołanie' };
}

describe('global action schedule', () => {
  it('sorts expired, today, next 7 days and unknown actions for every case', () => {
    const second = { ...caseRecord, id: 'S-0002', title: 'Druga sprawa', nextAction: 'Dodaj dokument' };
    const actions = buildActionSchedule([caseRecord, second], [
      deadline('expired', '2026-09-30'), deadline('today', '2026-10-05'), deadline('next', '2026-10-10'), deadline('unknown', 'unknown', 'unknown'),
    ], '2026-10-05');
    expect(actions.map((item) => item.category)).toEqual(['expired', 'today', 'next7', 'unknown', 'case_action']);
    expect(filterActionSchedule(actions, 'today')).toHaveLength(1);
    expect(filterActionSchedule(actions, 'unknown')[0].needsDeliveryDate).toBe(true);
  });

  it('adds a case action when a case has no active deadline', () => {
    const actions = buildActionSchedule([caseRecord], [], '2026-10-05');
    expect(actions).toHaveLength(1);
    expect(actions[0].category).toBe('case_action');
    expect(actions[0].title).toBe('Dodaj potwierdzenie doręczenia');
  });

  it('exports only dated reminders as a local ICS calendar', () => {
    const actions = buildActionSchedule([caseRecord], [deadline('today', '2026-10-05'), deadline('unknown', 'unknown', 'unknown')], '2026-10-05');
    const calendar = exportReminderCalendar(actions, new Date('2026-10-05T10:00:00Z'));
    expect(calendar.count).toBe(1);
    expect(calendar.content).toContain('BEGIN:VCALENDAR');
    expect(calendar.content).toContain('DTSTART;VALUE=DATE:20261005');
    expect(calendar.content).toContain('END:VCALENDAR');
    expect(calendar.content).not.toContain('ATTENDEE');
  });
});
