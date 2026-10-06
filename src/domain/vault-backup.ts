import { EncryptedBrowserDocumentStorage, EncryptedDocumentSnapshot, MemoryEncryptedDocumentStorageBackend } from './browser-storage';
import { computeSha256, decryptVault, encryptVault, EncryptedContainer } from './crypto';
import { decodeRecoveryKey, encodeRecoveryKey, validateVaultPassword } from './vault-access';
import { LocalVault } from './vault';
import { parseVaultManifest, VaultManifest } from './types';

/** Original ciphertext stays separate so a document is not limited by the manifest's 64 MB bound. */
export interface PortableVaultBackup {
  format: 'tywygrywasz-portable-vault';
  version: '2.0';
  metadata: EncryptedContainer;
  documents: EncryptedDocumentSnapshot;
}
export type VaultBackupInput = PortableVaultBackup | EncryptedContainer;
interface PortableMetadata {
  format: 'tywygrywasz-portable-metadata';
  manifest: VaultManifest;
  recoveryKey: string;
  snapshotEntries: Array<{ documentId: string; ciphertextSha256: string }>;
}
export interface OpenedVaultBackup {
  vault: LocalVault;
  key: Uint8Array;
  snapshot: EncryptedDocumentSnapshot;
  originalCount: number;
  legacy: boolean;
}

function validateVersionOwnership(manifest: VaultManifest): void {
  const documents = new Set(manifest.documents.map((document) => document.id));
  const versions = new Map(manifest.documentVersions.map((version) => [version.id, version]));
  if (versions.size !== manifest.documentVersions.length) throw new Error('Kopia zawiera powtórzone identyfikatory wersji.');
  for (const document of manifest.documents) {
    if (versions.get(document.activeVersionId)?.documentId !== document.id) throw new Error('Aktywna wersja kopii nie należy do wskazanego dokumentu.');
  }
  for (const version of manifest.documentVersions) {
    if (!documents.has(version.documentId)) throw new Error('Kopia zawiera wersję bez dokumentu.');
    if (version.parentVersionId && versions.get(version.parentVersionId)?.documentId !== version.documentId) throw new Error('Wersja nadrzędna kopii nie należy do wskazanego dokumentu.');
  }
}

export async function exportPortableVaultBackup(vault: LocalVault, storage: EncryptedBrowserDocumentStorage, key: Uint8Array, password: string): Promise<PortableVaultBackup> {
  validateVaultPassword(password);
  const manifest = vault.toManifest();
  validateVersionOwnership(manifest);
  const snapshot = await storage.exportEncryptedSnapshot();
  if (snapshot.vaultId !== manifest.vaultId) throw new Error('Magazyn oryginałów należy do innego sejfu.');
  // Verify each original against the independent manifest before presenting a complete backup.
  for (const document of manifest.documents) {
    const original = await storage.getDocument(document.id);
    if (!original) throw new Error('Brakuje oryginału w magazynie. Wskaż ponownie brakujący plik przed wykonaniem pełnej kopii.');
    if (original.sha256 !== document.originalSha256 || original.size !== document.fileSize) throw new Error('Hash lub rozmiar oryginału nie zgadza się z manifestem.');
  }
  const manifestIds = new Set(manifest.documents.map((document) => document.id));
  snapshot.records = snapshot.records.filter((record) => manifestIds.has(record.documentId));
  const metadata: PortableMetadata = {
    format: 'tywygrywasz-portable-metadata', manifest,
    recoveryKey: encodeRecoveryKey(key),
    snapshotEntries: await Promise.all(snapshot.records.map(async (record) => ({ documentId: record.documentId, ciphertextSha256: await computeSha256(JSON.stringify(record)) }))),
  };
  return { format: 'tywygrywasz-portable-vault', version: '2.0', metadata: await encryptVault(JSON.stringify(metadata), password, { includeManifestSha256: false }), documents: snapshot };
}

/** No persistence mutations occur here: wrong password, malformed manifests and missing blobs all fail first. */
export async function openPortableVaultBackup(input: unknown, password: string): Promise<OpenedVaultBackup> {
  if (!input || typeof input !== 'object') throw new Error('Nieprawidłowy plik kopii.');
  const candidate = input as Partial<PortableVaultBackup>;
  if (candidate.format !== 'tywygrywasz-portable-vault') {
    // Compatibility with metadata-only backups is explicit; missing originals stay marked as missing.
    const vault = await LocalVault.restoreFromEncryptedBackup(input as EncryptedContainer, password);
    validateVersionOwnership(vault.toManifest());
    vault.documents.forEach((document) => { document.isMissingOnDisk = true; });
    const key = crypto.getRandomValues(new Uint8Array(32));
    return { vault, key, snapshot: { version: '1.0', vaultId: vault.vaultId, records: [] }, originalCount: 0, legacy: true };
  }
  if (candidate.version !== '2.0' || !candidate.documents || !candidate.metadata) throw new Error('Nieobsługiwana lub niekompletna pełna kopia sejfu.');
  const metadata = JSON.parse(await decryptVault(candidate.metadata, password)) as PortableMetadata;
  if (metadata.format !== 'tywygrywasz-portable-metadata' || !Array.isArray(metadata.snapshotEntries) || metadata.snapshotEntries.length > 100_000) throw new Error('Nieprawidłowe metadane pełnej kopii.');
  if (!Array.isArray(candidate.documents.records) || candidate.documents.records.length !== metadata.snapshotEntries.length) throw new Error('Naruszenie integralności snapshotu: kopia została zmieniona lub straciła oryginały.');
  for (let index = 0; index < metadata.snapshotEntries.length; index += 1) {
    const entry = metadata.snapshotEntries[index];
    const record = candidate.documents.records[index];
    if (!entry || typeof entry.documentId !== 'string' || typeof entry.ciphertextSha256 !== 'string' || entry.documentId !== record?.documentId || await computeSha256(JSON.stringify(record)) !== entry.ciphertextSha256) throw new Error('Naruszenie integralności snapshotu: kopia została zmieniona lub straciła oryginały.');
  }
  const manifest = parseVaultManifest(metadata.manifest);
  const key = decodeRecoveryKey(metadata.recoveryKey);
  const validationStore = new EncryptedBrowserDocumentStorage({ vaultId: manifest.vaultId, vaultKey: key, backend: new MemoryEncryptedDocumentStorageBackend() });
  await validationStore.importEncryptedSnapshot(candidate.documents);
  const ids = new Set(manifest.documents.map((document) => document.id));
  if (ids.size !== manifest.documents.length || candidate.documents.records.length !== ids.size) throw new Error('Kopia zawiera niezgodną liczbę dokumentów.');
  for (const document of manifest.documents) {
    const original = await validationStore.getDocument(document.id);
    if (!original || original.sha256 !== document.originalSha256 || original.size !== document.fileSize || original.originalFileName !== document.originalFileName) throw new Error('Oryginał w kopii nie zgadza się z manifestem.');
    document.isMissingOnDisk = false;
  }
  validateVersionOwnership(manifest);
  return { vault: LocalVault.fromManifest(manifest), key, snapshot: candidate.documents, originalCount: ids.size, legacy: false };
}
