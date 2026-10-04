/**
 * Obywatel - Comprehensive Domain Types
 * Conforms to docs/DATA_MODEL.md, docs/PRIVACY.md, docs/LEGAL_KNOWLEDGE.md, docs/PRODUCT.md
 * and ADR 0002 for Real Disk Storage and Modular Procedures.
 */

export type CaseStatus =
  | 'intake'
  | 'analyzing'
  | 'action_ready'
  | 'letter_drafted'
  | 'prepared'
  | 'submitted'
  | 'closed';

export type ProcedureType =
  | 'administrative'
  | 'public_information'
  | 'consumer_dispute'
  | 'contract_dispute'
  | 'complaint_or_petition'
  | 'social_interest'
  | 'tax_dispute'
  | 'social_insurance'
  | 'labor_dispute'
  | 'other';

export type OpponentType =
  | 'public_authority'
  | 'company'
  | 'individual'
  | 'institution';

/**
 * Instytucja lub inna strona występująca w sprawie. Jedna sprawa może mieć
 * wiele takich rekordów (np. organ I instancji, organ odwoławczy i organ
 * pośredniczący). Dane pozostają częścią lokalnego, szyfrowanego manifestu.
 */
export type CaseInstitutionKind =
  | 'public_authority'
  | 'office'
  | 'court'
  | 'company'
  | 'organization'
  | 'individual'
  | 'other';

export type CaseInstitutionRole =
  | 'opponent'
  | 'issuing_authority'
  | 'appeal_authority'
  | 'intermediary'
  | 'recipient'
  | 'consulted'
  | 'witness'
  | 'expert'
  | 'other';

export interface CaseInstitution {
  id: string;
  name: string;
  kind: CaseInstitutionKind;
  roles: CaseInstitutionRole[];
  isPrimary?: boolean;
  addressOrChannel?: string;
  jurisdictionReason?: string;
  caseSignature?: string;
  sourceDocumentIds?: string[];
  active?: boolean;
}

export interface Case {
  id: string; // e.g. "S-0001"
  folderName: string; // e.g. "S-0001_Pozwolenie_na_budowe"
  title: string;
  goalDescription: string;
  procedureType: ProcedureType;
  opponentType: OpponentType;
  authorityOrOpponentName: string;
  authorityJurisdictionReason: string;
  /**
   * New multi-institution model. Optional to allow old encrypted manifests to
   * be opened and migrated without losing the legacy singular fields above.
   */
  institutions?: CaseInstitution[];
  status: CaseStatus;
  nextAction: string;
  missingFacts: string[];
  createdAt: string;
  updatedAt: string;
}

/** Zwraca aktywne instytucje także dla starych spraw bez pola institutions. */
export function getCaseInstitutions(caseRecord: Case): CaseInstitution[] {
  if (caseRecord.institutions?.length) {
    const activeInstitutions = caseRecord.institutions.filter((institution) => institution.active !== false);
    if (activeInstitutions.length) return activeInstitutions;
  }
  return [{
    id: `institution-${caseRecord.id}-primary`,
    name: caseRecord.authorityOrOpponentName,
    kind: caseRecord.opponentType === 'public_authority'
      ? 'public_authority'
      : caseRecord.opponentType === 'company'
      ? 'company'
      : caseRecord.opponentType === 'individual'
      ? 'individual'
      : 'organization',
    roles: ['opponent'],
    isPrimary: true,
    jurisdictionReason: caseRecord.authorityJurisdictionReason,
    active: true,
  }];
}

export function getPrimaryCaseInstitution(caseRecord: Case): CaseInstitution {
  const institutions = getCaseInstitutions(caseRecord);
  return institutions.find((institution) => institution.isPrimary) || institutions[0];
}

export type DocumentType =
  | 'decision'
  | 'request'
  | 'notification'
  | 'summons'
  | 'appeal'
  | 'contract'
  | 'complaint'
  | 'invoice'
  | 'proof_of_delivery'
  | 'other';

export type CorrespondenceDirection = 'incoming' | 'outgoing' | 'internal';

export type DocumentOrigin =
  | 'scan'
  | 'pdf_digital'
  | 'photo'
  | 'citizen_draft'
  | 'official_upo'
  | 'disk_file';

export type CaseSubfolder =
  | '00_Plan_i_opis'
  | '01_Otrzymane'
  | '02_Wyslane'
  | '03_Dowody'
  | '04_Potwierdzenia'
  | '05_Projekty_pism'
  | '06_Prawo_i_analizy'
  | '07_Wynik_sprawy'
  | 'Do_uporzadkowania';

export interface DocumentRecord {
  id: string;
  caseIds: string[];
  /** Instytucje, których dotyczy korespondencja lub dowód. */
  institutionIds?: string[];
  type: DocumentType;
  direction: CorrespondenceDirection;
  origin: DocumentOrigin;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  originalSha256: string;
  diskRelativePath?: string; // e.g. "Moje_sprawy/S-0001_Decyzja/01_Otrzymane/pismo.pdf"
  subfolder?: CaseSubfolder;
  createdAt: string;
  activeVersionId: string;
  isMissingOnDisk?: boolean;
}

export type DocumentVersionKind =
  | 'original'
  | 'ocr_extracted'
  | 'user_corrected'
  | 'draft'
  | 'exported_pdf'
  | 'redacted'
  | 'logical_subdoc';

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  parentVersionId?: string;
  kind: DocumentVersionKind;
  contentSha256: string;
  textPayload?: string;
  createdAt: string;
  toolOrAuthor: string;
  pageRange?: { start: number; end: number };
}

export type RelationType =
  | 'odpowiada_na'
  | 'zalacznik_do'
  | 'potwierdza_zlozenie'
  | 'potwierdza_doreczenie'
  | 'nowa_wersja'
  | 'wspiera_twierdzenie'
  | 'podwaza_twierdzenie'
  | 'to_samo_zdarzenie';

export interface DocumentRelation {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  relationType: RelationType;
  rationale: string;
  isConfirmedByUser: boolean;
  createdAt: string;
}

export type FieldStatus = 'unknown' | 'proposed' | 'confirmed' | 'disputed';

export type ExtractedFieldName =
  | 'case_signature'
  | 'issuing_authority'
  | 'opponent_name'
  | 'document_date'
  | 'delivery_date'
  | 'appeal_deadline_days'
  | 'appeal_body'
  | 'instruction_text'
  | 'contract_number'
  | 'disputed_amount';

export interface ExtractedField {
  id: string;
  documentId: string;
  versionId: string;
  fieldName: ExtractedFieldName;
  label: string;
  rawValue: string;
  parsedValue?: string;
  status: FieldStatus;
  pageNumber: number;
  fragmentSnippet: string;
  ocrConfidence: number; // 0.0 - 1.0
  confirmedBy?: string;
  confirmedAt?: string;
  disputeReason?: string;
}

export type EventType =
  | 'document_issued'
  | 'document_sent'
  | 'document_delivered'
  | 'citizen_action'
  | 'deadline_calculated'
  | 'complaint_filed'
  | 'payment_due';

export type DatePrecision = 'exact' | 'uncertain' | 'unknown';

export interface CaseEvent {
  id: string;
  caseId: string;
  institutionId?: string;
  type: EventType;
  title: string;
  date: string; // YYYY-MM-DD or 'unknown'
  datePrecision: DatePrecision;
  documentVersionId?: string;
  proofDocumentId?: string;
  isConfirmed: boolean;
  notes?: string;
}

export type DeadlineStatus = 'unknown' | 'active' | 'expired' | 'suspended';

export interface ProceduralDeadline {
  id: string;
  caseId: string;
  institutionId?: string;
  baseEventId: string;
  ruleVersion: string;
  legalBasisId: string;
  legalStateDate: string;
  daysCount: number;
  startDate: string | 'unknown';
  calculatedEndDate: string | 'unknown';
  status: DeadlineStatus;
  assumptions: string[];
  calculationLog: string[];
  isWeekendOrHolidayShifted: boolean;
  actionRequired: string;
}

export type LegalSourceType =
  | 'statute'
  | 'regulation'
  | 'court_ruling'
  | 'eli_act';

export interface LegalSource {
  id: string;
  sourceType: LegalSourceType;
  officialUrl: string;
  publisher: string;
  actOrCaseId: string; // e.g. Dz.U. 1960 nr 30 poz. 168
  articleOrPage: string; // e.g. art. 57 § 1-4
  versionId: string;
  effectiveFrom: string;
  effectiveTo: string | 'in_force';
  retrievedAt: string;
  contentHash: string;
  verificationStatus: 'verified' | 'unverified' | 'superseded' | 'disputed';
  supportsClaim: string;
  quoteText: string;
}

export interface CaseParty {
  id: string;
  institutionId?: string;
  name: string;
  role: 'citizen' | 'opponent' | 'authority' | 'witness' | 'expert';
  stance: string;
  identifiedInDocId?: string;
}

export interface CaseDemand {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'granted' | 'rejected' | 'disputed';
  legalBasis?: string;
}

export interface EvidenceMatrixItem {
  id: string;
  fact: string;
  supportedByDocId?: string;
  supportedBySnippet?: string;
  contradictedByDocId?: string;
  contradictedBySnippet?: string;
  confidence: 'proven' | 'probable' | 'disputed' | 'unproven';
}

export interface ActionPlanStep {
  id: string;
  stepNumber: number;
  title: string;
  why: string;
  requiredDocuments: string[];
  decisionNeeded: string;
  deadlineNotice: string;
  completionCriteria: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface MissingInformationItem {
  id: string;
  question: string;
  neededDocType: string;
  whyImportant: string;
}

export interface LegalAnalysis {
  id: string;
  caseId: string;
  problem: string;
  establishedFacts: {
    fact: string;
    proofDocVersionId?: string;
    page?: number;
  }[];
  missingFacts: string[];
  claims: {
    claim: string;
    sourceId: string;
    interpretationNote: string;
  }[];
  actionVariants: {
    id: string;
    title: string;
    conditions: string;
    risks: string;
    cost: string;
    deadlines: string;
    recommended: boolean;
  }[];
  counterArguments: string[];
  verificationStatus: 'verified' | 'requires_lawyer' | 'unverified';
  parties: CaseParty[];
  demands: CaseDemand[];
  evidenceMatrix: EvidenceMatrixItem[];
  missingInformation: MissingInformationItem[];
  actionPlan: ActionPlanStep[];
}

export type LetterStatus =
  | 'draft'
  | 'prepared'
  | 'exported'
  | 'sent_by_user'
  | 'receipt_added'
  | 'confirmed_by_receipt';

export interface LetterChecklistItem {
  id: string;
  item: string;
  checked: boolean;
  isMandatory: boolean;
  verificationDetail: string;
}

export type LetterType =
  | 'odwolanie'
  | 'wniosek_o_informacje'
  | 'ponaglenie'
  | 'reklamacja_konsumencka'
  | 'wezwanie_do_zaplaty'
  | 'odwolanie_podatkowe'
  | 'odwolanie_zus'
  | 'wezwanie_pracownicze'
  | 'skarga';

export interface DiskFileInfo {
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
}

export interface LetterDraft {
  id: string;
  caseId: string;
  title: string;
  letterType: LetterType;
  recipient: {
    name: string;
    addressOrChannel: string;
    intermediaryAuthority?: string;
    institutionId?: string;
    intermediaryInstitutionId?: string;
  };
  sender: {
    placeholderName: string;
    contactChannel: string;
  };
  caseSignature: string;
  demands: string[];
  factualBasis: string;
  legalJustification: string;
  attachments: {
    id: string;
    title: string;
    documentId?: string;
    included: boolean;
  }[];
  status: LetterStatus;
  checklist: LetterChecklistItem[];
  exportedContent?: string;
  exportSha256?: string;
  deliveryReceiptNumber?: string;
  deliveryProofOrigin?: string;
  deliveryDate?: string;
  userSubmissionReceipt?: {
    channel: string;
    submissionDate: string;
    referenceNumber: string;
    receiptSha256: string;
  };
}

export interface InboxProposal {
  id: string;
  documentId: string;
  documentTitle: string;
  originalFileName: string;
  proposedCaseId?: string;
  proposedCaseIds?: string[];
  matchedInstitutionIds?: string[];
  proposedSubfolder: CaseSubfolder;
  confidence: number;
  rationale: string;
  clarificationQuestion?: string;
  isReviewed: boolean;
}

export interface DiskOperationHistoryEntry {
  id: string;
  timestamp: string;
  action: 'move' | 'create_folder' | 'rename' | 'link_document' | 'split_pdf';
  documentId?: string;
  sourcePath: string;
  destinationPath: string;
  description: string;
  canUndo: boolean;
}

export interface GeminiDisclosurePayload {
  operationName: string;
  recipient: string;
  targetEndpoint: string;
  purpose: string;
  dataScope: {
    field: string;
    value: string;
    isRedacted: boolean;
    isRequired: boolean;
  }[];
  exactJsonPayload: string;
  userConsentGranted: boolean;
}

export interface VaultManifest {
  manifestVersion: string;
  vaultId: string;
  workspacePath?: string;
  createdAt: string;
  cases: Case[];
  documents: DocumentRecord[];
  documentVersions: DocumentVersion[];
  extractedFields: ExtractedField[];
  events: CaseEvent[];
  deadlines: ProceduralDeadline[];
  legalSources: LegalSource[];
  legalAnalyses: LegalAnalysis[];
  letters: LetterDraft[];
  relations: DocumentRelation[];
  inboxProposals: InboxProposal[];
  history: DiskOperationHistoryEntry[];
  exportedAt?: string;
}

/**
 * Bounds for data parsed from an untrusted encrypted backup. The encrypted
 * payload is authenticated, but a valid key must not turn malformed JSON or
 * an unexpectedly huge collection into an unbounded in-memory operation.
 */
export const MAX_MANIFEST_COLLECTION_ITEMS = 100_000;

function isManifestRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBoundedArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length <= MAX_MANIFEST_COLLECTION_ITEMS;
}

function isBoundedRecordArray(value: unknown): value is Record<string, unknown>[] {
  if (!isBoundedArray(value)) return false;
  return value.every((entry) => isManifestRecord(entry) && typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 256);
}

function isStringArray(value: unknown): value is string[] {
  return isBoundedArray(value) && value.every((entry) => typeof entry === 'string');
}

/** Minimal schema guard used before restoring a decrypted backup. */
export function isVaultManifest(value: unknown): value is VaultManifest {
  if (!isManifestRecord(value)) return false;
  if (
    typeof value.manifestVersion !== 'string' ||
    typeof value.vaultId !== 'string' ||
    typeof value.createdAt !== 'string' ||
    (value.workspacePath !== undefined && typeof value.workspacePath !== 'string')
  ) {
    return false;
  }

  const requiredCollections = [
    value.cases,
    value.documents,
    value.documentVersions,
    value.extractedFields,
    value.events,
    value.deadlines,
    value.legalSources,
    value.legalAnalyses,
    value.letters,
  ];
  if (!requiredCollections.every(isBoundedRecordArray)) return false;

  if (!(value.cases as Record<string, unknown>[]).every((entry) => (
    typeof entry.title === 'string' &&
    typeof entry.authorityOrOpponentName === 'string' &&
    typeof entry.authorityJurisdictionReason === 'string' &&
    isStringArray(entry.missingFacts) &&
    (entry.institutions === undefined || (
      isBoundedRecordArray(entry.institutions) &&
      entry.institutions.every((institution) => typeof institution.name === 'string' && isStringArray(institution.roles))
    ))
  ))) return false;
  if (!(value.documents as Record<string, unknown>[]).every((entry) => (
    typeof entry.originalFileName === 'string' &&
    typeof entry.mimeType === 'string' &&
    typeof entry.activeVersionId === 'string' &&
    isStringArray(entry.caseIds)
  ))) return false;
  if (!(value.documentVersions as Record<string, unknown>[]).every((entry) => (
    typeof entry.documentId === 'string' &&
    typeof entry.contentSha256 === 'string' &&
    (entry.textPayload === undefined || typeof entry.textPayload === 'string')
  ))) return false;

  // These collections were added after the first backup format. Missing
  // values are normalized by LocalVault.restoreFromEncryptedBackup().
  return (
    (value.relations === undefined || isBoundedRecordArray(value.relations)) &&
    (value.inboxProposals === undefined || isBoundedRecordArray(value.inboxProposals)) &&
    (value.history === undefined || isBoundedRecordArray(value.history))
  );
}

/** Validate and normalize a decrypted backup manifest for callers outside LocalVault. */
export function parseVaultManifest(value: unknown): VaultManifest {
  if (!isVaultManifest(value)) {
    throw new Error('Nieprawidłowy lub niekompletny manifest zaszyfrowanej kopii.');
  }
  return {
    ...value,
    relations: value.relations ?? [],
    inboxProposals: value.inboxProposals ?? [],
    history: value.history ?? [],
  };
}
