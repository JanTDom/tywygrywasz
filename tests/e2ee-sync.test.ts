import { describe, it, expect } from 'vitest';
import { E2EESyncEngine, SyncRecordPayload } from '../src/domain/sync-engine';
import { VaultManifest } from '../src/domain/types';

describe('E2EESyncEngine (Zero-Knowledge AES-GCM Client Sync)', () => {
  const syncEngine = new E2EESyncEngine('citizen-user-01', 'device-test-01');
  const testPassphrase = 'SuperMocneHasloSejfu2026!#$';

  const mockManifest: VaultManifest = {
    manifestVersion: '1.0',
    vaultId: 'sejf-test-sync',
    workspacePath: 'Moje_sprawy',
    createdAt: '2026-10-04T12:00:00Z',
    cases: [
      {
        id: 'c-sync-01',
        folderName: 'S-0001_Test',
        title: 'Sprawa synchronizowana',
        procedureType: 'administrative',
        opponentType: 'public_authority',
        authorityOrOpponentName: 'Urząd Miejski',
        goalDescription: 'Test synchronizacji',
        authorityJurisdictionReason: 'Testowa właściwość organu',
        status: 'analyzing',
        nextAction: 'Zweryfikuj dokumenty testowe.',
        missingFacts: [],
        createdAt: '2026-10-04T12:00:00Z',
        updatedAt: '2026-10-04T12:00:00Z',
      },
    ],
    documents: [],
    documentVersions: [],
    extractedFields: [],
    events: [],
    deadlines: [],
    legalSources: [],
    legalAnalyses: [],
    letters: [],
    relations: [],
    inboxProposals: [],
    history: [],
  };

  it('szyfruje manifest do nieczytelnego szyfrogramu z unikalnym wektorem IV i solą', async () => {
    const payload1 = await syncEngine.prepareSyncPayload(mockManifest, testPassphrase);
    const payload2 = await syncEngine.prepareSyncPayload(mockManifest, testPassphrase);

    expect(payload1.encryptedContainer.ciphertextHex).toBeDefined();
    expect(payload1.encryptedContainer.ivHex.length).toBe(24); // 12 bajtów IV w hex
    expect(payload1.encryptedContainer.saltHex.length).toBe(32); // 16 bajtów soli w hex
    expect(payload1.manifestSha256).toBeUndefined();
    expect(payload1.encryptedContainer.manifestSha256).toBeUndefined();
    expect(payload1.revision).not.toBe(payload2.revision);

    // Dwa kolejne szyfrowania tego samego manifestu dają różne szyfrogramy (unikalny nonce IV)
    expect(payload1.encryptedContainer.ciphertextHex).not.toBe(payload2.encryptedContainer.ciphertextHex);
    expect(payload1.encryptedContainer.ivHex).not.toBe(payload2.encryptedContainer.ivHex);
  });

  it('poprawnie odszyfrowuje manifest przy użyciu właściwego hasła', async () => {
    const payload = await syncEngine.prepareSyncPayload(mockManifest, testPassphrase);
    const decryptedManifest = await syncEngine.decryptSyncPayload(payload, testPassphrase);

    expect(decryptedManifest.vaultId).toBe(mockManifest.vaultId);
    expect(decryptedManifest.cases.length).toBe(1);
    expect(decryptedManifest.cases[0].title).toBe('Sprawa synchronizowana');
  });

  it('odrzuca odszyfrowanie przy użyciu błędnego hasła (błąd uwierzytelnienia AES-GCM)', async () => {
    const payload = await syncEngine.prepareSyncPayload(mockManifest, testPassphrase);

    await expect(
      syncEngine.decryptSyncPayload(payload, 'ZleHaslo123!')
    ).rejects.toThrow();
  });

  it('wykrywa konflikt wersji gdy stan serwera i lokalny rozbiegły się', async () => {
    const localPayload: SyncRecordPayload = await syncEngine.prepareSyncPayload(mockManifest, testPassphrase);

    const divergedManifest: VaultManifest = {
      ...mockManifest,
      cases: [
        {
          ...mockManifest.cases[0],
          title: 'Zmieniona sprawa na innym urządzeniu',
          updatedAt: '2026-10-04T15:00:00Z',
        },
      ],
    };
    const otherDeviceEngine = new E2EESyncEngine('citizen-user-01', 'device-other-02');
    const serverPayload: SyncRecordPayload = await otherDeviceEngine.prepareSyncPayload(
      divergedManifest,
      testPassphrase
    );
    // Zwiększamy wersję na serwerze
    serverPayload.version = 2;

    const conflict = syncEngine.detectConflict({
      localRecord: localPayload,
      serverRecord: serverPayload,
    });

    expect(conflict).not.toBeNull();
    expect(conflict?.conflictResolution).toBe('preserve_both');
    expect(conflict?.serverVersion).toBe(2);
    expect(conflict?.localVersion).toBe(1);
  });

  it('tworzy wersję następną względem jawnie odczytanej wersji bazowej', async () => {
    const payload = await syncEngine.prepareSyncPayload(mockManifest, testPassphrase, { expectedVersion: 4 });

    expect(payload.version).toBe(5);
    expect(payload.expectedVersion).toBe(4);
  });

  it('odrzuca uszkodzoną kopertę przed próbą odszyfrowania', async () => {
    const payload = await syncEngine.prepareSyncPayload(mockManifest, testPassphrase);

    await expect(syncEngine.decryptSyncPayload({
      ...payload,
      encryptedContainer: { ...payload.encryptedContainer, ciphertextHex: 'not-hex' },
    }, testPassphrase)).rejects.toThrow('Nieprawidłowy szyfrogram');
  });
});
