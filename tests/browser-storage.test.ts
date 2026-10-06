import { describe, expect, it } from 'vitest';
import {
  BrowserDocumentStorage,
  BrowserStorageError,
  EncryptedBrowserDocumentStorage,
  MemoryEncryptedDocumentStorageBackend,
  MemoryDocumentStorageBackend,
  createOwnedDocumentStorage,
  markOwnedDocumentStorageInitialized,
  openOwnedDocumentStorage,
  validateBrowserDocumentInput,
} from '../src/domain/browser-storage';
import { computeSha256, generateVaultKey } from '../src/domain/crypto';

describe('BrowserDocumentStorage', () => {
  it('zachowuje oryginalne bajty, hash i metadane w backendzie pamięciowym', async () => {
    const backend = new MemoryDocumentStorageBackend();
    const storage = new BrowserDocumentStorage({ backend });
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

    const metadata = await storage.putDocument({
      documentId: 'doc-pdf-1',
      originalFileName: 'decyzja.pdf',
      mimeType: 'application/pdf',
      bytes,
      importedAt: '2026-10-05T10:00:00.000Z',
    });

    expect(metadata.backend).toBe('memory');
    expect(metadata.signatureStatus).toBe('verified');
    expect(metadata.size).toBe(bytes.byteLength);
    expect(metadata.sha256).toBe(await computeSha256(bytes));
    expect(await storage.usageBytes()).toBe(bytes.byteLength);

    // Zwracany bufor jest kopią, więc przypadkowa modyfikacja UI nie zmienia oryginału.
    const restored = await storage.getBytes('doc-pdf-1');
    expect(Array.from(restored || [])).toEqual(Array.from(bytes));
    restored![0] = 0;
    expect(Array.from((await storage.getBytes('doc-pdf-1')) || [])).toEqual(Array.from(bytes));
  });

  it('obsługuje wszystkie uzgodnione formaty i zachowuje dokładnie dane tekstowe', async () => {
    const storage = new BrowserDocumentStorage({ backend: new MemoryDocumentStorageBackend() });
    const files: Array<[string, Uint8Array, string]> = [
      ['notatka.txt', new TextEncoder().encode('Zażalenie — wersja robocza'), 'not-applicable'],
      ['styl.rtf', new TextEncoder().encode('{\\rtf1\\ansi tekst}'), 'verified'],
      ['skan.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 'verified'],
      ['skan.jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 'verified'],
      ['obraz.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'verified'],
      ['stary.doc', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'verified'],
    ];

    for (const [fileName, bytes, signatureStatus] of files) {
      const metadata = await storage.putDocument({ originalFileName: fileName, bytes });
      expect(metadata.signatureStatus).toBe(signatureStatus);
      expect(await storage.getBytes(metadata.documentId)).toEqual(bytes);
    }
    expect((await storage.listMetadata())).toHaveLength(files.length);
  });

  it('odrzuca nieobsługiwany format, ścieżkę, pusty plik i przekroczenie limitu', async () => {
    expect(() => validateBrowserDocumentInput({ originalFileName: 'dokument.exe', bytes: new Uint8Array([1]) })).toThrowError(BrowserStorageError);
    expect(() => validateBrowserDocumentInput({ originalFileName: '../dokument.pdf', bytes: new Uint8Array([1]) })).toThrowError(BrowserStorageError);
    expect(() => validateBrowserDocumentInput({ originalFileName: 'pusty.txt', bytes: new Uint8Array() })).toThrowError(BrowserStorageError);

    const storage = new BrowserDocumentStorage({
      backend: new MemoryDocumentStorageBackend(),
      maxFileSizeBytes: 3,
    });
    await expect(storage.putDocument({ originalFileName: 'duzy.txt', bytes: new Uint8Array([1, 2, 3, 4]) })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('nie nadpisuje oryginału i pilnuje sumarycznego limitu magazynu', async () => {
    const storage = new BrowserDocumentStorage({
      backend: new MemoryDocumentStorageBackend(),
      maxTotalSizeBytes: 5,
    });
    await storage.putDocument({ documentId: 'doc-1', originalFileName: 'a.txt', bytes: new Uint8Array([1, 2, 3]) });
    await expect(storage.putDocument({ documentId: 'doc-1', originalFileName: 'b.txt', bytes: new Uint8Array([9]) })).rejects.toThrow(/już istnieje/);
    await expect(storage.putDocument({ documentId: 'doc-2', originalFileName: 'b.txt', bytes: new Uint8Array([4, 5, 6]) })).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(await storage.getBytes('doc-1')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('usuwa dokument i jego bajty bez naruszania pozostałych rekordów', async () => {
    const storage = new BrowserDocumentStorage({ backend: new MemoryDocumentStorageBackend() });
    const first = await storage.putDocument({ originalFileName: 'pierwszy.txt', bytes: new Uint8Array([1]) });
    const second = await storage.putDocument({ originalFileName: 'drugi.txt', bytes: new Uint8Array([2, 3]) });

    expect(await storage.deleteDocument(first.documentId)).toBe(true);
    expect(await storage.getDocument(first.documentId)).toBeNull();
    expect(await storage.getBytes(second.documentId)).toEqual(new Uint8Array([2, 3]));
    expect(await storage.deleteDocument(first.documentId)).toBe(false);
  });
});

describe('magazyn oryginałów oddzielony według właściciela', () => {
  function namespaces() {
    const backends = new Map<string, MemoryEncryptedDocumentStorageBackend>();
    const markers = new Map<string, string>();
    const backendFactory = (name: string) => {
      if (!backends.has(name)) backends.set(name, new MemoryEncryptedDocumentStorageBackend());
      return backends.get(name)!;
    };
    const migrationMarkers = { getItem: (name: string) => markers.get(name) ?? null, setItem: (name: string, value: string) => { markers.set(name, value); } };
    return { backends, markers, backendFactory, migrationMarkers };
  }

  it('restore konta B z tym samym vaultId i innym kluczem nie zastępuje oryginałów A', async () => {
    const injected = namespaces();
    const vaultId = 'shared-technical-id';
    const ownerA = createOwnedDocumentStorage({ ...injected, ownerId: 'user-A', vaultId, vaultKey: generateVaultKey() });
    const keyB = generateVaultKey();
    const ownerB = createOwnedDocumentStorage({ ...injected, ownerId: 'user-B', vaultId, vaultKey: keyB });
    const originalA = new TextEncoder().encode('ORYGINAL_A_CANARY');
    const originalB = new TextEncoder().encode('ODTWORZONY_B_CANARY');
    await ownerA.putDocument({ documentId: 'doc-same-id', originalFileName: 'poufna-nazwa-A.txt', bytes: originalA });
    const portableSource = new EncryptedBrowserDocumentStorage({ vaultId, vaultKey: keyB, backend: new MemoryEncryptedDocumentStorageBackend() });
    await portableSource.putDocument({ documentId: 'doc-same-id', originalFileName: 'odtworzony-B.txt', bytes: originalB });
    await ownerB.importEncryptedSnapshot(await portableSource.exportEncryptedSnapshot(), { replaceExisting: true });
    expect(await ownerA.getBytes('doc-same-id')).toEqual(originalA);
    expect(await ownerB.getBytes('doc-same-id')).toEqual(originalB);
    expect(injected.backends.size).toBe(2);
    expect([...injected.backends.keys()].join(' ')).not.toContain('poufna-nazwa');
  });

  it('jednoznacznie rozdziela pary technicznych ID zawierające separator', async () => {
    const injected = namespaces();
    const first = createOwnedDocumentStorage({ ...injected, ownerId: 'user-a-b', vaultId: 'c', vaultKey: generateVaultKey() });
    const second = createOwnedDocumentStorage({ ...injected, ownerId: 'user-a', vaultId: 'b-c', vaultKey: generateVaultKey() });
    await first.putDocument({ documentId: 'doc-1', originalFileName: 'synthetic.txt', bytes: new Uint8Array([1]) });
    expect(await second.count()).toBe(0);
    expect(injected.backends.size).toBe(2);
    expect(() => createOwnedDocumentStorage({ ...injected, ownerId: 'email@example.test', vaultId: 'c' })).toThrow('technicznego identyfikatora');
  });

  it('migruje istniejący lokalny magazyn raz i zachowuje stare szyfrogramy bez usuwania', async () => {
    const injected = namespaces();
    const key = generateVaultKey();
    const legacyBackend = new MemoryEncryptedDocumentStorageBackend();
    const legacy = new EncryptedBrowserDocumentStorage({ vaultId: 'existing-local', vaultKey: key, backend: legacyBackend });
    const bytes = new TextEncoder().encode('LOKALNY_CANARY');
    await legacy.putDocument({ documentId: 'doc-old', originalFileName: 'prywatny-dowod.txt', bytes });
    const originalSnapshot = await legacy.exportEncryptedSnapshot();
    const options = { ...injected, ownerId: 'local', vaultId: 'existing-local', vaultKey: key, legacyBackend };
    const owned = await openOwnedDocumentStorage(options);
    expect(await owned.getBytes('doc-old')).toEqual(bytes);
    expect(await owned.exportEncryptedSnapshot()).toEqual(originalSnapshot);
    expect(await legacy.exportEncryptedSnapshot()).toEqual(originalSnapshot);
    const markerContent = JSON.stringify([...injected.markers]);
    expect(markerContent).not.toContain('prywatny-dowod.txt');
    expect(markerContent).not.toContain('LOKALNY_CANARY');
    expect(markerContent).not.toContain((await legacy.getMetadata('doc-old'))!.sha256);
    await owned.deleteDocument('doc-old');
    expect(await (await openOwnedDocumentStorage(options)).count()).toBe(0);
    expect(await legacy.count()).toBe(1);
  });

  it('zachowuje poprawną składnię uszkodzonego szyfrogramu i pomija uszkodzone wpisy, nie blokując unlock', async () => {
    const injected = namespaces();
    const key = generateVaultKey();
    const legacyBackend = new MemoryEncryptedDocumentStorageBackend();
    const legacy = new EncryptedBrowserDocumentStorage({ vaultId: 'damaged-legacy', vaultKey: key, backend: legacyBackend });
    await legacy.putDocument({ documentId: 'doc-good', originalFileName: 'dobry.txt', bytes: new Uint8Array([1, 2]) });
    await legacy.putDocument({ documentId: 'doc-bad', originalFileName: 'uszkodzony.txt', bytes: new Uint8Array([3]) });
    const bad = (await legacyBackend.get('doc-bad'))!;
    const changed = (Number.parseInt(bad.encryptedPayload.ciphertextHex.slice(-2), 16) ^ 1).toString(16).padStart(2, '0');
    await legacyBackend.put({ ...bad, encryptedPayload: { ...bad.encryptedPayload, ciphertextHex: bad.encryptedPayload.ciphertextHex.slice(0, -2) + changed } });
    const readRaw = legacyBackend.listRaw.bind(legacyBackend);
    legacyBackend.listRaw = async () => [...await readRaw(), { documentId: 'doc-invalid', encryptedPayload: null }, null];
    const owned = await openOwnedDocumentStorage({ ...injected, ownerId: 'local', vaultId: 'damaged-legacy', vaultKey: key, legacyBackend });
    expect(await owned.count()).toBe(2);
    expect(await owned.getBytes('doc-good')).toEqual(new Uint8Array([1, 2]));
    await expect(owned.getBytes('doc-bad')).rejects.toThrow('odszyfrować');
    expect(await legacy.count()).toBe(2);
  });

  it('błąd odczytu legacy nie blokuje magazynu i pozwala ponowić migrację', async () => {
    const injected = namespaces();
    const key = generateVaultKey();
    const legacyBackend = new MemoryEncryptedDocumentStorageBackend();
    const legacy = new EncryptedBrowserDocumentStorage({ vaultId: 'retry-legacy', vaultKey: key, backend: legacyBackend });
    await legacy.putDocument({ documentId: 'doc-retry', originalFileName: 'synthetic.txt', bytes: new Uint8Array([7]) });
    const readRaw = legacyBackend.listRaw.bind(legacyBackend);
    legacyBackend.listRaw = async () => { throw new Error('Synthetic blocked legacy'); };
    const options = { ...injected, ownerId: 'local', vaultId: 'retry-legacy', vaultKey: key, legacyBackend };
    expect(await (await openOwnedDocumentStorage(options)).count()).toBe(0);
    expect(injected.markers.size).toBe(0);
    legacyBackend.listRaw = readRaw;
    expect(await (await openOwnedDocumentStorage(options)).getBytes('doc-retry')).toEqual(new Uint8Array([7]));
  });

  it('odmowa zapisu znacznika nie blokuje unlock, lecz jawny restore otrzymuje błąd do rollback', async () => {
    const injected = namespaces();
    const migrationMarkers = { getItem: () => null, setItem: () => { throw new Error('Synthetic marker quota'); } };
    const options = { ...injected, migrationMarkers, ownerId: 'local', vaultId: 'marker-failure', vaultKey: generateVaultKey() };
    await expect(openOwnedDocumentStorage(options)).resolves.toBeInstanceOf(EncryptedBrowserDocumentStorage);
    expect(() => markOwnedDocumentStorageInitialized(options)).toThrow('znacznika odtworzenia');
  });

  it('nie nadpisuje wypełnionego namespace nawet gdy pojawił się po początkowym sprawdzeniu', async () => {
    const key = generateVaultKey();
    const backend = new MemoryEncryptedDocumentStorageBackend();
    const owned = createOwnedDocumentStorage({ ownerId: 'user-A', vaultId: 'race', vaultKey: key, backend });
    await owned.putDocument({ documentId: 'doc-current', originalFileName: 'current.txt', bytes: new Uint8Array([8]) });
    expect(await owned.copyLegacyEncryptedSnapshot({ version: '1.0', vaultId: 'race', records: [] })).toBe(false);
    expect(await owned.getBytes('doc-current')).toEqual(new Uint8Array([8]));
  });

  it('pusta kopia przywrócona przez factory nie jest uzupełniana legacy przy następnym unlock', async () => {
    const injected = namespaces();
    const key = generateVaultKey();
    const legacyBackend = new MemoryEncryptedDocumentStorageBackend();
    const legacy = new EncryptedBrowserDocumentStorage({ vaultId: 'empty-restore', vaultKey: key, backend: legacyBackend });
    await legacy.putDocument({ documentId: 'doc-old', originalFileName: 'old.txt', bytes: new Uint8Array([9]) });
    const options = { ...injected, ownerId: 'local', vaultId: 'empty-restore', vaultKey: key, legacyBackend };
    const restored = createOwnedDocumentStorage(options);
    await restored.importEncryptedSnapshot({ version: '1.0', vaultId: 'empty-restore', records: [] }, { replaceExisting: true });
    markOwnedDocumentStorageInitialized(options);
    expect(await (await openOwnedDocumentStorage(options)).count()).toBe(0);
    expect(await legacy.count()).toBe(1);
  });
});

describe('EncryptedBrowserDocumentStorage', () => {
  it('naprawia uszkodzony szyfrogram tylko nienaruszonym oryginałem z manifestu', async () => {
    const backend = new MemoryEncryptedDocumentStorageBackend();
    const storage = new EncryptedBrowserDocumentStorage({ vaultId: 'repair', vaultKey: generateVaultKey(), backend });
    const bytes = new TextEncoder().encode('dowód oryginalny');
    const metadata = await storage.putDocument({ documentId: 'doc-repair', originalFileName: 'dowod.txt', bytes });
    const record = (await backend.get('doc-repair'))!;
    await backend.put({ ...record, encryptedPayload: { ...record.encryptedPayload, ciphertextHex: '00'.repeat(record.encryptedPayload.ciphertextHex.length / 2) } });
    await expect(storage.getBytes('doc-repair')).rejects.toThrow();
    const expected = { sha256: metadata.sha256, size: metadata.size };
    await expect(storage.relinkOriginal({ documentId: 'doc-repair', originalFileName: 'dowod.txt', bytes: new TextEncoder().encode('inne bajty') }, expected)).rejects.toThrow('inne bajty');
    await storage.relinkOriginal({ documentId: 'doc-repair', originalFileName: 'dowod.txt', bytes }, expected);
    expect(await storage.getBytes('doc-repair')).toEqual(bytes);
  });
  it('przechowuje wyłącznie szyfrogram, odtwarza bajty i metadane po odblokowaniu', async () => {
    const backend = new MemoryEncryptedDocumentStorageBackend();
    const vaultKey = generateVaultKey();
    const storage = new EncryptedBrowserDocumentStorage({ vaultId: 'vault-test', vaultKey, backend });
    const bytes = new TextEncoder().encode('Poufna treść dokumentu — PESEL 00000000000');

    const metadata = await storage.putDocument({ documentId: 'doc-secure-1', originalFileName: 'poufne.txt', bytes });
    const rawRecord = await backend.get('doc-secure-1');
    expect(rawRecord).not.toBeNull();
    expect(JSON.stringify(rawRecord)).not.toContain('poufne.txt');
    expect(JSON.stringify(rawRecord)).not.toContain('Poufna treść');
    expect(await storage.getBytes(metadata.documentId)).toEqual(bytes);
    expect((await storage.getMetadata(metadata.documentId))?.originalFileName).toBe('poufne.txt');
    expect(await storage.count()).toBe(1);
  });

  it('odrzuca zły klucz i naruszenie szyfrogramu', async () => {
    const backend = new MemoryEncryptedDocumentStorageBackend();
    const storage = new EncryptedBrowserDocumentStorage({ vaultId: 'vault-tamper', vaultKey: generateVaultKey(), backend });
    await storage.putDocument({ documentId: 'doc-secure-2', originalFileName: 'dowod.txt', bytes: new TextEncoder().encode('oryginał') });

    storage.clearVaultKey();
    await expect(storage.getBytes('doc-secure-2')).rejects.toThrow(/zablokowany/);
    storage.setVaultKey(generateVaultKey());
    await expect(storage.getBytes('doc-secure-2')).rejects.toThrow(/odszyfrować|nieprawidłowy klucz/);

    const goodKey = generateVaultKey();
    const tamperBackend = new MemoryEncryptedDocumentStorageBackend();
    const tamperStorage = new EncryptedBrowserDocumentStorage({ vaultId: 'vault-tamper-2', vaultKey: goodKey, backend: tamperBackend });
    await tamperStorage.putDocument({ documentId: 'doc-secure-3', originalFileName: 'dowod.txt', bytes: new TextEncoder().encode('oryginał') });
    const record = await tamperBackend.get('doc-secure-3');
    const last = record!.encryptedPayload.ciphertextHex.slice(-2);
    await tamperBackend.put({
      ...record!,
      encryptedPayload: { ...record!.encryptedPayload, ciphertextHex: `${record!.encryptedPayload.ciphertextHex.slice(0, -2)}${last === '00' ? '01' : '00'}` },
    });
    await expect(tamperStorage.getBytes('doc-secure-3')).rejects.toThrow();
  });

  it('eksportuje i importuje zaszyfrowany snapshot bez ujawnienia metadanych', async () => {
    const key = generateVaultKey();
    const source = new EncryptedBrowserDocumentStorage({ vaultId: 'vault-snapshot', vaultKey: key, backend: new MemoryEncryptedDocumentStorageBackend() });
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    await source.putDocument({ documentId: 'doc-snapshot-1', originalFileName: 'decyzja.pdf', bytes });
    const snapshot = await source.exportEncryptedSnapshot();
    expect(JSON.stringify(snapshot)).not.toContain('decyzja.pdf');

    const destination = new EncryptedBrowserDocumentStorage({ vaultId: 'vault-snapshot', vaultKey: key, backend: new MemoryEncryptedDocumentStorageBackend() });
    expect(await destination.importEncryptedSnapshot(snapshot)).toBe(1);
    expect(await destination.getBytes('doc-snapshot-1')).toEqual(bytes);
    await expect(destination.importEncryptedSnapshot(snapshot)).rejects.toThrow(/już istnieje/);
    expect(await destination.importEncryptedSnapshot(snapshot, { replaceExisting: true })).toBe(1);
  });
});
