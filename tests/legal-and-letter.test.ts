/**
 * Tests for Legal Knowledge Dossier and Citizen Letter Draft Engine
 * Conforms to docs/ACCEPTANCE.md and .agents/skills/draft-citizen-letter/SKILL.md
 */

import { describe, it, expect } from 'vitest';
import {
  OFFICIAL_LEGAL_SOURCES,
  buildAdministrativeAppealDossier,
} from '../src/domain/legal-knowledge';
import {
  createAdministrativeAppealDraft,
  formatLetterPlainText,
  exportLetterForPrinting,
} from '../src/domain/letter-engine';

describe('Legal Knowledge Dossier & Citizen Letter Engine', () => {
  it('verified legal sources contain official ELI URLs, content hashes, and quote texts', () => {
    const kpa57 = OFFICIAL_LEGAL_SOURCES['KPA-ART-57'];
    expect(kpa57.verificationStatus).toBe('verified');
    expect(kpa57.officialUrl).toContain('eli.gov.pl');
    expect(kpa57.contentHash).toHaveLength(64);
    expect(kpa57.articleOrPage).toContain('art. 57');
    expect(kpa57.quoteText).toContain('§ 4.');
  });

  it('builds an administrative appeal dossier with facts, claims, options, and counterarguments', () => {
    const dossier = buildAdministrativeAppealDossier({
      caseId: 'case-test-1',
      signature: 'WAB.6740.1.2026.JK',
      authorityName: 'Prezydent m.st. Warszawy',
      deliveryDate: '2026-09-15',
      deadlineEndDate: '2026-09-29',
    });

    expect(dossier.verificationStatus).toBe('verified');
    expect(dossier.claims.length).toBeGreaterThanOrEqual(3);
    expect(dossier.actionVariants.some((v) => v.recommended)).toBe(true);
    expect(dossier.counterArguments.length).toBeGreaterThan(0);
  });

  it('generates an editable citizen letter draft with pre-submission checklist', async () => {
    const letter = createAdministrativeAppealDraft({
      caseId: 'case-test-1',
      caseSignature: 'WAB.6740.1.2026.JK',
      authorityName: 'Prezydent m.st. Warszawy',
      appealBodyName: 'Samorządowe Kolegium Odwoławcze w Warszawie',
      citizenName: 'Jan Kowalski',
      citizenAddress: 'ul. Marszałkowska 1/2, 00-001 Warszawa',
      demands: [
        'Uchylenie zaskarżonej decyzji w całości.',
        'Przekazanie sprawy organowi pierwszej instancji do ponownego rozpatrzenia.',
      ],
      factualBasis: 'Brak wszechstronnego wyjaśnienia stanu faktycznego (art. 7 i 77 § 1 KPA).',
      legalJustification:
        'Organ pierwszej instancji bezpodstawnie uznał, że projekt budowlany zawiera braki formalne, pomimo złożenia wymaganych uzupełnień w zakreślonym terminie.',
      draftingNotes: '  To wskazówka robocza: przed wysłaniem sprawdź datę doręczenia.  ',
      attachments: [{ id: 'att-1', title: 'Kopia decyzji Prezydenta m.st. Warszawy', included: true }],
    });

    expect(letter.status).toBe('draft');
    expect(letter.checklist.length).toBe(6);
    expect(letter.draftingNotes).toBe('To wskazówka robocza: przed wysłaniem sprawdź datę doręczenia.');

    // Format plain text
    const text = formatLetterPlainText(letter);
    expect(text).toContain('ODWOŁANIE');
    expect(text).toContain('Jan Kowalski');
    expect(text).toContain('Samorządowe Kolegium Odwoławcze w Warszawie');
    expect(text).toContain('WAB.6740.1.2026.JK');
    expect(text).toContain('własnoręczny podpis');
    expect(text).not.toContain('To wskazówka robocza');

    // Zero emoji check
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(text)).toBe(false);

    // Export with SHA-256
    const { formattedText, exportSha256 } = await exportLetterForPrinting(letter);
    expect(formattedText).toBe(text);
    expect(exportSha256).toHaveLength(64);
  });
});
