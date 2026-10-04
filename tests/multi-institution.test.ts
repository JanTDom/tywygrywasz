import { describe, expect, it } from 'vitest';
import { buildCompleteCaseAnalysis } from '../src/domain/case-analysis';
import { IntelligentClassifier } from '../src/domain/intelligent-classifier';
import { LocalVault } from '../src/domain/vault';
import { Case, DocumentRecord, VaultManifest, getCaseInstitutions } from '../src/domain/types';

const baseCase = (id: string, title: string, institutionName: string): Case => ({
  id,
  folderName: `${id}_sprawa`,
  title,
  goalDescription: 'Ustalenie prawidłowego działania organu',
  procedureType: 'administrative',
  opponentType: 'public_authority',
  authorityOrOpponentName: institutionName,
  authorityJurisdictionReason: 'Właściwość organu',
  status: 'analyzing',
  nextAction: 'Zweryfikuj dokumenty',
  missingFacts: [],
  createdAt: '2026-10-04T10:00:00Z',
  updatedAt: '2026-10-04T10:00:00Z',
});

const inboxDocument: DocumentRecord = {
  id: 'doc-wieloinstytucyjny',
  caseIds: [],
  type: 'other',
  direction: 'incoming',
  origin: 'scan',
  originalFileName: 'pismo.pdf',
  mimeType: 'application/pdf',
  fileSize: 100,
  originalSha256: 'hash',
  createdAt: '2026-10-04T10:00:00Z',
  activeVersionId: 'version-1',
};

describe('Wiele instytucji w jednej sprawie', () => {
  it('przechowuje role trzech instytucji i uwzględnia je w analizie', () => {
    const vault = new LocalVault('multi-institution-vault');
    const caseRecord = vault.createCase({
      title: 'Odwołanie od decyzji',
      goalDescription: 'Uchylenie decyzji',
      procedureType: 'administrative',
      opponentType: 'public_authority',
      authorityOrOpponentName: 'Urząd Dzielnicy',
      authorityJurisdictionReason: 'Organ I instancji',
      institutions: [
        { id: 'inst-issuing', name: 'Urząd Dzielnicy', kind: 'office', roles: ['issuing_authority'], isPrimary: true },
        { id: 'inst-appeal', name: 'Samorządowe Kolegium Odwoławcze', kind: 'public_authority', roles: ['appeal_authority'] },
        { id: 'inst-intermediary', name: 'Biuro Podawcze', kind: 'office', roles: ['intermediary'] },
      ],
    });

    expect(getCaseInstitutions(caseRecord).map((institution) => institution.name)).toEqual([
      'Urząd Dzielnicy',
      'Samorządowe Kolegium Odwoławcze',
      'Biuro Podawcze',
    ]);

    const analysis = buildCompleteCaseAnalysis({
      caseRecord,
      documents: [],
      extractedFields: [],
      events: [],
      deadlines: [],
    });
    expect(analysis.parties).toHaveLength(4);
    expect(analysis.parties.slice(1).map((party) => party.institutionId)).toEqual([
      'inst-issuing',
      'inst-appeal',
      'inst-intermediary',
    ]);
  });

  it('migruje starszą sprawę z pojedynczym organem do listy instytucji', () => {
    const vault = new LocalVault('legacy-vault');
    vault.createCase({
      title: 'Stara sprawa',
      goalDescription: 'Cel',
      procedureType: 'administrative',
      authorityName: 'Stary organ',
      authorityJurisdictionReason: 'Właściwość',
    });
    const manifest = vault.toManifest();
    manifest.manifestVersion = '2.0';
    manifest.cases = manifest.cases.map((caseRecord) => {
      const { institutions: _institutions, ...legacyCase } = caseRecord;
      return legacyCase;
    }) as VaultManifest['cases'];

    const restored = LocalVault.fromManifest(manifest);
    expect(restored.cases.get('S-0001')?.institutions?.[0].name).toBe('Stary organ');
    expect(restored.cases.get('S-0001')?.institutions?.[0].isPrimary).toBe(true);
  });

  it('nie wybiera po cichu pierwszej sprawy, gdy dokument pasuje do dwóch instytucji', () => {
    const classifier = new IntelligentClassifier();
    const first = baseCase('S-0001', 'Pozwolenie budowlane', 'Urząd Dzielnicy');
    first.institutions = [{ id: 'inst-1', name: 'Urząd Dzielnicy', kind: 'office', roles: ['issuing_authority'], isPrimary: true }];
    const second = baseCase('S-0002', 'Odwołanie podatkowe', 'Urząd Skarbowy');
    second.institutions = [{ id: 'inst-2', name: 'Urząd Skarbowy', kind: 'office', roles: ['issuing_authority'], isPrimary: true }];

    const result = classifier.classifyDocument(
      inboxDocument,
      'Pismo wskazuje: Urząd Dzielnicy oraz Urząd Skarbowy.',
      { cases: [first, second], existingDocuments: [], relations: [] },
    );


    expect(result.proposal.proposedCaseId).toBeUndefined();
    expect(result.proposal.proposedCaseIds).toEqual(['S-0001', 'S-0002']);
    expect(result.proposal.clarificationQuestion).toContain('kilku spraw');
  });

  it('zachowuje wcześniejsze powiązanie dokumentu przy akceptacji propozycji', () => {
    const vault = new LocalVault('shared-document-vault');
    const first = vault.createCase({ title: 'Pierwsza', goalDescription: 'Cel', procedureType: 'administrative', authorityName: 'Organ A', authorityJurisdictionReason: 'Właściwość' });
    const second = vault.createCase({ title: 'Druga', goalDescription: 'Cel', procedureType: 'administrative', authorityName: 'Organ B', authorityJurisdictionReason: 'Właściwość' });
    vault.documents.set(inboxDocument.id, { ...inboxDocument, caseIds: [first.id], diskRelativePath: 'Moje_sprawy/plik.pdf', subfolder: 'Do_uporzadkowania' });
    vault.recordInboxProposal({ id: 'proposal-1', documentId: inboxDocument.id, documentTitle: 'pismo.pdf', originalFileName: 'pismo.pdf', proposedCaseId: second.id, proposedSubfolder: '01_Otrzymane', confidence: 0.8, rationale: 'Test', isReviewed: false });

    vault.applyInboxProposal('proposal-1', second.id, '01_Otrzymane');
    expect(vault.documents.get(inboxDocument.id)?.caseIds).toEqual([first.id, second.id]);
  });
});
