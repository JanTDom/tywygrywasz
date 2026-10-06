/**
 * Lokalny magazyn oryginalnych bajtów dokumentów w przeglądarce.
 *
 * Dokumenty pozostają na urządzeniu użytkownika. IndexedDB jest podstawowym
 * backendem, a pamięciowy fallback istnieje wyłącznie dla środowisk, które nie
 * udostępniają IndexedDB (np. testy SSR). Nie zapisujemy pełnej ścieżki systemowej.
 */

import {
  computeSha256,
  decryptDocumentBytes,
  encryptDocumentBytes,
  EncryptedDocumentBytes,
  MAX_DOCUMENT_BYTES,
  validateEncryptedDocumentBytes,
} from './crypto';

export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  'doc',
  'rtf',
  'txt',
  'pdf',
  'jpg',
  'jpeg',
  'png',
] as const;

export type SupportedDocumentExtension = typeof SUPPORTED_DOCUMENT_EXTENSIONS[number];
export type BrowserStorageBackend = 'indexeddb' | 'memory';
export type DocumentSignatureStatus = 'verified' | 'not-verified' | 'not-applicable';

export const DEFAULT_BROWSER_STORAGE_LIMITS = {
  maxFileSizeBytes: 100 * 1024 * 1024,
  maxTotalSizeBytes: 2 * 1024 * 1024 * 1024,
} as const;

const DB_VERSION = 1;
const DEFAULT_DB_NAME = 'tywygrywasz-document-vault';
const DOCUMENT_STORE = 'documents';

const MIME_BY_EXTENSION: Record<SupportedDocumentExtension, string> = {
  doc: 'application/msword',
  rtf: 'application/rtf',
  txt: 'text/plain',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export interface BrowserDocumentInput {
  /** Techniczny ID DocumentRecord. Gdy pominięty, zostanie wygenerowany lokalnie. */
  documentId?: string;
  originalFileName: string;
  mimeType?: string;
  bytes: Uint8Array | ArrayBuffer | Blob;
  importedAt?: string;
}

export interface BrowserDocumentMetadata {
  documentId: string;
  originalFileName: string;
  mimeType: string;
  extension: SupportedDocumentExtension;
  size: number;
  sha256: string;
  importedAt: string;
  signatureStatus: DocumentSignatureStatus;
  backend: BrowserStorageBackend;
}

export interface StoredBrowserDocument extends BrowserDocumentMetadata {
  bytes: Uint8Array;
}

export interface BrowserStorageStatus {
  backend: BrowserStorageBackend;
  persistent: boolean;
  maxFileSizeBytes: number;
  maxTotalSizeBytes: number;
}

export interface BrowserDocumentStorageOptions {
  dbName?: string;
  maxFileSizeBytes?: number;
  maxTotalSizeBytes?: number;
  /** Wstrzykiwanie backendu upraszcza testy i pozwala kontrolować fallback. */
  backend?: DocumentStorageBackend;
  indexedDBFactory?: IDBFactory;
}

export interface PersistedDocumentRecord {
  documentId: string;
  originalFileName: string;
  mimeType: string;
  extension: SupportedDocumentExtension;
  size: number;
  sha256: string;
  importedAt: string;
  signatureStatus: DocumentSignatureStatus;
  bytes: ArrayBuffer;
}

export interface DocumentStorageBackend {
  readonly kind: BrowserStorageBackend;
  get(documentId: string): Promise<PersistedDocumentRecord | null>;
  list(): Promise<PersistedDocumentRecord[]>;
  put(record: PersistedDocumentRecord): Promise<void>;
  delete(documentId: string): Promise<boolean>;
  clear(): Promise<void>;
}

export class BrowserStorageError extends Error {
  public readonly code:
    | 'UNSUPPORTED_FORMAT'
    | 'EMPTY_FILE'
    | 'FILE_TOO_LARGE'
    | 'QUOTA_EXCEEDED'
    | 'INVALID_FILE_NAME'
    | 'INVALID_DOCUMENT_ID';

  constructor(code: BrowserStorageError['code'], message: string) {
    super(message);
    this.name = 'BrowserStorageError';
    this.code = code;
  }
}

function makeDocumentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `doc-${crypto.randomUUID()}`;
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cloneBytes(bytes: ArrayBuffer): ArrayBuffer {
  return bytes.slice(0);
}

function asArrayBuffer(bytes: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return cloneBytes(bytes);
  return bytes.slice().buffer;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

async function readInputBytes(bytes: Uint8Array | ArrayBuffer | Blob): Promise<ArrayBuffer> {
  if (isBlob(bytes)) return bytes.arrayBuffer();
  return asArrayBuffer(bytes);
}

function extensionFromFileName(fileName: string): SupportedDocumentExtension | null {
  const match = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!match) return null;
  const extension = match[1] as SupportedDocumentExtension;
  return SUPPORTED_DOCUMENT_EXTENSIONS.includes(extension) ? extension : null;
}

function normalizeFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..' || /[\\/]/.test(trimmed) || trimmed.includes(String.fromCharCode(0))) {
    throw new BrowserStorageError('INVALID_FILE_NAME', 'Nazwa pliku jest nieprawidłowa.');
  }
  if (trimmed.length > 255) {
    throw new BrowserStorageError('INVALID_FILE_NAME', 'Nazwa pliku jest za długa.');
  }
  return trimmed;
}

function normalizedMime(mimeType: string | undefined, extension: SupportedDocumentExtension): string {
  const supplied = mimeType?.trim().toLowerCase();
  return supplied && supplied !== 'application/octet-stream' ? supplied : MIME_BY_EXTENSION[extension];
}

function bytesStartWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function inspectSignature(extension: SupportedDocumentExtension, bytes: Uint8Array): DocumentSignatureStatus {
  switch (extension) {
    case 'pdf':
      return bytesStartWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) ? 'verified' : 'not-verified';
    case 'png':
      return bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? 'verified' : 'not-verified';
    case 'jpg':
    case 'jpeg':
      return bytesStartWith(bytes, [0xff, 0xd8, 0xff]) ? 'verified' : 'not-verified';
    case 'doc':
      return bytesStartWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) ? 'verified' : 'not-verified';
    case 'rtf': {
      const prefix = new TextDecoder().decode(bytes.slice(0, 5));
      return prefix.startsWith('{\\rtf') ? 'verified' : 'not-verified';
    }
    case 'txt':
      return 'not-applicable';
  }
}

export interface ValidatedBrowserDocumentInput {
  fileName: string;
  extension: SupportedDocumentExtension;
  mimeType: string;
}

export function validateBrowserDocumentInput(input: BrowserDocumentInput, maxFileSizeBytes = DEFAULT_BROWSER_STORAGE_LIMITS.maxFileSizeBytes): ValidatedBrowserDocumentInput {
  const fileName = normalizeFileName(input.originalFileName);
  const extension = extensionFromFileName(fileName);
  if (!extension) {
    throw new BrowserStorageError('UNSUPPORTED_FORMAT', 'Obsługiwane formaty to DOC, RTF, TXT, PDF, JPG i PNG.');
  }
  const declaredSize = isBlob(input.bytes) ? input.bytes.size : input.bytes.byteLength;
  if (declaredSize <= 0) throw new BrowserStorageError('EMPTY_FILE', 'Plik jest pusty.');
  if (declaredSize > maxFileSizeBytes) {
    throw new BrowserStorageError('FILE_TOO_LARGE', `Plik przekracza limit ${Math.round(maxFileSizeBytes / 1024 / 1024)} MB.`);
  }
  return {
    fileName,
    extension,
    mimeType: normalizedMime(input.mimeType, extension),
  };
}

async function prepareBrowserDocumentInput(input: BrowserDocumentInput, maxFileSizeBytes: number): Promise<{
  fileName: string;
  extension: SupportedDocumentExtension;
  mimeType: string;
  bytes: ArrayBuffer;
  signatureStatus: DocumentSignatureStatus;
}> {
  const metadata = validateBrowserDocumentInput(input, maxFileSizeBytes);
  const bytes = await readInputBytes(input.bytes);
  if (bytes.byteLength <= 0) throw new BrowserStorageError('EMPTY_FILE', 'Plik jest pusty.');
  if (bytes.byteLength > maxFileSizeBytes) {
    throw new BrowserStorageError('FILE_TOO_LARGE', `Plik przekracza limit ${Math.round(maxFileSizeBytes / 1024 / 1024)} MB.`);
  }
  const signatureStatus = inspectSignature(metadata.extension, new Uint8Array(bytes));
  return { ...metadata, bytes, signatureStatus };
}

export class MemoryDocumentStorageBackend implements DocumentStorageBackend {
  public readonly kind = 'memory' as const;
  private records = new Map<string, PersistedDocumentRecord>();

  async get(documentId: string): Promise<PersistedDocumentRecord | null> {
    const record = this.records.get(documentId);
    return record ? { ...record, bytes: cloneBytes(record.bytes) } : null;
  }

  async list(): Promise<PersistedDocumentRecord[]> {
    return Array.from(this.records.values()).map((record) => ({ ...record, bytes: cloneBytes(record.bytes) }));
  }

  async put(record: PersistedDocumentRecord): Promise<void> {
    this.records.set(record.documentId, { ...record, bytes: cloneBytes(record.bytes) });
  }

  async delete(documentId: string): Promise<boolean> {
    return this.records.delete(documentId);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

export class IndexedDbDocumentStorageBackend implements DocumentStorageBackend {
  public readonly kind = 'indexeddb' as const;
  private readonly factory: IDBFactory;
  private readonly dbName: string;
  private dbPromise?: Promise<IDBDatabase>;

  constructor(factory: IDBFactory, dbName = DEFAULT_DB_NAME) {
    this.factory = factory;
    this.dbName = dbName;
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = this.factory.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DOCUMENT_STORE)) db.createObjectStore(DOCUMENT_STORE, { keyPath: 'documentId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Nie można otworzyć lokalnego magazynu dokumentów.'));
      request.onblocked = () => reject(new Error('Lokalny magazyn dokumentów jest zablokowany przez inną kartę.'));
    });
    return this.dbPromise;
  }

  async get(documentId: string): Promise<PersistedDocumentRecord | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(DOCUMENT_STORE, 'readonly').objectStore(DOCUMENT_STORE).get(documentId);
      request.onsuccess = () => {
        const value = request.result as PersistedDocumentRecord | undefined;
        resolve(value ? { ...value, bytes: cloneBytes(value.bytes) } : null);
      };
      request.onerror = () => reject(request.error || new Error('Nie można odczytać dokumentu z IndexedDB.'));
    });
  }

  async list(): Promise<PersistedDocumentRecord[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(DOCUMENT_STORE, 'readonly').objectStore(DOCUMENT_STORE).getAll();
      request.onsuccess = () => resolve((request.result as PersistedDocumentRecord[]).map((value) => ({ ...value, bytes: cloneBytes(value.bytes) })));
      request.onerror = () => reject(request.error || new Error('Nie można odczytać listy dokumentów z IndexedDB.'));
    });
  }

  async put(record: PersistedDocumentRecord): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(DOCUMENT_STORE, 'readwrite').objectStore(DOCUMENT_STORE).put({ ...record, bytes: cloneBytes(record.bytes) });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Nie można zapisać dokumentu w IndexedDB.'));
    });
  }

  async delete(documentId: string): Promise<boolean> {
    const existing = await this.get(documentId);
    if (!existing) return false;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(DOCUMENT_STORE, 'readwrite').objectStore(DOCUMENT_STORE).delete(documentId);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error || new Error('Nie można usunąć dokumentu z IndexedDB.'));
    });
  }

  async clear(): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(DOCUMENT_STORE, 'readwrite').objectStore(DOCUMENT_STORE).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Nie można wyczyścić lokalnego magazynu dokumentów.'));
    });
  }
}

function defaultBackend(dbName: string, indexedDBFactory?: IDBFactory): DocumentStorageBackend {
  const factory = indexedDBFactory || (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
  return factory ? new IndexedDbDocumentStorageBackend(factory, dbName) : new MemoryDocumentStorageBackend();
}

export class BrowserDocumentStorage {
  private readonly backend: DocumentStorageBackend;
  private readonly maxFileSizeBytes: number;
  private readonly maxTotalSizeBytes: number;

  constructor(options: BrowserDocumentStorageOptions = {}) {
    this.backend = options.backend || defaultBackend(options.dbName || DEFAULT_DB_NAME, options.indexedDBFactory);
    this.maxFileSizeBytes = options.maxFileSizeBytes || DEFAULT_BROWSER_STORAGE_LIMITS.maxFileSizeBytes;
    this.maxTotalSizeBytes = options.maxTotalSizeBytes || DEFAULT_BROWSER_STORAGE_LIMITS.maxTotalSizeBytes;
  }

  get status(): BrowserStorageStatus {
    return {
      backend: this.backend.kind,
      persistent: this.backend.kind === 'indexeddb',
      maxFileSizeBytes: this.maxFileSizeBytes,
      maxTotalSizeBytes: this.maxTotalSizeBytes,
    };
  }

  async putDocument(input: BrowserDocumentInput): Promise<BrowserDocumentMetadata> {
    const prepared = await prepareBrowserDocumentInput(input, this.maxFileSizeBytes);
    const documentId = input.documentId || makeDocumentId();
    if (!/^[-_a-zA-Z0-9:.]{1,160}$/.test(documentId)) {
      throw new BrowserStorageError('INVALID_DOCUMENT_ID', 'Techniczny identyfikator dokumentu jest nieprawidłowy.');
    }
    if (await this.backend.get(documentId)) throw new Error('Dokument o tym identyfikatorze już istnieje; oryginał nie został nadpisany.');

    const current = await this.backend.list();
    const totalBytes = current.reduce((sum, record) => sum + record.size, 0);
    if (totalBytes + prepared.bytes.byteLength > this.maxTotalSizeBytes) {
      throw new BrowserStorageError('QUOTA_EXCEEDED', 'Lokalny limit magazynu dokumentów został przekroczony. Usuń lub wyeksportuj część plików.');
    }
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      if (estimate.quota && estimate.usage && estimate.usage + prepared.bytes.byteLength > estimate.quota * 0.95) {
        throw new BrowserStorageError('QUOTA_EXCEEDED', 'Przeglądarka ma zbyt mało wolnego miejsca na ten dokument.');
      }
    }

    const record: PersistedDocumentRecord = {
      documentId,
      originalFileName: prepared.fileName,
      mimeType: prepared.mimeType,
      extension: prepared.extension,
      size: prepared.bytes.byteLength,
      sha256: await computeSha256(new Uint8Array(prepared.bytes)),
      importedAt: input.importedAt || new Date().toISOString(),
      signatureStatus: prepared.signatureStatus,
      bytes: prepared.bytes,
    };
    await this.backend.put(record);
    return this.toMetadata(record);
  }

  async getMetadata(documentId: string): Promise<BrowserDocumentMetadata | null> {
    const record = await this.backend.get(documentId);
    return record ? this.toMetadata(record) : null;
  }

  async getDocument(documentId: string): Promise<StoredBrowserDocument | null> {
    const record = await this.backend.get(documentId);
    if (!record) return null;
    return { ...this.toMetadata(record), bytes: new Uint8Array(cloneBytes(record.bytes)) };
  }

  async getBytes(documentId: string): Promise<Uint8Array | null> {
    const record = await this.backend.get(documentId);
    return record ? new Uint8Array(cloneBytes(record.bytes)) : null;
  }

  async listMetadata(): Promise<BrowserDocumentMetadata[]> {
    const records = await this.backend.list();
    return records.map((record) => this.toMetadata(record));
  }

  async deleteDocument(documentId: string): Promise<boolean> {
    return this.backend.delete(documentId);
  }

  async clear(): Promise<void> {
    await this.backend.clear();
  }

  async usageBytes(): Promise<number> {
    const records = await this.backend.list();
    return records.reduce((sum, record) => sum + record.size, 0);
  }

  private toMetadata(record: PersistedDocumentRecord): BrowserDocumentMetadata {
    return {
      documentId: record.documentId,
      originalFileName: record.originalFileName,
      mimeType: record.mimeType,
      extension: record.extension,
      size: record.size,
      sha256: record.sha256,
      importedAt: record.importedAt,
      signatureStatus: record.signatureStatus,
      backend: this.backend.kind,
    };
  }
}

/** Prośba o persistent storage nie jest gwarancją backupu. */
export async function requestPersistentBrowserStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function createBrowserDocumentStorage(options: BrowserDocumentStorageOptions = {}): BrowserDocumentStorage {
  return new BrowserDocumentStorage(options);
}

/**
 * Encrypted storage records intentionally expose only a technical ID and an
 * authenticated ciphertext. Names, MIME types, hashes and original bytes are
 * inside the ciphertext and never become IndexedDB object properties.
 */
export interface EncryptedDocumentStorageRecord {
  documentId: string;
  encryptedPayload: EncryptedDocumentBytes;
}

export interface EncryptedDocumentStorageBackend {
  readonly kind: BrowserStorageBackend;
  get(documentId: string): Promise<EncryptedDocumentStorageRecord | null>;
  list(): Promise<EncryptedDocumentStorageRecord[]>;
  put(record: EncryptedDocumentStorageRecord): Promise<void>;
  delete(documentId: string): Promise<boolean>;
  clear(): Promise<void>;
  /** Atomic replacement when supported by the persistence backend. */
  replaceAll?(records: EncryptedDocumentStorageRecord[]): Promise<void>;
  /** Migration copies only into an empty namespace, in the same transaction as the check. */
  copyIntoEmpty?(records: EncryptedDocumentStorageRecord[]): Promise<boolean>;
  /** Legacy records may be malformed; migration validates each raw entry separately. */
  listRaw?(): Promise<unknown[]>;
}

export class MemoryEncryptedDocumentStorageBackend implements EncryptedDocumentStorageBackend {
  public readonly kind = 'memory' as const;
  private records = new Map<string, EncryptedDocumentStorageRecord>();

  async get(documentId: string): Promise<EncryptedDocumentStorageRecord | null> {
    const record = this.records.get(documentId);
    return record ? cloneEncryptedRecord(record) : null;
  }

  async list(): Promise<EncryptedDocumentStorageRecord[]> {
    return Array.from(this.records.values()).map(cloneEncryptedRecord);
  }

  async put(record: EncryptedDocumentStorageRecord): Promise<void> {
    this.records.set(record.documentId, cloneEncryptedRecord(record));
  }

  async delete(documentId: string): Promise<boolean> {
    return this.records.delete(documentId);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }

  async replaceAll(records: EncryptedDocumentStorageRecord[]): Promise<void> {
    const next = new Map(records.map((record) => [record.documentId, cloneEncryptedRecord(record)]));
    this.records = next;
  }

  async copyIntoEmpty(records: EncryptedDocumentStorageRecord[]): Promise<boolean> {
    if (this.records.size > 0) return false;
    this.records = new Map(records.map((record) => [record.documentId, cloneEncryptedRecord(record)]));
    return true;
  }

  async listRaw(): Promise<unknown[]> {
    return structuredClone(Array.from(this.records.values()));
  }
}

const ENCRYPTED_DOCUMENT_STORE = 'encrypted-documents';

export class IndexedDbEncryptedDocumentStorageBackend implements EncryptedDocumentStorageBackend {
  public readonly kind = 'indexeddb' as const;
  private readonly factory: IDBFactory;
  private readonly dbName: string;
  private dbPromise?: Promise<IDBDatabase>;

  constructor(factory: IDBFactory, dbName = 'tywygrywasz-encrypted-document-vault') {
    this.factory = factory;
    this.dbName = dbName;
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = this.factory.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ENCRYPTED_DOCUMENT_STORE)) {
          db.createObjectStore(ENCRYPTED_DOCUMENT_STORE, { keyPath: 'documentId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Nie można otworzyć zaszyfrowanego magazynu dokumentów.'));
      request.onblocked = () => reject(new Error('Zaszyfrowany magazyn dokumentów jest zablokowany przez inną kartę.'));
    });
    return this.dbPromise;
  }

  async get(documentId: string): Promise<EncryptedDocumentStorageRecord | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(ENCRYPTED_DOCUMENT_STORE, 'readonly').objectStore(ENCRYPTED_DOCUMENT_STORE).get(documentId);
      request.onsuccess = () => resolve(request.result ? cloneEncryptedRecord(request.result as EncryptedDocumentStorageRecord) : null);
      request.onerror = () => reject(request.error || new Error('Nie można odczytać szyfrogramu dokumentu.'));
    });
  }

  async list(): Promise<EncryptedDocumentStorageRecord[]> {
    return (await this.listRaw()).map((record) => cloneEncryptedRecord(record as EncryptedDocumentStorageRecord));
  }

  async listRaw(): Promise<unknown[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(ENCRYPTED_DOCUMENT_STORE, 'readonly').objectStore(ENCRYPTED_DOCUMENT_STORE).getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error || new Error('Nie można odczytać szyfrogramów dokumentów.'));
    });
  }

  async put(record: EncryptedDocumentStorageRecord): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(ENCRYPTED_DOCUMENT_STORE, 'readwrite').objectStore(ENCRYPTED_DOCUMENT_STORE).put(cloneEncryptedRecord(record));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Nie można zapisać szyfrogramu dokumentu.'));
    });
  }

  async delete(documentId: string): Promise<boolean> {
    const existing = await this.get(documentId);
    if (!existing) return false;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(ENCRYPTED_DOCUMENT_STORE, 'readwrite').objectStore(ENCRYPTED_DOCUMENT_STORE).delete(documentId);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error || new Error('Nie można usunąć szyfrogramu dokumentu.'));
    });
  }

  async clear(): Promise<void> {
    await this.replaceAll([]);
  }

  async replaceAll(records: EncryptedDocumentStorageRecord[]): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(ENCRYPTED_DOCUMENT_STORE, 'readwrite');
      const store = transaction.objectStore(ENCRYPTED_DOCUMENT_STORE);
      store.clear();
      for (const record of records) store.put(cloneEncryptedRecord(record));
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Odtworzenie dokumentów przerwano; poprzedni magazyn pozostał zachowany.'));
    });
  }

  async copyIntoEmpty(records: EncryptedDocumentStorageRecord[]): Promise<boolean> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(ENCRYPTED_DOCUMENT_STORE, 'readwrite');
      const store = transaction.objectStore(ENCRYPTED_DOCUMENT_STORE);
      let copied = false;
      const count = store.count();
      count.onsuccess = () => {
        if (count.result !== 0) return;
        copied = true;
        for (const record of records) store.put(cloneEncryptedRecord(record));
      };
      transaction.oncomplete = () => resolve(copied);
      transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Nie udało się skopiować wcześniejszego magazynu; stary magazyn pozostał zachowany.'));
    });
  }
}

function cloneEncryptedRecord(record: EncryptedDocumentStorageRecord): EncryptedDocumentStorageRecord {
  return {
    documentId: record.documentId,
    encryptedPayload: {
      version: record.encryptedPayload.version,
      algorithm: record.encryptedPayload.algorithm,
      ivHex: record.encryptedPayload.ivHex,
      ciphertextHex: record.encryptedPayload.ciphertextHex,
    },
  };
}

function defaultEncryptedBackend(dbName: string, indexedDBFactory?: IDBFactory): EncryptedDocumentStorageBackend {
  const factory = indexedDBFactory || (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
  return factory ? new IndexedDbEncryptedDocumentStorageBackend(factory, dbName) : new MemoryEncryptedDocumentStorageBackend();
}

interface EncryptedDocumentPayload {
  version: '1.0';
  metadata: Omit<BrowserDocumentMetadata, 'documentId' | 'backend'>;
  bytes: Uint8Array;
}

export interface EncryptedDocumentSnapshot {
  version: '1.0';
  vaultId: string;
  records: EncryptedDocumentStorageRecord[];
}

export interface EncryptedDocumentStorageOptions {
  vaultId: string;
  vaultKey?: Uint8Array;
  dbName?: string;
  maxFileSizeBytes?: number;
  maxTotalSizeBytes?: number;
  backend?: EncryptedDocumentStorageBackend;
  indexedDBFactory?: IDBFactory;
}

type MigrationMarkers = Pick<Storage, 'getItem' | 'setItem'>;

export interface OwnedDocumentStorageOptions extends Omit<EncryptedDocumentStorageOptions, 'dbName'> {
  /** A technical account ID, or "local" for the account-independent vault. */
  ownerId: string;
  migrationMarkers?: MigrationMarkers;
  legacyBackend?: EncryptedDocumentStorageBackend;
  /** Test/backend injection; production uses IndexedDB for the computed namespace. */
  backendFactory?: (dbName: string) => EncryptedDocumentStorageBackend;
}

function ownedStorageIdentity(ownerId: string, vaultId: string): string {
  if (![ownerId, vaultId].every((value) => /^[-_a-zA-Z0-9:.]{1,160}$/.test(value))) throw new Error('Magazyn wymaga technicznego identyfikatora właściciela i sejfu.');
  // JSON framing prevents ambiguous pairs such as [a-b,c] and [a,b-c].
  return JSON.stringify([ownerId, vaultId]);
}

function ownedStorageMarker(options: Pick<OwnedDocumentStorageOptions, 'ownerId' | 'vaultId'>): string {
  return `tywygrywasz-owned-storage-migrated-${ownedStorageIdentity(options.ownerId, options.vaultId)}`;
}

function migrationMarkerStorage(options: Pick<OwnedDocumentStorageOptions, 'migrationMarkers'>): MigrationMarkers | undefined {
  if (options.migrationMarkers) return options.migrationMarkers;
  try { return typeof window === 'undefined' ? undefined : window.localStorage; }
  catch { return undefined; }
}

/** Call only after a successful coordinated restore, including an intentionally empty backup. */
export function markOwnedDocumentStorageInitialized(options: Pick<OwnedDocumentStorageOptions, 'ownerId' | 'vaultId' | 'migrationMarkers'>): void {
  const marker = ownedStorageMarker(options);
  const markers = migrationMarkerStorage(options);
  if (!markers) {
    if (typeof window !== 'undefined') throw new Error('Nie można zapisać technicznego znacznika odtworzenia magazynu.');
    return; // Non-persistent SSR/test memory backends have no reload migration.
  }
  try { markers.setItem(marker, '1'); }
  catch { throw new Error('Nie można zapisać technicznego znacznika odtworzenia magazynu.'); }
}

/** Restore creates an owner-specific target directly, without reading or migrating legacy data. */
export function createOwnedDocumentStorage(options: OwnedDocumentStorageOptions): EncryptedBrowserDocumentStorage {
  const dbName = `tywygrywasz-owned-documents-${ownedStorageIdentity(options.ownerId, options.vaultId)}`;
  return new EncryptedBrowserDocumentStorage({
    ...options,
    dbName,
    backend: options.backend || options.backendFactory?.(dbName),
  });
}

/** One-time ciphertext-only migration. Legacy data is never removed or decrypted here. */
export async function openOwnedDocumentStorage(options: OwnedDocumentStorageOptions): Promise<EncryptedBrowserDocumentStorage> {
  const storage = createOwnedDocumentStorage(options);
  const marker = ownedStorageMarker(options);
  const markers = migrationMarkerStorage(options);
  try {
    if (markers?.getItem(marker) === '1') return storage;
    if (await storage.count() > 0) {
      markOwnedDocumentStorageInitialized(options);
      return storage;
    }
    const legacyName = `tywygrywasz-${options.vaultId}-documents`;
    const legacy = options.legacyBackend || options.backendFactory?.(legacyName) || defaultEncryptedBackend(legacyName, options.indexedDBFactory);
    const raw = legacy.listRaw ? await legacy.listRaw() : await legacy.list();
    const seen = new Set<string>();
    const records: EncryptedDocumentStorageRecord[] = [];
    for (const candidate of raw.slice(0, 100_000)) {
      if (!isRecord(candidate) || typeof candidate.documentId !== 'string' || !/^[-_a-zA-Z0-9:.]{1,160}$/.test(candidate.documentId) || seen.has(candidate.documentId)) continue;
      try { validateEncryptedDocumentBytes(candidate.encryptedPayload); }
      catch { continue; }
      seen.add(candidate.documentId);
      records.push(cloneEncryptedRecord(candidate as unknown as EncryptedDocumentStorageRecord));
    }
    await storage.copyLegacyEncryptedSnapshot({ version: '1.0', vaultId: options.vaultId, records });
    markOwnedDocumentStorageInitialized(options);
  } catch {
    // A damaged/blocked legacy store must not stop the independently validated manifest unlock.
    // Original reads show missing/unavailable; the untouched legacy store can be retried later.
  }
  return storage;
}

export interface ImportEncryptedSnapshotOptions {
  replaceExisting?: boolean;
}

export class EncryptedBrowserDocumentStorage {
  private readonly backend: EncryptedDocumentStorageBackend;
  private readonly vaultId: string;
  private vaultKey?: Uint8Array;
  private readonly maxFileSizeBytes: number;
  private readonly maxTotalSizeBytes: number;

  constructor(options: EncryptedDocumentStorageOptions) {
    if (!options.vaultId || options.vaultId.length > 160) throw new Error('Sejf dokumentów wymaga poprawnego identyfikatora.');
    this.vaultId = options.vaultId;
    this.backend = options.backend || defaultEncryptedBackend(options.dbName || `tywygrywasz-${options.vaultId}-documents`, options.indexedDBFactory);
    this.maxFileSizeBytes = Math.min(options.maxFileSizeBytes || DEFAULT_BROWSER_STORAGE_LIMITS.maxFileSizeBytes, MAX_DOCUMENT_BYTES);
    this.maxTotalSizeBytes = options.maxTotalSizeBytes || DEFAULT_BROWSER_STORAGE_LIMITS.maxTotalSizeBytes;
    if (options.vaultKey) this.setVaultKey(options.vaultKey);
  }

  get status(): BrowserStorageStatus & { locked: boolean } {
    return {
      backend: this.backend.kind,
      persistent: this.backend.kind === 'indexeddb',
      maxFileSizeBytes: this.maxFileSizeBytes,
      maxTotalSizeBytes: this.maxTotalSizeBytes,
      locked: !this.vaultKey,
    };
  }

  setVaultKey(vaultKey: Uint8Array): void {
    if (!(vaultKey instanceof Uint8Array) || vaultKey.byteLength !== 32) throw new Error('Klucz sejfu musi mieć dokładnie 256 bitów.');
    this.vaultKey = vaultKey.slice();
  }

  clearVaultKey(): void {
    if (this.vaultKey) this.vaultKey.fill(0);
    this.vaultKey = undefined;
  }

  async putDocument(input: BrowserDocumentInput): Promise<BrowserDocumentMetadata> {
    const key = this.requireKey();
    const prepared = await prepareBrowserDocumentInput(input, this.maxFileSizeBytes);
    const documentId = input.documentId || makeDocumentId();
    this.assertDocumentId(documentId);
    if (await this.backend.get(documentId)) throw new Error('Dokument o tym identyfikatorze już istnieje; oryginał nie został nadpisany.');
    const records = await this.backend.list();
    const currentBytes = await this.totalBytes(records, key);
    if (currentBytes + prepared.bytes.byteLength > this.maxTotalSizeBytes) throw new BrowserStorageError('QUOTA_EXCEEDED', 'Lokalny limit magazynu dokumentów został przekroczony.');
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      if (estimate.quota && estimate.usage && estimate.usage + prepared.bytes.byteLength > estimate.quota * 0.95) throw new BrowserStorageError('QUOTA_EXCEEDED', 'Przeglądarka ma zbyt mało wolnego miejsca.');
    }
    const metadata: Omit<BrowserDocumentMetadata, 'documentId' | 'backend'> = {
      originalFileName: prepared.fileName,
      mimeType: prepared.mimeType,
      extension: prepared.extension,
      size: prepared.bytes.byteLength,
      sha256: await computeSha256(new Uint8Array(prepared.bytes)),
      importedAt: input.importedAt || new Date().toISOString(),
      signatureStatus: prepared.signatureStatus,
    };
    const payload: EncryptedDocumentPayload = { version: '1.0', metadata, bytes: new Uint8Array(prepared.bytes) };
    await this.backend.put({ documentId, encryptedPayload: await this.encryptPayload(documentId, payload, key) });
    return { documentId, ...metadata, backend: this.backend.kind };
  }

  async getMetadata(documentId: string): Promise<BrowserDocumentMetadata | null> {
    const record = await this.backend.get(documentId);
    if (!record) return null;
    const payload = await this.decryptPayload(record, this.requireKey());
    return { documentId, ...payload.metadata, backend: this.backend.kind };
  }

  async getDocument(documentId: string): Promise<StoredBrowserDocument | null> {
    const record = await this.backend.get(documentId);
    if (!record) return null;
    const payload = await this.decryptPayload(record, this.requireKey());
    const bytes = payload.bytes;
    await this.assertPayloadIntegrity(payload, bytes);
    return { documentId, ...payload.metadata, backend: this.backend.kind, bytes };
  }

  async getBytes(documentId: string): Promise<Uint8Array | null> {
    const document = await this.getDocument(documentId);
    return document?.bytes || null;
  }

  /** Restores missing/corrupt ciphertext only from bytes matching the independent immutable manifest. */
  async relinkOriginal(input: BrowserDocumentInput & { documentId: string }, expected: { sha256: string; size: number }): Promise<void> {
    const key = this.requireKey();
    this.assertDocumentId(input.documentId);
    const prepared = await prepareBrowserDocumentInput(input, this.maxFileSizeBytes);
    const sha256 = await computeSha256(new Uint8Array(prepared.bytes));
    if (sha256 !== expected.sha256 || prepared.bytes.byteLength !== expected.size) throw new Error('Wskazany plik ma inne bajty niż oryginał.');
    let current: StoredBrowserDocument | null = null;
    try { current = await this.getDocument(input.documentId); }
    catch { /* Corrupt authenticated ciphertext can be repaired with independently verified original bytes. */ }
    if (current && current.sha256 === sha256 && current.size === expected.size) return;
    const records = (await this.backend.list()).filter((record) => record.documentId !== input.documentId);
    if (await this.totalBytes(records, key) + prepared.bytes.byteLength > this.maxTotalSizeBytes) throw new BrowserStorageError('QUOTA_EXCEEDED', 'Lokalny limit magazynu dokumentów został przekroczony.');
    const payload: EncryptedDocumentPayload = { version: '1.0', bytes: new Uint8Array(prepared.bytes), metadata: {
      originalFileName: prepared.fileName, mimeType: prepared.mimeType, extension: prepared.extension,
      size: prepared.bytes.byteLength, sha256, importedAt: input.importedAt || new Date().toISOString(), signatureStatus: prepared.signatureStatus,
    } };
    await this.backend.put({ documentId: input.documentId, encryptedPayload: await this.encryptPayload(input.documentId, payload, key) });
  }

  async listMetadata(): Promise<BrowserDocumentMetadata[]> {
    const key = this.requireKey();
    const records = await this.backend.list();
    const result: BrowserDocumentMetadata[] = [];
    for (const record of records) {
      const payload = await this.decryptPayload(record, key);
      result.push({ documentId: record.documentId, ...payload.metadata, backend: this.backend.kind });
    }
    return result;
  }

  async count(): Promise<number> {
    return (await this.backend.list()).length;
  }

  async usageBytes(): Promise<number> {
    return this.totalBytes(await this.backend.list(), this.requireKey());
  }

  async deleteDocument(documentId: string): Promise<boolean> {
    this.requireKey();
    return this.backend.delete(documentId);
  }

  async clear(): Promise<void> {
    this.requireKey();
    await this.backend.clear();
  }

  /** Snapshot contains only technical IDs and encrypted payloads. */
  async exportEncryptedSnapshot(): Promise<EncryptedDocumentSnapshot> {
    return { version: '1.0', vaultId: this.vaultId, records: await this.backend.list() };
  }

  /** Copies authenticated ciphertext syntax without assuming that the legacy key is readable. */
  async copyLegacyEncryptedSnapshot(snapshot: EncryptedDocumentSnapshot): Promise<boolean> {
    if (snapshot.version !== '1.0' || snapshot.vaultId !== this.vaultId || snapshot.records.length > 100_000) throw new Error('Nieprawidłowy snapshot migracji.');
    const ids = new Set<string>();
    for (const record of snapshot.records) {
      this.assertDocumentId(record.documentId);
      if (ids.has(record.documentId)) throw new Error('Powtórzone ID w snapshocie migracji.');
      ids.add(record.documentId);
      validateEncryptedDocumentBytes(record.encryptedPayload);
    }
    if (!this.backend.copyIntoEmpty) throw new Error('Backend nie obsługuje atomowej migracji.');
    return this.backend.copyIntoEmpty(snapshot.records);
  }

  /** Validates and decrypts every record before mutating the local store. */
  async importEncryptedSnapshot(snapshot: unknown, options: ImportEncryptedSnapshotOptions = {}): Promise<number> {
    const key = this.requireKey();
    if (!isRecord(snapshot) || snapshot.version !== '1.0' || snapshot.vaultId !== this.vaultId || !Array.isArray(snapshot.records)) throw new Error('Nieprawidłowy snapshot dokumentów lub sejf docelowy.');
    if (snapshot.records.length > 100_000) throw new Error('Snapshot zawiera zbyt wiele dokumentów.');
    const records = snapshot.records as EncryptedDocumentStorageRecord[];
    const seen = new Set<string>();
    const decoded: EncryptedDocumentStorageRecord[] = [];
    for (const record of records) {
      if (!isRecord(record) || typeof record.documentId !== 'string' || seen.has(record.documentId)) throw new Error('Snapshot zawiera nieprawidłowe lub powtórzone ID dokumentu.');
      this.assertDocumentId(record.documentId);
      seen.add(record.documentId);
      const normalized = { documentId: record.documentId, encryptedPayload: record.encryptedPayload } as EncryptedDocumentStorageRecord;
      validateEncryptedDocumentBytes(normalized.encryptedPayload);
      const payload = await this.decryptPayload(normalized, key);
      const bytes = payload.bytes;
      await this.assertPayloadIntegrity(payload, bytes);
      decoded.push(cloneEncryptedRecord(normalized));
    }
    const existing = await this.backend.list();
    if (!options.replaceExisting && decoded.some((record) => existing.some((current) => current.documentId === record.documentId))) throw new Error('Snapshot zawiera dokument, który już istnieje.');
    const finalRecords = options.replaceExisting ? decoded : [...existing, ...decoded];
    const total = await this.totalBytes(finalRecords, key);
    if (total > this.maxTotalSizeBytes) throw new BrowserStorageError('QUOTA_EXCEEDED', 'Kopia przekracza lokalny limit magazynu.');
    if (this.backend.replaceAll) {
      await this.backend.replaceAll(finalRecords);
    } else {
      // Custom backends must restore the previous records if a write fails.
      try {
        if (options.replaceExisting) await this.backend.clear();
        for (const record of decoded) await this.backend.put(record);
      } catch (error) {
        await this.backend.clear();
        for (const record of existing) await this.backend.put(record);
        throw error;
      }
    }
    return decoded.length;
  }

  /** Roll back an already exported encrypted snapshot after a coordinated persistence failure.
   * Original records may belong to the previous key; no plaintext is read here.
   */
  async rollbackEncryptedSnapshot(snapshot: EncryptedDocumentSnapshot): Promise<void> {
    if (snapshot.version !== '1.0' || snapshot.vaultId !== this.vaultId) throw new Error('Nieprawidłowy snapshot odtwarzania.');
    const ids = new Set<string>();
    for (const record of snapshot.records) {
      this.assertDocumentId(record.documentId);
      if (ids.has(record.documentId)) throw new Error('Powtórzone ID w snapshocie odtwarzania.');
      ids.add(record.documentId);
      validateEncryptedDocumentBytes(record.encryptedPayload);
    }
    if (!this.backend.replaceAll) throw new Error('Backend nie obsługuje atomowego odtwarzania.');
    await this.backend.replaceAll(snapshot.records);
  }

  private requireKey(): Uint8Array {
    if (!this.vaultKey) throw new Error('Sejf dokumentów jest zablokowany. Odblokuj go kluczem sejfu.');
    return this.vaultKey;
  }

  private assertDocumentId(documentId: string): void {
    if (!/^[-_a-zA-Z0-9:.]{1,160}$/.test(documentId)) throw new BrowserStorageError('INVALID_DOCUMENT_ID', 'Techniczny identyfikator dokumentu jest nieprawidłowy.');
  }

  private context(documentId: string): string {
    return `tywygrywasz:${this.vaultId}:${documentId}:document-payload-v1`;
  }

  private async encryptPayload(documentId: string, payload: EncryptedDocumentPayload, key: Uint8Array): Promise<EncryptedDocumentBytes> {
    const metadataBytes = new TextEncoder().encode(JSON.stringify({ version: payload.version, metadata: payload.metadata }));
    const framed = new Uint8Array(4 + metadataBytes.byteLength + payload.bytes.byteLength);
    new DataView(framed.buffer).setUint32(0, metadataBytes.byteLength);
    framed.set(metadataBytes, 4);
    framed.set(payload.bytes, 4 + metadataBytes.byteLength);
    return encryptDocumentBytes(framed, key, this.context(documentId));
  }

  private async decryptPayload(record: EncryptedDocumentStorageRecord, key: Uint8Array): Promise<EncryptedDocumentPayload> {
    validateEncryptedDocumentBytes(record.encryptedPayload);
    let plaintext: Uint8Array;
    try {
      plaintext = await decryptDocumentBytes(record.encryptedPayload, key, this.context(record.documentId));
    } catch {
      throw new Error('Nie można odszyfrować metadanych dokumentu: nieprawidłowy klucz lub uszkodzony szyfrogram.');
    }
    if (plaintext.byteLength < 4) throw new Error('Nieprawidłowa zawartość zaszyfrowanego dokumentu.');
    const metadataLength = new DataView(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength).getUint32(0);
    if (metadataLength <= 0 || metadataLength > plaintext.byteLength - 4) throw new Error('Nieprawidłowa długość metadanych dokumentu.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext.slice(4, 4 + metadataLength)));
    } catch {
      throw new Error('Nieprawidłowe metadane zaszyfrowanego dokumentu.');
    }
    if (!isRecord(parsed) || parsed.version !== '1.0' || !isRecord(parsed.metadata)) throw new Error('Nieprawidłowa zawartość zaszyfrowanego dokumentu.');
    const metadata = parsed.metadata;
    if (typeof metadata.originalFileName !== 'string' || typeof metadata.mimeType !== 'string' || metadata.mimeType.length > 160 || typeof metadata.extension !== 'string' || !SUPPORTED_DOCUMENT_EXTENSIONS.includes(metadata.extension as SupportedDocumentExtension) || !Number.isSafeInteger(metadata.size) || (metadata.size as number) <= 0 || (metadata.size as number) > this.maxFileSizeBytes || typeof metadata.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(metadata.sha256) || typeof metadata.importedAt !== 'string' || !Number.isFinite(Date.parse(metadata.importedAt)) || !['verified', 'not-verified', 'not-applicable'].includes(metadata.signatureStatus as string)) throw new Error('Nieprawidłowe metadane oryginału.');
    normalizeFileName(metadata.originalFileName);
    return { version: '1.0', metadata: metadata as unknown as EncryptedDocumentPayload['metadata'], bytes: plaintext.slice(4 + metadataLength) };
  }

  private async assertPayloadIntegrity(payload: EncryptedDocumentPayload, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength !== payload.metadata.size || await computeSha256(bytes) !== payload.metadata.sha256) throw new Error('Naruszenie integralności oryginalnych bajtów dokumentu.');
  }

  private async totalBytes(records: EncryptedDocumentStorageRecord[], key: Uint8Array): Promise<number> {
    let total = 0;
    for (const record of records) {
      const payload = await this.decryptPayload(record, key);
      total += payload.metadata.size;
    }
    return total;
  }
}
