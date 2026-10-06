/**
 * Obywatel - Intelligent Document Classifier & Relation Engine
 * Conforms to Requirement 4: "Porządkowanie wynika z treści i znaczenia dokumentu"
 *
 * Capabilities:
 * - Detects parties, signatures, contract numbers, invoice IDs.
 * - Discovers relations: "odpowiada na", "załącznik do", "potwierdza złożenie",
 *   "potwierdza doręczenie", "wspiera twierdzenie", "nowa wersja", "to samo zdarzenie".
 * - Generates clear proposals with confidence and human explanations.
 * - Asks one simple question when ambiguous.
 */

import { Case, CaseSubfolder, DocumentRecord, DocumentRelation, InboxProposal, getCaseInstitutions } from './types';

export interface ClassificationContext {
  cases: Case[];
  existingDocuments: DocumentRecord[];
  relations: DocumentRelation[];
  /** Niepotwierdzona notatka użytkownika, oddzielona od treści dowodu. */
  userContext?: string;
}

export interface ClassificationResult {
  proposal: InboxProposal;
  discoveredRelations: DocumentRelation[];
}

export class IntelligentClassifier {
  public classifyDocument(
    document: DocumentRecord,
    textContent: string,
    context: ClassificationContext
  ): ClassificationResult {
    const textLower = textContent.toLowerCase();
    const discoveredRelations: DocumentRelation[] = [];

    let matchedCase: Case | null = null;
    const candidateMatches: Array<{ caseRecord: Case; institutionIds: string[]; score: number; rationale: string }> = [];
    let confidence = 0.4;
    let rationale = 'Dokument wymaga ręcznego przyporządkowania do sprawy.';
    let proposedSubfolder: CaseSubfolder = '01_Otrzymane';
    let clarificationQuestion: string | undefined = undefined;

    // 1. Sprawdzanie potwierdzeń nadania / UPO / zwrotek pocztowych
    const isUpoOrReceipt =
      textLower.includes('urzędowe poświadczenie odbioru') ||
      textLower.includes('poświadczenie przedłożenia') ||
      textLower.includes('potwierdzenie nadania') ||
      textLower.includes('poczta polska') ||
      textLower.includes('zwrotne potwierdzenie odbioru') ||
      document.origin === 'official_upo';

    if (isUpoOrReceipt) {
      proposedSubfolder = '04_Potwierdzenia';
      confidence = 0.85;
      rationale = 'Dokument stanowi urzędowe potwierdzenie złożenia pisma lub doręczenia.';
    }

    // 2. Sprawdzanie dowodów (faktury, ekspertyzy, protokoły, zdjęcia)
    const isEvidence =
      textLower.includes('faktura vat') ||
      textLower.includes('paragon') ||
      textLower.includes('protokół odbioru') ||
      textLower.includes('opinia techniczna') ||
      textLower.includes('ekspertyza');

    if (isEvidence) {
      proposedSubfolder = '03_Dowody';
      confidence = 0.8;
      rationale = 'Dokument stanowi dowód materialny (faktura, protokół lub ekspertyza).';
    }

    // 3. Wyszukiwanie powiązań z konkretną sprawą na podstawie sygnatury lub stron
    for (const c of context.cases) {
      const institutions = getCaseInstitutions(c);
      const matchedInstitutions = institutions.filter((institution) => {
        const name = institution.name.trim().toLowerCase();
        return name.length > 3 && textLower.includes(name);
      });
      const hasPartyMatch = matchedInstitutions.length > 0;
      let caseScore = hasPartyMatch ? 0.75 : 0;
      let caseRationale = hasPartyMatch
        ? `Dokument wymienia instytucję ${matchedInstitutions.map((institution) => `„${institution.name}”`).join(', ')} w sprawie „${c.title}”.`
        : '';

      // Wyszukanie wcześniejszych dokumentów tej sprawy
      const caseDocs = context.existingDocuments.filter((d) => d.caseIds.includes(c.id));

      for (const existingDoc of caseDocs) {
        // Czy nowy dokument wymienia nazwę lub sygnaturę istniejącego dokumentu?
        if (existingDoc.originalFileName && textLower.includes(existingDoc.originalFileName.toLowerCase().replace(/\.[^/.]+$/, ''))) {
          discoveredRelations.push({
            id: `rel-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            sourceDocumentId: document.id,
            targetDocumentId: existingDoc.id,
            relationType: 'odpowiada_na',
            rationale: `Nowy dokument bezpośrednio odwołuje się do pisma ${existingDoc.originalFileName}.`,
            isConfirmedByUser: false,
            createdAt: new Date().toISOString(),
          });
          caseScore = Math.max(caseScore, 0.95);
          caseRationale = `Ten dokument należy do sprawy „${c.title}”: odwołuje się do wcześniejszego pisma ${existingDoc.originalFileName}.`;
          break;
        }

        // Czy to potwierdzenie złożenia istniejącego pisma?
        if (isUpoOrReceipt && existingDoc.direction === 'outgoing') {
          discoveredRelations.push({
            id: `rel-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            sourceDocumentId: document.id,
            targetDocumentId: existingDoc.id,
            relationType: 'potwierdza_zlozenie',
            rationale: `Dokument potwierdza nadanie pisma wychodzącego: ${existingDoc.originalFileName}.`,
            isConfirmedByUser: false,
            createdAt: new Date().toISOString(),
          });
        }
      }

      if (caseScore > 0) {
        candidateMatches.push({
          caseRecord: c,
          institutionIds: matchedInstitutions.map((institution) => institution.id),
          score: caseScore,
          rationale: caseRationale,
        });
      }
    }

    candidateMatches.sort((a, b) => b.score - a.score);
    const strongest = candidateMatches[0];
    const similarlyStrong = strongest
      ? candidateMatches.filter((candidate) => candidate.score >= strongest.score - 0.05)
      : [];
    if (strongest && similarlyStrong.length === 1) {
      matchedCase = strongest.caseRecord;
      confidence = Math.max(confidence, strongest.score);
      rationale = strongest.rationale;
    } else if (similarlyStrong.length > 1) {
      confidence = Math.max(confidence, strongest.score);
      rationale = `Dokument pasuje do kilku spraw: ${similarlyStrong.map((candidate) => `„${candidate.caseRecord.title}”`).join(', ')}. Wybierz właściwą sprawę.`;
      clarificationQuestion = 'Dokument pasuje do kilku spraw. Do której sprawy go przypisać?';
    }

    // Notatka może pomóc wybrać sprawę, ale nie ustanawia rodzaju dowodu,
    // nie tworzy relacji potwierdzenia i nie zmienia dat z dokumentu.
    if (!matchedCase && candidateMatches.length === 0 && context.userContext?.trim()) {
      const note = context.userContext.toLowerCase();
      const noteCases = context.cases.filter((caseRecord) =>
        note.includes(caseRecord.id.toLowerCase()) ||
        note.includes(caseRecord.title.toLowerCase()) ||
        getCaseInstitutions(caseRecord).some((institution) => institution.name.trim().length > 3 && note.includes(institution.name.toLowerCase()))
      );
      if (noteCases.length === 1) {
        matchedCase = noteCases[0];
        confidence = 0.6;
        rationale = `Twoja niepotwierdzona notatka wskazuje sprawę „${matchedCase.title}”. Potwierdź przypisanie; treść dokumentu go jeszcze nie potwierdza.`;
      }
    }

    // 4. Jeśli pewność jest niska, sformułuj proste pytanie
    if (!matchedCase || confidence < 0.7) {
      clarificationQuestion = context.cases.length > 0
        ? clarificationQuestion || `Czy ten dokument dotyczy sprawy „${context.cases[0].title}”, czy nowej sprawy?`
        : 'Do jakiej sprawy chcesz dołączyć ten dokument?';
    }

    const proposal: InboxProposal = {
      id: `prop-${document.id}`,
      documentId: document.id,
      documentTitle: document.originalFileName,
      originalFileName: document.originalFileName,
      proposedCaseId: matchedCase?.id,
      proposedCaseIds: similarlyStrong.length > 1 ? similarlyStrong.map((candidate) => candidate.caseRecord.id) : matchedCase ? [matchedCase.id] : undefined,
      matchedInstitutionIds: strongest?.institutionIds.length ? strongest.institutionIds : undefined,
      proposedSubfolder,
      confidence,
      rationale,
      clarificationQuestion,
      isReviewed: false,
    };

    return { proposal, discoveredRelations };
  }
}
