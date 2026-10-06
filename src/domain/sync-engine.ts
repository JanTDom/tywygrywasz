/**
 * TyWygrywasz - End-to-End Encrypted (E2EE) Sync Engine.
 *
 * The server stores an opaque AES-GCM envelope. The outer sync record carries
 * only routing and concurrency metadata; it must never contain a readable
 * manifest or a plaintext manifest fingerprint.
 */

import {
  computeSha256,
  decryptVault,
  encryptVault,
  EncryptedContainer,
  validateEncryptedContainer as validateCryptoEncryptedContainer,
} from './crypto';
import { VaultManifest, parseVaultManifest } from './types';

const RECORD_ID_PATTERN = /^sync-[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REVISION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const HEX_PATTERN = /^[0-9a-f]+$/i;
const MAX_CIPHERTEXT_HEX_LENGTH = 4 * 1024 * 1024;
const MAX_SYNC_REVISION = Number.MAX_SAFE_INTEGER;

/** Optional compatibility field; new payloads omit it. */
export interface SyncRecordPayload {
  recordId: string;
  /** Client supplied value is ignored by the API and replaced by the session owner. */
  userId: string;
  clientDeviceId: string;
  encryptedContainer: EncryptedContainer;
  /** Monotonic version assigned by the server after a successful write. */
  version: number;
  /** Unique opaque attempt id. It is used for idempotent retries. */
  revision: string;
  updatedAt: string;
  /** CAS precondition. 0 means that the caller expects a new record. */
  expectedVersion?: number;
  /** @deprecated Never emitted by the current engine and never persisted by the API. */
  manifestSha256?: string;
}

export interface SyncPrepareOptions {
  /** Server version the caller read before preparing this write. */
  expectedVersion?: number;
  /** Allows a retry to reuse the same revision. */
  revision?: string;
}

export interface SyncConflictItem {
  recordId: string;
  localVersion: number;
  serverVersion: number;
  localUpdatedAt: string;
  serverUpdatedAt: string;
  conflictResolution: 'preserve_both' | 'keep_local' | 'accept_server';
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSafeInteger(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= MAX_SYNC_REVISION;
}

function isHex(value: unknown, exactLength?: number, maxLength?: number): value is string {
  return typeof value === 'string' && value.length > 0 && (!exactLength || value.length === exactLength)
    && (!maxLength || value.length <= maxLength) && value.length % 2 === 0 && HEX_PATTERN.test(value);
}

function randomRevision(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `rev-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

let browserDeviceId: string | undefined;
const DEVICE_STORAGE_KEY = 'tywygrywasz.sync.device-id';

/** Keeps the default device id stable across repeated engine instances. */
function defaultDeviceId(): string {
  if (browserDeviceId) return browserDeviceId;
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      const stored = globalThis.localStorage.getItem(DEVICE_STORAGE_KEY);
      if (stored && DEVICE_ID_PATTERN.test(stored)) {
        browserDeviceId = stored;
        return stored;
      }
      const generated = `device-${randomRevision()}`;
      globalThis.localStorage.setItem(DEVICE_STORAGE_KEY, generated);
      browserDeviceId = generated;
      return generated;
    }
  } catch {
    // Private browsing and test environments may deny localStorage.
  }
  browserDeviceId = `device-${randomRevision()}`;
  return browserDeviceId;
}

function validateEncryptedContainer(value: unknown): EncryptedContainer {
  if (!isRecord(value) || !isHex(value.ciphertextHex, undefined, MAX_CIPHERTEXT_HEX_LENGTH)) {
    throw new Error('Nieprawidłowy szyfrogram synchronizacji.');
  }
  try {
    validateCryptoEncryptedContainer(value);
  } catch {
    throw new Error('Nieprawidłowy szyfrogram synchronizacji.');
  }
  return value;
}

/**
 * Validates and normalizes an untrusted JSON body. The returned object does
 * not carry the legacy top-level manifestSha256 fingerprint.
 */
export function validateSyncRecordPayload(input: unknown): SyncRecordPayload {
  if (!isRecord(input)) throw new Error('Nieprawidłowy pakiet synchronizacyjny.');
  if (typeof input.recordId !== 'string' || !RECORD_ID_PATTERN.test(input.recordId)) {
    throw new Error('Nieprawidłowy identyfikator rekordu synchronizacji.');
  }
  if (typeof input.userId !== 'string' || input.userId.length > 256) {
    throw new Error('Nieprawidłowy właściciel pakietu synchronizacyjnego.');
  }
  if (typeof input.clientDeviceId !== 'string' || !DEVICE_ID_PATTERN.test(input.clientDeviceId)) {
    throw new Error('Nieprawidłowy identyfikator urządzenia.');
  }
  if (!isSafeInteger(input.version, 1)) throw new Error('Nieprawidłowa wersja pakietu synchronizacyjnego.');
  if (typeof input.revision !== 'string' || !REVISION_PATTERN.test(input.revision)) {
    throw new Error('Nieprawidłowa rewizja pakietu synchronizacyjnego.');
  }
  if (typeof input.updatedAt !== 'string' || !Number.isFinite(Date.parse(input.updatedAt))) {
    throw new Error('Nieprawidłowa data pakietu synchronizacyjnego.');
  }
  if (input.expectedVersion !== undefined && !isSafeInteger(input.expectedVersion, 0)) {
    throw new Error('Nieprawidłowa wersja bazowa synchronizacji.');
  }

  const encryptedContainer = validateEncryptedContainer(input.encryptedContainer);
  const normalized: SyncRecordPayload = {
    recordId: input.recordId,
    userId: input.userId,
    clientDeviceId: input.clientDeviceId,
    encryptedContainer,
    version: input.version,
    revision: input.revision,
    updatedAt: input.updatedAt,
  };
  if (input.expectedVersion !== undefined) normalized.expectedVersion = input.expectedVersion;
  return normalized;
}

export class E2EESyncEngine {
  private userId: string;
  private clientDeviceId: string;
  private currentVersion = 1;

  constructor(userId = 'citizen-user-01', clientDeviceId = defaultDeviceId()) {
    this.userId = userId;
    this.clientDeviceId = clientDeviceId;
  }

  /**
   * Tworzy szyfrowaną kopertę. `expectedVersion` jest opcjonalne dla
   * kompatybilności ze starym klientem, ale nowe klienty powinny przekazywać
   * wersję odczytaną z GET /api/sync.
   */
  public async prepareSyncPayload(
    manifest: VaultManifest,
    userPassphrase: string,
    options: SyncPrepareOptions = {},
  ): Promise<SyncRecordPayload> {
    const rawJson = JSON.stringify(manifest, null, 2);
    // Cloud sync must not expose even a deterministic hash of the private
    // manifest; AES-GCM authentication already detects tampering.
    const encryptedContainer = await encryptVault(rawJson, userPassphrase, { includeManifestSha256: false });
    const expectedVersion = options.expectedVersion;
    const version = expectedVersion === undefined ? this.currentVersion : expectedVersion + 1;
    const candidate: SyncRecordPayload = {
      recordId: `sync-${manifest.vaultId}`,
      userId: this.userId,
      clientDeviceId: this.clientDeviceId,
      encryptedContainer,
      version,
      revision: options.revision || randomRevision(),
      updatedAt: new Date().toISOString(),
    };
    if (expectedVersion !== undefined) candidate.expectedVersion = expectedVersion;
    return validateSyncRecordPayload(candidate);
  }

  /**
   * Wykrywa rozjazd pomiędzy stanem lokalnym a serwerowym. Nie porównuje
   * plaintextowego skrótu manifestu; kryptogram AES-GCM jest celowo losowy.
   */
  public detectConflict(params: {
    localRecord: SyncRecordPayload;
    serverRecord: SyncRecordPayload;
  }): SyncConflictItem | null {
    if (params.localRecord.revision === params.serverRecord.revision) return null;

    if (
      params.serverRecord.version > params.localRecord.version
      || params.serverRecord.version === params.localRecord.version
    ) {
      return {
        recordId: params.localRecord.recordId,
        localVersion: params.localRecord.version,
        serverVersion: params.serverRecord.version,
        localUpdatedAt: params.localRecord.updatedAt,
        serverUpdatedAt: params.serverRecord.updatedAt,
        conflictResolution: 'preserve_both',
      };
    }

    return null;
  }

  /** Bezpiecznie odszyfrowuje kopertę otrzymaną z serwera. */
  public async decryptSyncPayload(
    payload: SyncRecordPayload,
    userPassphrase: string,
  ): Promise<VaultManifest> {
    const normalized = validateSyncRecordPayload(payload);
    const decryptedJson = await decryptVault(normalized.encryptedContainer, userPassphrase);
    return parseVaultManifest(JSON.parse(decryptedJson));
  }
}

/** Internal helper for legacy-row migration without exposing plaintext. */
export async function legacyRevision(recordId: string, encryptedContainer: EncryptedContainer): Promise<string> {
  const digest = await computeSha256(`${recordId}:${encryptedContainer.ciphertextHex}`);
  return `legacy-${digest.slice(0, 48)}`;
}

export interface SyncManifestComparison {
  changed: boolean;
  local: { cases: number; documents: number; letters: number };
  server: { cases: number; documents: number; letters: number };
  changedCollections: string[];
}

/** Comparison happens after decryption, entirely on the client. Never expose a digest in the sync DTO. */
export function compareSyncManifests(local: VaultManifest, server: VaultManifest): SyncManifestComparison {
  if (local.vaultId !== server.vaultId) throw new Error('Pobrana struktura należy do innego sejfu.');
  const collections = ['cases', 'documents', 'documentVersions', 'extractedFields', 'events', 'deadlines', 'legalSources', 'legalAnalyses', 'letters', 'relations', 'inboxProposals', 'history'] as const;
  const changedCollections = collections.filter((name) => JSON.stringify(local[name] ?? []) !== JSON.stringify(server[name] ?? []));
  return {
    changed: changedCollections.length > 0,
    local: { cases: local.cases.length, documents: local.documents.length, letters: local.letters.length },
    server: { cases: server.cases.length, documents: server.documents.length, letters: server.letters.length },
    changedCollections,
  };
}
