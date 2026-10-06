/**
 * Obywatel - Local Document Extractor & Parser
 * Conforms to docs/DATA_MODEL.md, docs/ACCEPTANCE.md and .agents/skills/local-document-vault/SKILL.md
 *
 * Security:
 * - Documents are untrusted input.
 * - Any embedded directives ("ignore previous rules", "send data") are treated strictly as inert text.
 * - Yields structured proposals with status 'proposed' and explicit confidence scores.
 * - Missing values (e.g. delivery date) remain 'unknown'.
 */

import { ExtractedField, DocumentSourceLine } from './types';

export interface ExtractionResult {
  fields: ExtractedField[];
  warnings: string[];
  hasPromptInjectionAttempt: boolean;
}

export function extractFieldsFromText(params: {
  documentId: string;
  versionId: string;
  text: string;
  sourceLines?: DocumentSourceLine[];
}): ExtractionResult {
  const { documentId, versionId, text } = params;
  const fields: ExtractedField[] = [];
  const warnings: string[] = [];

  // Wykrywanie prób prompt injection w tekście dokumentu
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous\s+)?instructions/i,
    /zignoruj\s+(wszystkie\s+)?(wcześniejsze\s+)?instrukcje/i,
    /system\s+prompt\s+override/i,
    /send\s+(this\s+)?document\s+to/i,
    /wyślij\s+dokument\s+na/i,
  ];

  let hasPromptInjectionAttempt = false;
  for (const pattern of injectionPatterns) {
    if (pattern.test(text)) {
      hasPromptInjectionAttempt = true;
      warnings.push(
        'W dokumencie wykryto frazy próbujące manipulować instrukcjami systemowymi (Prompt Injection). Treść została potraktowana wyłącznie jako neutralne dane tekstowe.'
      );
      break;
    }
  }

  // 1. Sygnatura sprawy (np. WAB.6740.1.2026.JK, GP.6840.12.2026)
  const signatureRegex = /(?:znak|sygn\.|nr|sprawa|sygnatura)?:?\s*([A-ZĄĆĘŁŃÓŚŹŻ]{2,5}(?:[-.][A-Z0-9]+){2,5})/i;
  const signatureMatch = text.match(signatureRegex);
  if (signatureMatch) {
    fields.push({
      id: `field-${documentId}-sig`,
      documentId,
      versionId,
      fieldName: 'case_signature',
      label: 'Znak sprawy / Sygnatura',
      rawValue: signatureMatch[1],
      parsedValue: signatureMatch[1].trim(),
      status: 'proposed',
      pageNumber: 1,
      fragmentSnippet: signatureMatch[0],
      ocrConfidence: 0.95,
    });
  } else {
    fields.push({
      id: `field-${documentId}-sig`,
      documentId,
      versionId,
      fieldName: 'case_signature',
      label: 'Znak sprawy / Sygnatura',
      rawValue: '',
      status: 'unknown',
      pageNumber: 1,
      fragmentSnippet: 'Nie odnaleziono jednoznacznego numeru sprawy w tekście.',
      ocrConfidence: 0.0,
    });
  }

  // 2. Organ wydający
  const authorityPatterns = [
    /Prezydent\s+Miasta\s+[A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż\s]+/i,
    /Burmistrz\s+[A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż\s]+/i,
    /Wójt\s+Gminy\s+[A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż\s]+/i,
    /Starosta\s+[A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż\s]+/i,
    /Wojewoda\s+[A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż\s]+/i,
    /Marszałek\s+Województwa\s+[A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż\s]+/i,
  ];

  let authorityFound: string | null = null;
  for (const pattern of authorityPatterns) {
    const match = text.match(pattern);
    if (match) {
      authorityFound = match[0].split('\n')[0].trim();
      break;
    }
  }

  if (authorityFound) {
    fields.push({
      id: `field-${documentId}-auth`,
      documentId,
      versionId,
      fieldName: 'issuing_authority',
      label: 'Organ wydający',
      rawValue: authorityFound,
      parsedValue: authorityFound,
      status: 'proposed',
      pageNumber: 1,
      fragmentSnippet: authorityFound,
      ocrConfidence: 0.9,
    });
  }

  // 3. Data wydania / sporządzenia pisma
  const dateRegex = /(?:dnia|z\s+dnia|data:)?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[a-ząćęłńóśźż]+\s+\d{4})/i;
  const dateMatch = text.match(dateRegex);
  if (dateMatch) {
    fields.push({
      id: `field-${documentId}-doc-date`,
      documentId,
      versionId,
      fieldName: 'document_date',
      label: 'Data sporządzenia pisma',
      rawValue: dateMatch[1],
      parsedValue: dateMatch[1].trim(),
      status: 'proposed',
      pageNumber: 1,
      fragmentSnippet: dateMatch[0],
      ocrConfidence: 0.88,
    });
  }

  // 4. Data doręczenia - w treści decyzji zazwyczaj jej NIE MA!
  // Kardynalna zasada: nie zgadywać daty doręczenia z daty sporządzenia.
  fields.push({
    id: `field-${documentId}-delivery-date`,
    documentId,
    versionId,
    fieldName: 'delivery_date',
    label: 'Data doręczenia użytkownikowi',
    rawValue: '',
    status: 'unknown',
    pageNumber: 1,
    fragmentSnippet: 'Data doręczenia nie wynika z treści samej decyzji. Należy ją ustalić z dowodu doręczenia (np. pocztowej zwrotki lub UPO).',
    ocrConfidence: 0.0,
  });

  // 5. Pouczenie i termin na odwołanie
  const pouczenieRegex = /(?:POUCZENIE|Pouczenie)[\s\S]*?(?:(?:\n\n)|$)/;
  const pouczenieMatch = text.match(pouczenieRegex);
  if (pouczenieMatch) {
    const pouczenieText = pouczenieMatch[0].trim();
    fields.push({
      id: `field-${documentId}-pouczenie`,
      documentId,
      versionId,
      fieldName: 'instruction_text',
      label: 'Treść pouczenia',
      rawValue: pouczenieText,
      parsedValue: pouczenieText,
      status: 'proposed',
      pageNumber: 1,
      fragmentSnippet: pouczenieText.substring(0, 150) + '...',
      ocrConfidence: 0.92,
    });

    // Wyszukanie liczby dni
    const daysMatch = pouczenieText.match(/terminie\s+(\d+)\s+dni/i);
    if (daysMatch) {
      fields.push({
        id: `field-${documentId}-deadline-days`,
        documentId,
        versionId,
        fieldName: 'appeal_deadline_days',
        label: 'Termin na odwołanie / wniosek (dni)',
        rawValue: daysMatch[1],
        parsedValue: daysMatch[1],
        status: 'proposed',
        pageNumber: 1,
        fragmentSnippet: daysMatch[0],
        ocrConfidence: 0.95,
      });
    }

    // Organ odwoławczy
    const appealBodyMatch = pouczenieText.match(/(?:do\s+)(Samorządow[a-ząćęłńóśźż\s]+Kolegium\s+Odwoławcz[a-ząćęłńóśźż\s]+|Wojewod[a-ząćęłńóśźż\s]+)/i);
    if (appealBodyMatch) {
      fields.push({
        id: `field-${documentId}-appeal-body`,
        documentId,
        versionId,
        fieldName: 'appeal_body',
        label: 'Organ odwoławczy',
        rawValue: appealBodyMatch[1].trim(),
        parsedValue: appealBodyMatch[1].trim(),
        status: 'proposed',
        pageNumber: 1,
        fragmentSnippet: appealBodyMatch[0],
        ocrConfidence: 0.9,
      });
    }
  }

  // An actual parser/OCR source map takes precedence over any text heuristic.
  // Unknown fields have no located source. Plain text without a physical page
  // map retains page 1, while multi-page PDFs never fall back to a guessed page.
  for (const field of fields) {
    if (field.status === 'unknown') { field.pageNumber = 0; continue; }
    if (!params.sourceLines) continue;
    const value = field.rawValue.trim();
    const firstLine = value.split(/\r?\n/)[0];
    const normalized = (input: string) => input.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pl');
    const source = params.sourceLines.find((line) => normalized(line.text).includes(normalized(firstLine)));
    if (source) {
      field.pageNumber = source.pageNumber;
      field.sourceBounds = source.bounds;
      field.ocrConfidence = source.confidence / 100;
    } else {
      field.pageNumber = 0;
      warnings.push(`Pole „${field.label}” wymaga ręcznego wskazania miejsca w oryginale.`);
    }
  }
  return { fields, warnings, hasPromptInjectionAttempt };
}
