/**
 * Obywatel - Local Document Vault (Expanded)
 * Conforms to docs/DATA_MODEL.md, docs/PRIVACY.md, ADR 0002 and .agents/skills/local-document-vault/SKILL.md
 *
 * Invariants:
 * - Original document bytes/hash are immutable.
 * - OCR extraction, corrections, and drafts form a version tree.
 * - Exact duplicates are flagged by content SHA-256.
 * - Multi-case linking supported without duplication.
 * - Real disk relative paths and subfolders tracked.
 */

import { computeSha256, encryptVault, decryptVault, EncryptedContainer } from './crypto';
import {
  Case,
  CaseSubfolder,
  DocumentRecord,
  DocumentRelation,
  DocumentVersion,
  ExtractedField,
  CaseEvent,
  CaseInstitution,
  ProceduralDeadline,
  LegalSource,
  LegalAnalysis,
  LetterDraft,
  InboxProposal,
  DiskOperationHistoryEntry,
  VaultManifest,
  parseVaultManifest,
} from './types';

/** Maksymalny rozmiar prywatnej notatki kontekstowej przy imporcie dokumentu. */
export const MAX_DOCUMENT_CONTEXT_NOTE_LENGTH = 2_000;

function normalizeDocumentContextNote(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new Error('Kontekst dokumentu musi być tekstem.');
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_DOCUMENT_CONTEXT_NOTE_LENGTH) {
    throw new Error(`Kontekst dokumentu może mieć najwyżej ${MAX_DOCUMENT_CONTEXT_NOTE_LENGTH} znaków.`);
  }
  return trimmed;
}

export class LocalVault {
  public vaultId: string;
  public workspacePath: string;
  public cases: Map<string, Case> = new Map();
  public documents: Map<string, DocumentRecord> = new Map();
  public documentVersions: Map<string, DocumentVersion> = new Map();
  public extractedFields: Map<string, ExtractedField> = new Map();
  public events: Map<string, CaseEvent> = new Map();
  public deadlines: Map<string, ProceduralDeadline> = new Map();
  public legalSources: Map<string, LegalSource> = new Map();
  public legalAnalyses: Map<string, LegalAnalysis> = new Map();
  public letters: Map<string, LetterDraft> = new Map();
  public relations: Map<string, DocumentRelation> = new Map();
  public inboxProposals: Map<string, InboxProposal> = new Map();
  public history: DiskOperationHistoryEntry[] = [];

  constructor(vaultId = `vault-${Date.now()}`, workspacePath = 'Moje_sprawy') {
    this.vaultId = vaultId;
    this.workspacePath = workspacePath;
  }

  // --- Case Management ---
  public createCase(params: {
    id?: string;
    title: string;
    goalDescription: string;
    procedureType: Case['procedureType'];
    opponentType?: Case['opponentType'];
    authorityOrOpponentName?: string;
    authorityName?: string;
    authorityJurisdictionReason: string;
    institutions?: CaseInstitution[];
  }): Case {
    const caseCount = this.cases.size + 1;
    const paddedNum = String(caseCount).padStart(4, '0');
    const id = params.id || `S-${paddedNum}`;
    const cleanTitle = params.title.replace(/[/\\?%*:|"<> ]/g, '_').substring(0, 30);
    const folderName = `${id}_${cleanTitle}`;
    const now = new Date().toISOString();
    const effectiveAuthorityName =
      params.authorityOrOpponentName || params.authorityName || 'Organ lub druga strona';
    const suppliedInstitutions: CaseInstitution[] = params.institutions?.length
      ? params.institutions.map((institution, index) => ({
          ...institution,
          id: institution.id || `institution-${id}-${index + 1}`,
          roles: institution.roles?.length ? institution.roles : ['opponent'] as CaseInstitution['roles'],
          active: institution.active !== false,
        }))
      : [{
          id: `institution-${id}-primary`,
          name: effectiveAuthorityName,
          kind: params.opponentType === 'public_authority' ? 'public_authority' : params.opponentType === 'company' ? 'company' : params.opponentType === 'individual' ? 'individual' : 'organization',
          roles: ['opponent'] as CaseInstitution['roles'],
          isPrimary: true,
          jurisdictionReason: params.authorityJurisdictionReason,
          active: true,
        } satisfies CaseInstitution];
    const primaryIndex = suppliedInstitutions.findIndex((institution) => institution.isPrimary) >= 0
      ? suppliedInstitutions.findIndex((institution) => institution.isPrimary)
      : 0;
    const institutions: CaseInstitution[] = suppliedInstitutions.map((institution, index) => ({
      ...institution,
      isPrimary: index === primaryIndex,
    }));

    const newCase: Case = {
      id,
      folderName,
      title: params.title,
      goalDescription: params.goalDescription,
      procedureType: params.procedureType,
      opponentType: params.opponentType || 'public_authority',
      authorityOrOpponentName: effectiveAuthorityName,
      authorityJurisdictionReason: params.authorityJurisdictionReason,
      institutions,
      status: 'intake',
      nextAction: 'Dodaj dokumenty sprawy lub sprawdź skrzynkę „Do uporządkowania”.',
      missingFacts: ['Brak potwierdzonej daty doręczenia pisma'],
      createdAt: now,
      updatedAt: now,
    };
    this.cases.set(id, newCase);
    return newCase;
  }

  // --- Document Import & Immutability ---
  public async importDocument(params: {
    caseId?: string;
    sourceDocumentId?: string;
    sourceVersionId?: string;
    sourcePageRange?: { start: number; end: number };
    type: DocumentRecord['type'];
    direction: DocumentRecord['direction'];
    origin: DocumentRecord['origin'];
    originalFileName: string;
    mimeType: string;
    content: string; // text or raw payload
    subfolder?: CaseSubfolder;
    diskRelativePath?: string;
    institutionIds?: string[];
    /** For browser imports, keep the raw-byte hash/size while storing only a
     * small text placeholder in the encrypted manifest. */
    originalSha256?: string;
    fileSize?: number;
    /** Opcjonalna, prywatna notatka użytkownika; nie jest treścią dowodu. */
    contextNote?: string;
  }): Promise<{ document: DocumentRecord; initialVersion: DocumentVersion; isDuplicate: boolean }> {
    const contentHash = params.originalSha256 || await computeSha256(params.content);
    const contextNote = normalizeDocumentContextNote(params.contextNote);

    // Wykrywanie dokładnego duplikatu według hasha SHA-256
    let isDuplicate = false;
    for (const doc of this.documents.values()) {
      if (doc.originalSha256 === contentHash) {
        isDuplicate = true;
        break;
      }
    }

    const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const versionId = `ver-${docId}-v1`;
    const now = new Date().toISOString();

    const targetCase = params.caseId ? this.cases.get(params.caseId) : null;
    const subfolder = params.subfolder || (targetCase ? '01_Otrzymane' : 'Do_uporzadkowania');
    const diskPath =
      params.diskRelativePath ||
      (targetCase
        ? `${this.workspacePath}/${targetCase.folderName}/${subfolder}/${params.originalFileName}`
        : `${this.workspacePath}/Do_uporzadkowania/${params.originalFileName}`);

    const initialVersion: DocumentVersion = {
      id: versionId,
      documentId: docId,
      versionNumber: 1,
      kind: 'original',
      contentSha256: contentHash,
      textPayload: params.content,
      createdAt: now,
      toolOrAuthor: 'Lokalny import użytkownika',
    };

    const docRecord: DocumentRecord = {
      id: docId,
      caseIds: params.caseId ? [params.caseId] : [],
      sourceDocumentId: params.sourceDocumentId,
      sourceVersionId: params.sourceVersionId,
      sourcePageRange: params.sourcePageRange,
      institutionIds: params.institutionIds,
      contextNote,
      type: params.type,
      direction: params.direction,
      origin: params.origin,
      originalFileName: params.originalFileName,
      mimeType: params.mimeType,
      fileSize: params.fileSize ?? new TextEncoder().encode(params.content).length,
      originalSha256: contentHash,
      diskRelativePath: diskPath,
      subfolder,
      createdAt: now,
      activeVersionId: versionId,
      isMissingOnDisk: false,
    };

    this.documentVersions.set(versionId, initialVersion);
    this.documents.set(docId, docRecord);

    if (targetCase) {
      targetCase.status = 'analyzing';
      targetCase.nextAction = 'Zweryfikuj odczytane pola z dokumentu.';
      targetCase.updatedAt = now;
    }

    return { document: docRecord, initialVersion, isDuplicate };
  }

  /**
   * Aktualizuje wyłącznie prywatną notatkę kontekstową dokumentu.
   * Oryginał, jego hash oraz drzewo wersji pozostają bez zmian.
   */
  public updateDocumentContext(documentId: string, contextNote?: string): DocumentRecord {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error(`Dokument o ID ${documentId} nie istnieje w sejfie.`);
    }

    const normalizedContext = normalizeDocumentContextNote(contextNote);
    if (normalizedContext === undefined) {
      delete document.contextNote;
    } else {
      document.contextNote = normalizedContext;
    }
    return document;
  }

  // --- Document Versioning (Korekta OCR / Edycja) ---
  public async addDocumentVersion(params: {
    documentId: string;
    kind: DocumentVersion['kind'];
    textPayload: string;
    toolOrAuthor: string;
    parentVersionId?: string;
    pageRange?: { start: number; end: number };
  }): Promise<DocumentVersion> {
    const doc = this.documents.get(params.documentId);
    if (!doc) {
      throw new Error(`Dokument o ID ${params.documentId} nie istnieje w sejfie.`);
    }

    const existingVersions = Array.from(this.documentVersions.values()).filter(
      (v) => v.documentId === params.documentId
    );
    const nextVersionNumber = existingVersions.length + 1;
    const versionId = `ver-${params.documentId}-v${nextVersionNumber}`;
    const hash = await computeSha256(params.textPayload);
    const now = new Date().toISOString();

    const parentVersionId = params.parentVersionId || doc.activeVersionId;
    const parentVersion = this.documentVersions.get(parentVersionId);
    const newVersion: DocumentVersion = {
      id: versionId,
      documentId: params.documentId,
      versionNumber: nextVersionNumber,
      parentVersionId,
      kind: params.kind,
      contentSha256: hash,
      textPayload: params.textPayload,
      createdAt: now,
      toolOrAuthor: params.toolOrAuthor,
      pageRange: params.pageRange,
      pageCount: parentVersion?.pageCount,
      sourceOriginalSha256: parentVersion?.sourceOriginalSha256,
    };

    this.documentVersions.set(versionId, newVersion);
    doc.activeVersionId = versionId;
    return newVersion;
  }

  // --- Linking Document to Multiple Cases ---
  public linkDocumentToCase(documentId: string, caseId: string): void {
    const doc = this.documents.get(documentId);
    const targetCase = this.cases.get(caseId);
    if (!doc || !targetCase) return;

    if (!doc.caseIds.includes(caseId)) {
      doc.caseIds.push(caseId);
    }
  }

  // --- Relations ---
  public addRelation(relation: DocumentRelation): void {
    this.relations.set(relation.id, relation);
  }

  // --- Field Confirmation / Correction ---
  public recordExtractedField(field: ExtractedField): void {
    this.extractedFields.set(field.id, field);
  }

  public confirmField(fieldId: string, confirmedValue: string, confirmedBy = 'Użytkownik'): ExtractedField {
    const field = this.extractedFields.get(fieldId);
    if (!field) {
      throw new Error(`Pole o ID ${fieldId} nie istnieje.`);
    }
    field.status = 'confirmed';
    field.parsedValue = confirmedValue;
    field.confirmedBy = confirmedBy;
    field.confirmedAt = new Date().toISOString();
    return field;
  }

  public disputeField(fieldId: string, reason: string): ExtractedField {
    const field = this.extractedFields.get(fieldId);
    if (!field) {
      throw new Error(`Pole o ID ${fieldId} nie istnieje.`);
    }
    field.status = 'disputed';
    field.disputeReason = reason;
    return field;
  }

  // --- Events and Deadlines ---
  public addEvent(event: CaseEvent): void {
    this.events.set(event.id, event);
  }

  public setDeadline(deadline: ProceduralDeadline): void {
    this.deadlines.set(deadline.id, deadline);
  }

  // --- Legal Analysis and Letter ---
  public addLegalSource(source: LegalSource): void {
    this.legalSources.set(source.id, source);
  }

  public setLegalAnalysis(analysis: LegalAnalysis): void {
    this.legalAnalyses.set(analysis.id, analysis);
    this.legalAnalyses.set(analysis.caseId, analysis);
  }

  public setLetter(letter: LetterDraft): void {
    this.letters.set(letter.id, letter);
  }

  // --- Inbox Proposals & Moving ---
  public recordInboxProposal(proposal: InboxProposal): void {
    this.inboxProposals.set(proposal.id, proposal);
  }

  public applyInboxProposal(proposalId: string, targetCaseId: string, targetSubfolder: CaseSubfolder): void {
    const proposal = this.inboxProposals.get(proposalId);
    if (!proposal) return;

    const doc = this.documents.get(proposal.documentId);
    const targetCase = this.cases.get(targetCaseId);
    if (!doc || !targetCase) return;

    const oldPath = doc.diskRelativePath || `${this.workspacePath}/Do_uporzadkowania/${doc.originalFileName}`;
    const newPath = `${this.workspacePath}/${targetCase.folderName}/${targetSubfolder}/${doc.originalFileName}`;

    // Akceptacja propozycji nie może odłączać dokumentu od innych spraw.
    // Jeden oryginał może być wspólnym dowodem w wielu sprawach.
    doc.caseIds = Array.from(new Set([...doc.caseIds, targetCase.id]));
    doc.subfolder = targetSubfolder;
    doc.diskRelativePath = newPath;

    proposal.proposedCaseId = targetCase.id;
    proposal.proposedSubfolder = targetSubfolder;
    proposal.isReviewed = true;

    this.history.push({
      id: `op-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'move',
      documentId: doc.id,
      sourcePath: oldPath,
      destinationPath: newPath,
      description: `Przeniesiono dokument ${doc.originalFileName} do sprawy ${targetCase.title} (${targetSubfolder}).`,
      canUndo: true,
    });
  }

  public undoLastOperation(): boolean {
    const lastOp = this.history.filter((h) => h.canUndo).pop();
    if (!lastOp) return false;

    if (lastOp.documentId && lastOp.action === 'move') {
      const doc = this.documents.get(lastOp.documentId);
      if (doc) {
        doc.diskRelativePath = lastOp.sourcePath;
        if (lastOp.sourcePath.includes('Do_uporzadkowania')) {
          doc.subfolder = 'Do_uporzadkowania';
          doc.caseIds = [];
        }
      }
    }
    lastOp.canUndo = false;
    return true;
  }

  // --- Export and Backup ---
  public toManifest(): VaultManifest {
    return {
      manifestVersion: '2.1',
      vaultId: this.vaultId,
      workspacePath: this.workspacePath,
      createdAt: new Date().toISOString(),
      cases: Array.from(this.cases.values()),
      documents: Array.from(this.documents.values()),
      documentVersions: Array.from(this.documentVersions.values()),
      extractedFields: Array.from(this.extractedFields.values()),
      events: Array.from(this.events.values()),
      deadlines: Array.from(this.deadlines.values()),
      legalSources: Array.from(this.legalSources.values()),
      legalAnalyses: Array.from(this.legalAnalyses.values()),
      letters: Array.from(this.letters.values()),
      relations: Array.from(this.relations.values()),
      inboxProposals: Array.from(this.inboxProposals.values()),
      history: this.history,
    };
  }

  public async exportEncryptedBackup(passphrase: string): Promise<EncryptedContainer> {
    const manifest = this.toManifest();
    const json = JSON.stringify(manifest, null, 2);
    return encryptVault(json, passphrase);
  }

  public static async restoreFromEncryptedBackup(
    container: EncryptedContainer,
    passphrase: string
  ): Promise<LocalVault> {
    const decryptedJson = await decryptVault(container, passphrase);
    let parsed: unknown;
    try {
      parsed = JSON.parse(decryptedJson) as unknown;
    } catch {
      throw new Error('Kopia została odszyfrowana, ale zawiera nieprawidłowy JSON.');
    }
    return LocalVault.fromManifest(parseVaultManifest(parsed));
  }

  public static fromManifest(manifest: VaultManifest): LocalVault {
    const vault = new LocalVault(manifest.vaultId, manifest.workspacePath || 'Moje_sprawy');
    manifest.cases.forEach((c) => {
      // Migracja starszych sejfów: pojedynczy organ staje się pierwszą
      // instytucją, a stare pole pozostaje dla kompatybilności modułów.
      const sourceInstitutions: CaseInstitution[] = c.institutions?.length
        ? c.institutions
        : [{
            id: `institution-${c.id}-primary`,
            name: c.authorityOrOpponentName,
            kind: c.opponentType === 'public_authority' ? 'public_authority' : c.opponentType === 'company' ? 'company' : c.opponentType === 'individual' ? 'individual' : 'organization',
            roles: ['opponent'] as CaseInstitution['roles'],
            isPrimary: true,
            jurisdictionReason: c.authorityJurisdictionReason,
            active: true,
          } satisfies CaseInstitution];
      const firstPrimaryIndex = Math.max(0, sourceInstitutions.findIndex((institution) => institution.isPrimary));
      const migratedInstitutions = sourceInstitutions.map((institution, index) => ({
        ...institution,
        id: institution.id || `institution-${c.id}-${index + 1}`,
        roles: institution.roles?.length ? institution.roles : ['opponent'] as CaseInstitution['roles'],
        isPrimary: index === firstPrimaryIndex,
        active: institution.active !== false,
      }));
      vault.cases.set(c.id, { ...c, institutions: migratedInstitutions });
    });
    manifest.documents.forEach((d) => vault.documents.set(d.id, d));
    manifest.documentVersions.forEach((v) => vault.documentVersions.set(v.id, v));
    manifest.extractedFields.forEach((f) => vault.extractedFields.set(f.id, f));
    manifest.events.forEach((e) => vault.events.set(e.id, e));
    manifest.deadlines.forEach((dl) => vault.deadlines.set(dl.id, dl));
    manifest.legalSources.forEach((s) => vault.legalSources.set(s.id, s));
    manifest.legalAnalyses.forEach((a) => vault.legalAnalyses.set(a.id, a));
    manifest.letters.forEach((l) => vault.letters.set(l.id, l));
    if (manifest.relations) {
      manifest.relations.forEach((r) => vault.relations.set(r.id, r));
    }
    if (manifest.inboxProposals) {
      manifest.inboxProposals.forEach((p) => vault.inboxProposals.set(p.id, p));
    }
    if (manifest.history) {
      vault.history = manifest.history;
    }
    return vault;
  }
}
