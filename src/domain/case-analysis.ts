/**
 * Obywatel - Comprehensive Case Analysis & Action Plan Engine
 * Conforms to Requirement 6 ("Analiza dokumentów i całej sprawy")
 * and Requirement 8 ("Prowadzenie użytkownika za rękę")
 */

import {
  ActionPlanStep,
  Case,
  CaseDemand,
  CaseEvent,
  CaseParty,
  DocumentRecord,
  EvidenceMatrixItem,
  ExtractedField,
  LegalAnalysis,
  LegalSource,
  MissingInformationItem,
  ProceduralDeadline,
  getCaseInstitutions,
} from './types';

export interface BuildCaseAnalysisInput {
  caseRecord: Case;
  documents: DocumentRecord[];
  extractedFields: ExtractedField[];
  events: CaseEvent[];
  deadlines: ProceduralDeadline[];
  /** Legal sources are supplied by the local vault. Never infer verification from a document alone. */
  legalSources?: LegalSource[];
}

export function buildCompleteCaseAnalysis(input: BuildCaseAnalysisInput): LegalAnalysis {
  const { caseRecord, documents, extractedFields, deadlines, legalSources = [] } = input;
  const institutions = getCaseInstitutions(caseRecord);
  const institutionNames = institutions.map((institution) => institution.name).join(', ');

  // 1. Strony sporu
  const parties: CaseParty[] = [
    {
      id: 'party-citizen',
      name: 'TyWygrywasz / Użytkownik',
      role: 'citizen',
      stance: caseRecord.goalDescription,
    },
    ...institutions.map((institution) => ({
      id: `party-${institution.id}`,
      institutionId: institution.id,
      name: institution.name,
      role: institution.roles.includes('witness')
        ? 'witness' as const
        : institution.roles.includes('expert')
        ? 'expert' as const
        : institution.kind === 'public_authority' || institution.kind === 'office' || institution.kind === 'court' || institution.roles.includes('issuing_authority') || institution.roles.includes('appeal_authority') || institution.roles.includes('intermediary')
        ? 'authority' as const
        : 'opponent' as const,
      stance: `Rola w sprawie: ${institution.roles.join(', ')}. Procedura: ${caseRecord.procedureType}.`,
    })),
  ];

  // 2. Żądania
  const demands: CaseDemand[] = [
    {
      id: 'dem-main',
      title: caseRecord.goalDescription,
      description: `Główne żądanie w sprawie: ${caseRecord.title}`,
      status: 'pending',
      legalBasis: caseRecord.authorityJurisdictionReason,
    },
  ];

  // 3. Macierz dowodów i sprzeczności
  const evidenceMatrix: EvidenceMatrixItem[] = [];
  documents.forEach((doc) => {
    const confirmedExtraction = extractedFields.some(
      (field) => field.documentId === doc.id && field.status === 'confirmed' && field.ocrConfidence >= 0.9,
    );
    evidenceMatrix.push({
      id: `ev-${doc.id}`,
      fact: `Przedłożono dokument: ${doc.originalFileName}`,
      supportedByDocId: doc.id,
      supportedBySnippet: `Dokument typu: ${doc.type}, pochodzenie: ${doc.origin}, rozmiar: ${doc.fileSize} B.`,
      // A file proves that it exists, not that every fact inferred from it is true.
      // Only a user-confirmed high-confidence extraction can move this to probable.
      confidence: confirmedExtraction ? 'probable' : 'unproven',
    });
  });

  // 4. Braki informacyjne
  const missingInformation: MissingInformationItem[] = [];
  const deliveryField = extractedFields.find((f) => f.fieldName === 'delivery_date');
  if (!deliveryField || deliveryField.status === 'unknown') {
    missingInformation.push({
      id: 'miss-delivery-date',
      question: 'Kiedy dokładnie otrzymałeś pismo od drugiej strony?',
      neededDocType: 'Potwierdzenie odbioru (żółta zwrotka pocztowa lub elektroniczne UPO)',
      whyImportant: 'Od dnia doręczenia biegnie nieprzekraczalny termin na złożenie odwołania lub odpowiedzi.',
    });
  }

  // 5. Krok po kroku: Plan działania (Action Plan)
  const actionPlan: ActionPlanStep[] = [];
  const activeDeadline = deadlines.find((d) => d.caseId === caseRecord.id);

  if (caseRecord.procedureType === 'administrative') {
    actionPlan.push(
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Sprawdzenie i potwierdzenie daty doręczenia decyzji',
        why: 'Bieg 14-dniowego terminu na odwołanie liczy się od dnia doręczenia decyzji stronie (art. 129 § 2 KPA).',
        requiredDocuments: ['Żółta zwrotka pocztowa', 'Kopia koperty ze stemplem', 'UPO z ePUAP/e-Doręczeń'],
        decisionNeeded: 'Wskaż datę odebrania przesyłki w aplikacji.',
        deadlineNotice: activeDeadline?.calculatedEndDate
          ? `Ostateczny termin: ${activeDeadline.calculatedEndDate}`
          : 'Termin nieustalony (wymaga podania daty doręczenia)',
        completionCriteria: 'Zapisanie potwierdzonej daty doręczenia w sejfie sprawy.',
        status: deliveryField?.status === 'confirmed' ? 'completed' : 'in_progress',
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Przygotowanie i weryfikacja projektu odwołania',
        why: 'Odwołanie musi wskazywać zarzuty i żądania oraz być skierowane do właściwego organu odwoławczego (np. SKO lub Wojewoda).',
        requiredDocuments: ['Projekt odwołania', 'Kopia zaskarżanej decyzji', 'Dowody popierające zarzuty'],
        decisionNeeded: 'Zatwierdź treść zarzutów i żądań w generatorze pism.',
        deadlineNotice: 'Przed upływem 14 dni od doręczenia.',
        completionCriteria: 'Wyeksportowanie gotowego projektu z sumą kontrolną SHA-256.',
        status: 'pending',
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Podpisanie, złożenie pisma i zachowanie dowodu nadania',
        why: 'Pismo musi zostać złożone za pośrednictwem organu I instancji, a dowód nadania gwarantuje zachowanie terminu (art. 57 KPA).',
        requiredDocuments: ['Podpisane odwołanie', 'Dowód nadania z placówki pocztowej lub UPO'],
        decisionNeeded: 'Wybierz kanał: placówka pocztowa lub platforma elektroniczna (e-Doręczenia/ePUAP).',
        deadlineNotice: 'Do końca dnia wyznaczonego w kalkulatorze terminu.',
        completionCriteria: 'Zarejestrowanie numeru nadania / UPO w sejfie sprawy.',
        status: 'pending',
      }
    );
  } else if (caseRecord.procedureType === 'consumer_dispute') {
    actionPlan.push(
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Zgromadzenie dowodu zakupu i opisu wady',
        why: 'Zgłoszenie reklamacyjne z tytułu niezgodności towaru z umową wymaga wykazania zakupu i istnienia wady.',
        requiredDocuments: ['Faktura / Paragon / Potwierdzenie płatności', 'Zdjęcia wady lub protokół'],
        decisionNeeded: 'Wybierz żądanie: naprawa, wymiana, obniżenie ceny lub odstąpienie od umowy.',
        deadlineNotice: 'Przedsiębiorca ma 14 dni na odpowiedź pod rygorem uznania reklamacji.',
        completionCriteria: 'Dołączenie dowodu zakupu do podkatalogu 03_Dowody.',
        status: 'completed',
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Wysłanie pisma reklamacyjnego',
        why: 'Formalne wezwanie przedsiębiorcy rozpoczyna bieg 14-dniowego terminu na odpowiedź.',
        requiredDocuments: ['Pismo reklamacyjne z żądaniem'],
        decisionNeeded: 'Wybierz sposób doręczenia: e-mail, list polecony lub formularz sklepu.',
        deadlineNotice: 'Termin na odpowiedź: 14 dni kalendarzowych.',
        completionCriteria: 'Zarejestrowanie potwierdzenia wysyłki.',
        status: 'pending',
      }
    );
  } else if (caseRecord.procedureType === 'contract_dispute') {
    actionPlan.push(
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Ustalenie niewykonania lub nienależytego wykonania umowy',
        why: 'Przed skierowaniem sprawy na drogę sądową należy udokumentować naruszenie umowy (art. 471 KC).',
        requiredDocuments: ['Umowa', 'Potwierdzenia przelewów', 'Korespondencja sms/e-mail'],
        decisionNeeded: 'Określ żądaną kwotę lub zakres poprawek.',
        deadlineNotice: 'Przedawnienie roszczeń: zależne od rodzaju umowy (zwykle 2-3 lata).',
        completionCriteria: 'Skompletowanie dowodów w katalogu sprawy.',
        status: 'completed',
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Wystosowanie przedsądowego wezwania do zapłaty / wykonania',
        why: 'Wezwanie przedsądowe zakreśla dłużnikowi ostateczny termin i jest warunkiem formalnym pozwu (art. 187 § 1 pkt 3 KPC).',
        requiredDocuments: ['Ostateczne przedsądowe wezwanie do zapłaty'],
        decisionNeeded: 'Wyznacz termin spełnienia świadczenia (np. 7 lub 14 dni).',
        deadlineNotice: 'Termin wskazany w wezwaniu.',
        completionCriteria: 'Wysłanie listem poleconym i rejestracja dowodu nadania.',
        status: 'pending',
      }
    );
  } else {
    actionPlan.push({
      id: 'step-gen-1',
      stepNumber: 1,
      title: 'Uporządkowanie dokumentów i określenie żądań',
      why: 'Precyzyjne sformułowanie celu pozwala dobrać właściwą procedurę i podstawę prawną.',
      requiredDocuments: ['Wszystkie posiadane pisma i notatki'],
      decisionNeeded: 'Wskaż oczekiwany rezultat sporu.',
      deadlineNotice: 'Zależny od wybranej ścieżki prawnej.',
      completionCriteria: 'Zatwierdzenie planu w aplikacji.',
      status: 'in_progress',
    });
  }

  return {
    id: `analysis-${caseRecord.id}`,
    caseId: caseRecord.id,
    problem: `Prowadzenie sprawy w trybie: ${caseRecord.procedureType}. Cel: ${caseRecord.goalDescription}`,
    establishedFacts: evidenceMatrix.map((e) => ({ fact: e.fact })),
    missingFacts: missingInformation.map((m) => m.question),
    claims: [
      {
        claim: `Użytkownik dochodzi roszczenia lub ochrony prawnej w sprawie obejmującej: ${institutionNames}.`,
        sourceId: legalSources.find((source) => source.verificationStatus === 'verified')?.id || 'UNVERIFIED-LOCAL-ANALYSIS',
        interpretationNote: legalSources.some((source) => source.verificationStatus === 'verified')
          ? 'Analiza robocza oparta na źródłach prawnych zapisanych w lokalnym sejfie; sprawdź ich zastosowanie do faktów sprawy.'
          : 'Analiza robocza bez potwierdzonego źródła prawnego. Zweryfikuj podstawę prawną i fakty przed działaniem.',
      },
    ],
    actionVariants: [
      {
        id: 'var-action-main',
        title: `Działanie formalne (${caseRecord.procedureType})`,
        conditions: 'Skompletowanie dowodów i dochowanie terminów.',
        risks: 'Wniesienie po terminie lub bez wymaganych opłat może skutkować odrzuceniem.',
        cost: 'Zależne od kanału złożenia i ewentualnych opłat skarbowych.',
        deadlines: activeDeadline?.calculatedEndDate || 'Do ustalenia',
        recommended: true,
      },
      {
        id: 'var-action-amicable',
        title: 'Polubowne rozwiązanie / negocjacje',
        conditions: 'Wola obu stron do zawarcia porozumienia lub ugody.',
        risks: 'Czas negocjacji nie przerywa biegu terminów zawitych w prawie administracyjnym.',
        cost: 'Brak kosztów formalnych.',
        deadlines: 'Zalecane przed upływem terminu na odwołanie.',
        recommended: false,
      },
    ],
    counterArguments: [
      'Druga strona może podnieść zarzut uchybienia terminu lub braku podstaw roszczenia.',
    ],
    verificationStatus: legalSources.some((source) => source.verificationStatus === 'verified') ? 'requires_lawyer' : 'unverified',
    parties,
    demands,
    evidenceMatrix,
    missingInformation,
    actionPlan,
  };
}
