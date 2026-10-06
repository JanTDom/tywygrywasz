/**
 * Obywatel - Citizen Letter Drafting Engine (Expanded)
 * Conforms to Requirement 9: "Pisma, terminy i potwierdzenia"
 *
 * Implements full procedural templates:
 * 1. Odwołanie od decyzji administracyjnej (KPA)
 * 2. Wniosek o udostępnienie informacji publicznej (UDIP)
 * 3. Ponaglenie na bezczynność organu (art. 37 KPA)
 * 4. Reklamacja konsumencka (Ustawa o prawach konsumenta)
 * 5. Przedsądowe wezwanie do zapłaty / wykonania umowy (KC)
 */

import { computeSha256 } from './crypto';
import { LetterChecklistItem, LetterDraft, LetterType } from './types';

/** Maksymalny rozmiar prywatnych wskazówek roboczych do projektu pisma. */
export const MAX_LETTER_DRAFTING_NOTES_LENGTH = 4_000;

function normalizeDraftingNotes(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new Error('Wskazówki do projektu pisma muszą być tekstem.');
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_LETTER_DRAFTING_NOTES_LENGTH) {
    throw new Error(`Wskazówki do projektu pisma mogą mieć najwyżej ${MAX_LETTER_DRAFTING_NOTES_LENGTH} znaków.`);
  }
  return trimmed;
}

export interface CreateLetterDraftInput {
  caseId: string;
  letterType: LetterType;
  title: string;
  recipientName: string;
  recipientAddressOrChannel: string;
  intermediaryAuthority?: string;
  citizenName?: string;
  citizenAddress?: string;
  caseSignature?: string;
  demands: string[];
  factualBasis: string;
  legalJustification: string;
  /** Prywatna notatka robocza; nie trafia automatycznie do eksportu pisma. */
  draftingNotes?: string;
  attachments?: { id: string; title: string; documentId?: string; included: boolean }[];
}

export function createAdministrativeAppealDraft(input: {
  caseId: string;
  caseSignature: string;
  authorityName: string;
  appealBodyName?: string;
  citizenName?: string;
  citizenAddress?: string;
  demands: string[];
  factualBasis: string;
  legalJustification: string;
  draftingNotes?: string;
  attachments?: { id: string; title: string; documentId?: string; included: boolean }[];
}): LetterDraft {
  return createModularLetterDraft({
    caseId: input.caseId,
    letterType: 'odwolanie',
    title: `Odwołanie od decyzji (${input.caseSignature || 'znak nieznany'})`,
    recipientName: input.appealBodyName || 'Samorządowe Kolegium Odwoławcze',
    recipientAddressOrChannel: `za pośrednictwem: ${input.authorityName}`,
    intermediaryAuthority: input.authorityName,
    citizenName: input.citizenName,
    citizenAddress: input.citizenAddress,
    caseSignature: input.caseSignature,
    demands: input.demands,
    factualBasis: input.factualBasis,
    legalJustification: input.legalJustification,
    draftingNotes: input.draftingNotes,
    attachments: input.attachments,
  });
}

export function createModularLetterDraft(input: CreateLetterDraftInput): LetterDraft {
  const {
    caseId,
    letterType,
    title,
    recipientName,
    recipientAddressOrChannel,
    intermediaryAuthority,
    citizenName = '[Imię i Nazwisko / Wnioskodawca]',
    citizenAddress = '[Adres korespondencyjny / e-Doręczenia]',
    caseSignature = '',
    demands,
    factualBasis,
    legalJustification,
    draftingNotes,
    attachments = [],
  } = input;

  const checklist: LetterChecklistItem[] = [];

  if (letterType === 'odwolanie') {
    checklist.push(
      {
        id: 'chk-authority',
        item: 'Prawidłowy adresat i organ pośredniczący',
        checked: false,
        isMandatory: true,
        verificationDetail: `Organ odwoławczy: ${recipientName}, za pośrednictwem: ${intermediaryAuthority || 'organu I instancji'}.`,
      },
      {
        id: 'chk-signature',
        item: 'Znak zaskarżanej decyzji',
        checked: Boolean(caseSignature),
        isMandatory: true,
        verificationDetail: `Znak sprawy: ${caseSignature || 'Wymaga uzupełnienia'}.`,
      },
      {
        id: 'chk-demands',
        item: 'Zakres żądania odwołania',
        checked: demands.length > 0,
        isMandatory: true,
        verificationDetail: 'Sformułowano żądanie uchylenia lub zmiany zaskarżonej decyzji.',
      },
      {
        id: 'chk-deadline',
        item: 'Zachowanie 14-dniowego terminu od dnia doręczenia',
        checked: false,
        isMandatory: true,
        verificationDetail: 'Termin liczony zgodnie z art. 57 KPA.',
      },
      {
        id: 'chk-attachments',
        item: 'Kompletność załączników',
        checked: false,
        isMandatory: true,
        verificationDetail: 'Załączono dowody powołane w uzasadnieniu (oraz ewentualne pełnomocnictwo).',
      },
      {
        id: 'chk-hand-signed',
        item: 'Podpis odręczny lub elektroniczny',
        checked: false,
        isMandatory: true,
        verificationDetail: 'Wymagany podpis zaufany, kwalifikowany lub odręczny.',
      }
    );
  } else if (letterType === 'wniosek_o_informacje') {
    checklist.push(
      {
        id: 'chk-udip-scope',
        item: 'Precyzyjny zakres żądanej informacji',
        checked: demands.length > 0,
        isMandatory: true,
        verificationDetail: 'Wniosek precyzuje, jakich dokumentów lub danych dotyczy.',
      },
      {
        id: 'chk-udip-channel',
        item: 'Wskazanie formy i sposobu udostępnienia',
        checked: true,
        isMandatory: true,
        verificationDetail: 'Wskazano przesłanie pocztą elektroniczną lub na adres e-Doręczeń.',
      }
    );
  } else if (letterType === 'reklamacja_konsumencka') {
    checklist.push(
      {
        id: 'chk-rec-proof',
        item: 'Wskazanie dowodu zakupu',
        checked: false,
        isMandatory: true,
        verificationDetail: 'Załączono fakturę, paragon lub potwierdzenie przelewu.',
      },
      {
        id: 'chk-rec-defect',
        item: 'Dokładny opis wady i momentu jej ujawnienia',
        checked: Boolean(factualBasis),
        isMandatory: true,
        verificationDetail: 'Opisano niezgodność towaru z umową.',
      },
      {
        id: 'chk-rec-demand',
        item: 'Jednoznaczne żądanie konsumenta',
        checked: demands.length > 0,
        isMandatory: true,
        verificationDetail: 'Wskazano: wymiana, naprawa, obniżenie ceny lub odstąpienie.',
      }
    );
  } else if (letterType === 'wezwanie_do_zaplaty') {
    checklist.push(
      {
        id: 'chk-wezw-amount',
        item: 'Wskazanie dokładnej kwoty długu i odsetek',
        checked: demands.length > 0,
        isMandatory: true,
        verificationDetail: 'Określono kwotę należności głównej i odsetek ustawowych.',
      },
      {
        id: 'chk-wezw-deadline',
        item: 'Wyznaczenie terminu spełnienia świadczenia',
        checked: true,
        isMandatory: true,
        verificationDetail: 'Zakreślono termin (np. 7 lub 14 dni od doręczenia wezwania).',
      },
      {
        id: 'chk-wezw-account',
        item: 'Numer rachunku bankowego do wpłaty',
        checked: false,
        isMandatory: true,
        verificationDetail: 'Podano prawidłowy numer rachunku wierzyciela.',
      }
    );
  } else if (letterType === 'odwolanie_podatkowe') {
    checklist.push(
      {
        id: 'chk-tax-authority',
        item: 'Właściwy Dyrektor Izby Administracji Skarbowej',
        checked: true,
        isMandatory: true,
        verificationDetail: `Adresat: ${recipientName}, za pośrednictwem: ${intermediaryAuthority || 'Naczelnika Urzędu Skarbowego'}.`,
      },
      {
        id: 'chk-tax-signature',
        item: 'Znak zaskarżanej decyzji podatkowej',
        checked: Boolean(caseSignature),
        isMandatory: true,
        verificationDetail: `Znak decyzji: ${caseSignature || 'Wymaga uzupełnienia'}.`,
      },
      {
        id: 'chk-tax-charges',
        item: 'Zarzuty naruszenia przepisów prawa podatkowego',
        checked: Boolean(legalJustification),
        isMandatory: true,
        verificationDetail: 'Zarzuty określające istotę i zakres żądania (art. 222 Ordynacji podatkowej).',
      },
      {
        id: 'chk-tax-deadline',
        item: 'Termin 14 dni od dnia doręczenia decyzji',
        checked: false,
        isMandatory: true,
        verificationDetail: 'Wniesienie w terminie 14 dni (art. 223 Ordynacji podatkowej).',
      }
    );
  } else if (letterType === 'odwolanie_zus') {
    checklist.push(
      {
        id: 'chk-zus-court',
        item: 'Oznaczenie Sądu Pracy i Ubezpieczeń Społecznych',
        checked: true,
        isMandatory: true,
        verificationDetail: `Sąd właściwy za pośrednictwem: ${intermediaryAuthority || 'Oddziału ZUS'}.`,
      },
      {
        id: 'chk-zus-decision',
        item: 'Numer zaskarżanej decyzji ZUS',
        checked: Boolean(caseSignature),
        isMandatory: true,
        verificationDetail: `Numer decyzji: ${caseSignature || 'Wymaga uzupełnienia'}.`,
      },
      {
        id: 'chk-zus-deadline',
        item: 'Termin 1 miesiąca od doręczenia decyzji ZUS',
        checked: false,
        isMandatory: true,
        verificationDetail: 'Zgodnie z art. 477^9 KPC termin na wniesienie odwołania wynosi 1 miesiąc.',
      },
      {
        id: 'chk-zus-fee',
        item: 'Brak opłaty sądowej (zwolnienie ustawowe)',
        checked: true,
        isMandatory: false,
        verificationDetail: 'Sprawy z zakresu ubezpieczeń społecznych są co do zasady wolne od opłat sądowych.',
      }
    );
  } else if (letterType === 'wezwanie_pracownicze') {
    checklist.push(
      {
        id: 'chk-labor-employer',
        item: 'Oznaczenie pracodawcy',
        checked: true,
        isMandatory: true,
        verificationDetail: `Pracodawca: ${recipientName}.`,
      },
      {
        id: 'chk-labor-demands',
        item: 'Zakres sprostowania lub żądana kwota',
        checked: demands.length > 0,
        isMandatory: true,
        verificationDetail: 'Wskazano błędne zapisy świadectwa lub zaległe składniki wynagrodzenia.',
      },
      {
        id: 'chk-labor-deadline',
        item: 'Termin 14 dni na wniosek o sprostowanie świadectwa pracy',
        checked: false,
        isMandatory: true,
        verificationDetail: 'Zgodnie z art. 97 § 2^1 Kodeksu pracy termin wynosi 14 dni.',
      }
    );
  } else {
    checklist.push({
      id: 'chk-gen-sign',
      item: 'Podpis i kompletność danych',
      checked: false,
      isMandatory: true,
      verificationDetail: 'Sprawdzono dane adresowe i podpis.',
    });
  }

  return {
    id: `letter-${caseId}-${Date.now()}`,
    caseId,
    title,
    letterType,
    draftingNotes: normalizeDraftingNotes(draftingNotes),
    recipient: {
      name: recipientName,
      addressOrChannel: recipientAddressOrChannel,
      intermediaryAuthority,
    },
    sender: {
      placeholderName: citizenName,
      contactChannel: citizenAddress,
    },
    caseSignature,
    demands,
    factualBasis,
    legalJustification,
    attachments,
    status: 'draft',
    checklist,
  };
}

export function formatLetterPlainText(letter: LetterDraft): string {
  const lines: string[] = [];

  lines.push('Miejscowość, data: ....................... r.');
  lines.push('');
  lines.push('Nadawca:');
  lines.push(letter.sender.placeholderName);
  lines.push(letter.sender.contactChannel);
  lines.push('');
  lines.push('Adresat:');
  lines.push(letter.recipient.name);
  lines.push(letter.recipient.addressOrChannel);
  if (letter.recipient.intermediaryAuthority) {
    lines.push(`za pośrednictwem: ${letter.recipient.intermediaryAuthority}`);
  }
  lines.push('');

  if (letter.caseSignature) {
    lines.push(`Znak sprawy: ${letter.caseSignature}`);
    lines.push('');
  }

  // Tytuł pisma
  let titleUpper = letter.title.toUpperCase();
  if (letter.letterType === 'odwolanie') {
    titleUpper = 'ODWOŁANIE OD DECYZJI ADMINISTRACYJNEJ';
  } else if (letter.letterType === 'wniosek_o_informacje') {
    titleUpper = 'WNIOSEK O UDOSTĘPNIENIE INFORMACJI PUBLICZNEJ';
  } else if (letter.letterType === 'reklamacja_konsumencka') {
    titleUpper = 'REKLAMACJA TOWARU / USŁUGI';
  } else if (letter.letterType === 'wezwanie_do_zaplaty') {
    titleUpper = 'PRZEDSĄDOWE WEZWANIE DO ZAPŁATY';
  } else if (letter.letterType === 'ponaglenie') {
    titleUpper = 'PONAGLENIE W POSTĘPOWANIU ADMINISTRACYJNYM';
  }

  lines.push(`                                ${titleUpper}`);
  lines.push('');

  // Stan faktyczny / wstęp
  lines.push(letter.factualBasis || '[Opis okoliczności sprawy]');
  lines.push('');

  // Żądania
  lines.push('Żądania:');
  letter.demands.forEach((d, idx) => {
    lines.push(`${idx + 1}. ${d}`);
  });
  lines.push('');

  // Uzasadnienie
  lines.push('                               UZASADNIENIE');
  lines.push('');
  lines.push(letter.legalJustification || '[Uzasadnienie prawne i faktyczne]');
  lines.push('');

  // Załączniki
  lines.push('Załączniki:');
  if (letter.attachments.length === 0) {
    lines.push('1. Kopia dokumentów dowodowych');
  } else {
    letter.attachments.forEach((att, idx) => {
      lines.push(`${idx + 1}. ${att.title}`);
    });
  }
  lines.push('');
  lines.push('                                ............................................');
  lines.push('                                            (własnoręczny podpis)');

  return lines.join('\n');
}

export async function exportLetterForPrinting(letter: LetterDraft): Promise<{
  formattedText: string;
  exportSha256: string;
}> {
  const formattedText = formatLetterPlainText(letter);
  const exportSha256 = await computeSha256(formattedText);
  return { formattedText, exportSha256 };
}
