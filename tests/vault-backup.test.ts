import { describe, expect, it } from 'vitest';
import { EncryptedBrowserDocumentStorage, MemoryEncryptedDocumentStorageBackend } from '../src/domain/browser-storage';
import { computeSha256, generateVaultKey } from '../src/domain/crypto';
import { LocalVault } from '../src/domain/vault';
import { exportPortableVaultBackup, openPortableVaultBackup } from '../src/domain/vault-backup';
import { compareSyncManifests } from '../src/domain/sync-engine';

const password = 'OdtworzOryginal2026!';
async function fixture() {
  const vault = new LocalVault('portable-test');
  const key = generateVaultKey();
  const storage = new EncryptedBrowserDocumentStorage({ vaultId: vault.vaultId, vaultKey: key, backend: new MemoryEncryptedDocumentStorageBackend() });
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0, 255, 128]);
  const { document } = await vault.importDocument({ type: 'other', direction: 'incoming', origin: 'disk_file', originalFileName: 'prywatny-dowod.pdf', mimeType: 'application/pdf', content: 'Lokalny locator — binarny PDF', originalSha256: await computeSha256(bytes), fileSize: bytes.length, contextNote: 'Poufna notatka użytkownika' });
  await storage.putDocument({ documentId: document.id, originalFileName: document.originalFileName, mimeType: document.mimeType, bytes });
  await vault.addDocumentVersion({ documentId: document.id, kind: 'ocr_extracted', textPayload: 'Odczyt OCR', toolOrAuthor: 'local-test' });
  return { vault, storage, key, bytes, document };
}

describe('pełna przenośna kopia sejfu', () => {
  it('odrzuca poprawnie zaszyfrowaną kopię, której aktywna wersja wskazuje tekst innego dokumentu', async () => {
    const { vault, storage, key, document } = await fixture();
    const other = await vault.importDocument({ type: 'other', direction: 'incoming', origin: 'disk_file', originalFileName: 'second.txt', mimeType: 'text/plain', content: 'Document B' });
    await storage.putDocument({ documentId: other.document.id, originalFileName: 'second.txt', bytes: new TextEncoder().encode('Document B') });
    const valid = await exportPortableVaultBackup(vault, storage, key, password);
    document.activeVersionId = other.initialVersion.id;
    await expect(exportPortableVaultBackup(vault, storage, key, password)).rejects.toThrow(/wersja/);
    const { decryptVault, encryptVault } = await import('../src/domain/crypto');
    const metadata = JSON.parse(await decryptVault(valid.metadata, password));
    metadata.manifest.documents[0].activeVersionId = other.initialVersion.id;
    const malformed = { ...valid, metadata: await encryptVault(JSON.stringify(metadata), password, { includeManifestSha256: false }) };
    await expect(openPortableVaultBackup(malformed, password)).rejects.toThrow(/wersja/);
    expect((await storage.getBytes(other.document.id))?.length).toBe('Document B'.length);
  });
  it('odtwarza na czystym profilu binarne oryginały, wersje i kontekst bez znajomości pierwotnego klucza', async () => {
    const { vault, storage, key, bytes, document } = await fixture();
    const backup = await exportPortableVaultBackup(vault, storage, key, password);
    const raw = JSON.stringify(backup);
    expect(raw).not.toContain('prywatny-dowod.pdf');
    expect(raw).not.toContain('Poufna notatka');
    expect(raw).not.toContain('Odczyt OCR');
    const opened = await openPortableVaultBackup(JSON.parse(raw), password);
    const destination = new EncryptedBrowserDocumentStorage({ vaultId: opened.vault.vaultId, vaultKey: opened.key, backend: new MemoryEncryptedDocumentStorageBackend() });
    await destination.importEncryptedSnapshot(opened.snapshot, { replaceExisting: true });
    expect(await destination.getBytes(document.id)).toEqual(bytes);
    expect(opened.vault.documents.get(document.id)?.contextNote).toBe('Poufna notatka użytkownika');
    expect(opened.vault.documentVersions.size).toBe(2);
    expect(opened.originalCount).toBe(1);
  });

  it('odrzuca brakujący szyfrogram, uszkodzenie, złe hasło i rozbieżny hash przed zmianą istniejących danych', async () => {
    const { vault, storage, key, bytes, document } = await fixture();
    const backup = await exportPortableVaultBackup(vault, storage, key, password);
    await expect(openPortableVaultBackup(backup, 'Nieprawidlowe2026!')).rejects.toThrow();
    const withoutOriginal = structuredClone(backup);
    withoutOriginal.documents.records = [];
    await expect(openPortableVaultBackup(withoutOriginal, password)).rejects.toThrow(/integralności/);
    const altered = structuredClone(backup);
    const payload = altered.documents.records[0].encryptedPayload;
    const changedByte = (Number.parseInt(payload.ciphertextHex.slice(-2), 16) ^ 1).toString(16).padStart(2, '0');
    payload.ciphertextHex = `${payload.ciphertextHex.slice(0, -2)}${changedByte}`;
    await expect(openPortableVaultBackup(altered, password)).rejects.toThrow();
    vault.documents.get(document.id)!.originalSha256 = '0'.repeat(64);
    await expect(exportPortableVaultBackup(vault, storage, key, password)).rejects.toThrow(/Hash/);
    expect(await storage.getBytes(document.id)).toEqual(bytes);
  });

  it('odrzuca przy odtwarzaniu quota i pozostawia dotychczasowy magazyn bez zmian', async () => {
    const { vault, storage, key, bytes } = await fixture();
    const backup = await exportPortableVaultBackup(vault, storage, key, password);
    const opened = await openPortableVaultBackup(backup, password);
    const backend = new MemoryEncryptedDocumentStorageBackend();
    const destination = new EncryptedBrowserDocumentStorage({ vaultId: opened.vault.vaultId, vaultKey: opened.key, backend, maxTotalSizeBytes: bytes.length - 1 });
    await destination.putDocument({ documentId: 'doc-previous', originalFileName: 'previous.txt', bytes: new Uint8Array([1]) });
    await expect(destination.importEncryptedSnapshot(opened.snapshot, { replaceExisting: true })).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(await destination.getBytes('doc-previous')).toEqual(new Uint8Array([1]));
    expect(await destination.count()).toBe(1);
  });

  it('po błędzie skoordynowanego zapisu cofa snapshot nawet gdy przywrócona kopia miała inny klucz', async () => {
    const { vault, storage } = await fixture();
    const oldSnapshot = await storage.exportEncryptedSnapshot();
    const newKey = generateVaultKey();
    const newStore = new EncryptedBrowserDocumentStorage({ vaultId: vault.vaultId, vaultKey: newKey, backend: new MemoryEncryptedDocumentStorageBackend() });
    await newStore.putDocument({ documentId: 'doc-new', originalFileName: 'new.txt', bytes: new Uint8Array([2]) });
    await storage.rollbackEncryptedSnapshot(await newStore.exportEncryptedSnapshot());
    await storage.rollbackEncryptedSnapshot(oldSnapshot);
    expect(await storage.count()).toBe(1);
    expect(await storage.getBytes(oldSnapshot.records[0].documentId)).not.toBeNull();
  });

  it('oznacza stare kopie samych metadanych jako brakujące oryginały', async () => {
    const { vault } = await fixture();
    const legacy = await vault.exportEncryptedBackup(password);
    const opened = await openPortableVaultBackup(legacy, password);
    expect(opened.legacy).toBe(true);
    expect(opened.originalCount).toBe(0);
    expect(Array.from(opened.vault.documents.values())[0].isMissingOnDisk).toBe(true);
  });
});

describe('porównanie wersji synchronizacji', () => {
  it('ignoruje datę serializacji, lecz wymaga jawnego wyboru przy zmianie kontekstu lub OCR', async () => {
    const { vault } = await fixture();
    const local = vault.toManifest();
    const identical = structuredClone(local);
    identical.createdAt = '2030-01-01';
    expect(compareSyncManifests(local, identical).changed).toBe(false);
    identical.documents[0].contextNote = 'Zmiana na drugim urządzeniu';
    const comparison = compareSyncManifests(local, identical);
    expect(comparison.changed).toBe(true);
    expect(comparison.changedCollections).toContain('documents');
    expect(local.documents[0].contextNote).toBe('Poufna notatka użytkownika');
  });
});

import { createVaultAccess, encodeRecoveryKey, unlockVaultAccess } from '../src/domain/vault-access';

describe('hasło lokalnego sejfu', () => {
  it('zamyka losowy klucz w kopercie, nie zachowuje odzyskiwania w czytelnym zapisie i odrzuca złe hasło', async () => {
    const access = await createVaultAccess(password);
    const serialized = JSON.stringify(access.envelope);
    expect(serialized).not.toContain(encodeRecoveryKey(access.key));
    expect(serialized).not.toContain('recoveryKey');
    expect(await unlockVaultAccess(JSON.parse(serialized), password)).toEqual(access.key);
    await expect(unlockVaultAccess(JSON.parse(serialized), 'BledneHaslo2026!')).rejects.toThrow();
    expect(await unlockVaultAccess(JSON.parse(serialized), encodeRecoveryKey(access.key))).toEqual(access.key);
    await expect(createVaultAccess('za-krotkie')).rejects.toThrow(/12/);
  });
});
