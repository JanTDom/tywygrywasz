/**
 * Client-side vault cryptography.
 *
 * Backups use an envelope-encryption layout: a random 256-bit vault key
 * encrypts the manifest, while the passphrase only wraps that key. This
 * keeps the account password out of the document encryption path and allows
 * a future password change to re-wrap the key without re-encrypting data.
 *
 * Legacy 1.0 containers (where PBKDF2 directly derived the content key) are
 * still accepted and can be migrated with migrateEncryptedContainer().
 */

export const LEGACY_KDF_ITERATIONS = 100_000;
export const DEFAULT_KDF_ITERATIONS = 210_000;
export const MIN_KDF_ITERATIONS = 100_000;
export const MAX_KDF_ITERATIONS = 600_000;
export const MAX_CIPHERTEXT_BYTES = 64 * 1024 * 1024;
export const MAX_PLAINTEXT_BYTES = MAX_CIPHERTEXT_BYTES - 16;
export const VAULT_KEY_BYTES = 32;

type Hex = string;

export interface EncryptedContainer {
  version: '1.0' | '1.1';
  algorithm: 'AES-GCM-256';
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  /** PBKDF2 salt used only to wrap the vault key in version 1.1. */
  saltHex: Hex;
  /** AES-GCM IV used for manifest ciphertext. */
  ivHex: Hex;
  ciphertextHex: Hex;
  /** Optional local integrity aid. Cloud sync omits it because even a hash is private metadata. */
  manifestSha256?: Hex;
  /** Version 1.1 envelope-encryption metadata. */
  keyMode?: 'direct-passphrase' | 'wrapped-vault-key';
  wrappedVaultKeyHex?: Hex;
  keyWrapIvHex?: Hex;
}

/** A portable wrapper for a random vault key. Keep this separate from user profile data. */
export interface VaultKeyEnvelope {
  version: '1.0';
  algorithm: 'AES-GCM-256';
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  saltHex: Hex;
  ivHex: Hex;
  wrappedVaultKeyHex: Hex;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(value: unknown, field: string, expectedBytes?: number): Uint8Array {
  if (typeof value !== 'string' || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) {
    throw new Error(`Nieprawidłowy zapis pola ${field}.`);
  }
  const byteLength = value.length / 2;
  if (byteLength > MAX_CIPHERTEXT_BYTES) {
    throw new Error(`Pole ${field} przekracza dozwolony rozmiar kopii.`);
  }
  if (expectedBytes !== undefined && byteLength !== expectedBytes) {
    throw new Error(`Nieprawidłowa długość pola ${field}.`);
  }
  const bytes = new Uint8Array(byteLength);
  for (let index = 0; index < byteLength; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function assertIterations(iterations: unknown): asserts iterations is number {
  if (
    typeof iterations !== 'number' ||
    !Number.isSafeInteger(iterations) ||
    iterations < MIN_KDF_ITERATIONS ||
    iterations > MAX_KDF_ITERATIONS
  ) {
    throw new Error(
      `Nieprawidłowa liczba iteracji KDF. Dozwolony zakres: ${MIN_KDF_ITERATIONS}–${MAX_KDF_ITERATIONS}.`
    );
  }
}

function assertPassphrase(passphrase: unknown): asserts passphrase is string {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new Error('Hasło szyfrowania nie może być puste.');
  }
}

function assertPlaintextSize(plaintextBytes: Uint8Array): void {
  if (plaintextBytes.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new Error('Zawartość kopii przekracza maksymalny rozmiar 64 MB.');
  }
}

function assertAesGcmCiphertextSize(ciphertext: Uint8Array): void {
  // AES-GCM always appends a 16-byte authentication tag.
  if (ciphertext.byteLength < 16 || ciphertext.byteLength > MAX_CIPHERTEXT_BYTES) {
    throw new Error('Nieprawidłowy rozmiar szyfrogramu kopii.');
  }
}

export async function computeSha256(data: string | Uint8Array): Promise<string> {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as unknown as BufferSource);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/** Validate an untrusted JSON backup envelope before doing any expensive KDF work. */
export function validateEncryptedContainer(value: unknown): asserts value is EncryptedContainer {
  if (!isRecord(value)) throw new Error('Nieprawidłowy format kopii zapasowej.');
  if (value.version !== '1.0' && value.version !== '1.1') {
    throw new Error('Nieobsługiwana wersja kopii zapasowej.');
  }
  if (value.algorithm !== 'AES-GCM-256' || value.kdf !== 'PBKDF2-SHA-256') {
    throw new Error('Nieobsługiwany format lub algorytm kontenera szyfrowanego.');
  }
  assertIterations(value.iterations);
  hexToBytes(value.saltHex, 'saltHex', 16);
  hexToBytes(value.ivHex, 'ivHex', 12);
  const ciphertext = hexToBytes(value.ciphertextHex, 'ciphertextHex');
  assertAesGcmCiphertextSize(ciphertext);
  if (value.manifestSha256 !== undefined && (typeof value.manifestSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(value.manifestSha256))) {
    throw new Error('Nieprawidłowa suma kontrolna manifestu kopii.');
  }

  if (value.version === '1.0') {
    if (!value.manifestSha256) throw new Error('Starsza kopia nie zawiera sumy kontrolnej manifestu.');
    if (value.keyMode && value.keyMode !== 'direct-passphrase') {
      throw new Error('Nieprawidłowy tryb klucza starszej kopii.');
    }
    return;
  }

  if (value.keyMode !== 'wrapped-vault-key') {
    throw new Error('Kopia 1.1 nie zawiera bezpiecznego opakowania klucza sejfu.');
  }
  hexToBytes(value.keyWrapIvHex, 'keyWrapIvHex', 12);
  // 32-byte AES key + 16-byte GCM authentication tag.
  hexToBytes(value.wrappedVaultKeyHex, 'wrappedVaultKeyHex', VAULT_KEY_BYTES + 16);
}

function validateVaultKey(vaultKey: Uint8Array): void {
  if (!(vaultKey instanceof Uint8Array) || vaultKey.byteLength !== VAULT_KEY_BYTES) {
    throw new Error('Klucz sejfu musi mieć dokładnie 256 bitów.');
  }
}

export function generateVaultKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(VAULT_KEY_BYTES));
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = DEFAULT_KDF_ITERATIONS
): Promise<CryptoKey> {
  assertPassphrase(passphrase);
  if (!(salt instanceof Uint8Array) || salt.byteLength !== 16) {
    throw new Error('Sól KDF musi mieć dokładnie 128 bitów.');
  }
  assertIterations(iterations);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function importVaultKey(vaultKey: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  validateVaultKey(vaultKey);
  return crypto.subtle.importKey(
    'raw',
    vaultKey as unknown as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;
/** A small allowance for authenticated metadata framing around raw bytes. */
export const MAX_DOCUMENT_ENVELOPE_BYTES = MAX_DOCUMENT_BYTES + 64 * 1024;

/** A document envelope contains no readable filename, hash or metadata. */
export interface EncryptedDocumentBytes {
  version: '1.0';
  algorithm: 'AES-GCM-256';
  ivHex: string;
  ciphertextHex: string;
}

function documentHexToBytes(value: unknown, field: string, expectedBytes?: number): Uint8Array {
  if (typeof value !== 'string' || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) {
    throw new Error(`Nieprawidłowy zapis pola ${field} dokumentu.`);
  }
  const byteLength = value.length / 2;
  if (byteLength > MAX_DOCUMENT_ENVELOPE_BYTES + 16 || (expectedBytes !== undefined && byteLength !== expectedBytes)) {
    throw new Error(`Nieprawidłowy rozmiar pola ${field} dokumentu.`);
  }
  const bytes = new Uint8Array(byteLength);
  for (let index = 0; index < byteLength; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

export function validateEncryptedDocumentBytes(value: unknown): asserts value is EncryptedDocumentBytes {
  if (!isRecord(value) || value.version !== '1.0' || value.algorithm !== 'AES-GCM-256') {
    throw new Error('Nieprawidłowy kontener szyfrowanego dokumentu.');
  }
  documentHexToBytes(value.ivHex, 'ivHex', 12);
  const ciphertext = documentHexToBytes(value.ciphertextHex, 'ciphertextHex');
  if (ciphertext.byteLength < 16) throw new Error('Szyfrogram dokumentu nie zawiera znacznika integralności.');
}

/** Context binds the ciphertext to its vault, document ID and payload role. */
export async function encryptDocumentBytes(bytes: Uint8Array, vaultKey: Uint8Array, context: string): Promise<EncryptedDocumentBytes> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_DOCUMENT_ENVELOPE_BYTES) throw new Error('Dokument przekracza limit magazynu.');
  if (!context || context.length > 1024) throw new Error('Brak kontekstu szyfrowania dokumentu.');
  const key = await importVaultKey(vaultKey, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) },
    key,
    bytes as unknown as BufferSource,
  );
  return { version: '1.0', algorithm: 'AES-GCM-256', ivHex: bytesToHex(iv), ciphertextHex: bytesToHex(new Uint8Array(ciphertext)) };
}

export async function decryptDocumentBytes(envelope: EncryptedDocumentBytes, vaultKey: Uint8Array, context: string): Promise<Uint8Array> {
  validateEncryptedDocumentBytes(envelope);
  if (!context || context.length > 1024) throw new Error('Brak kontekstu szyfrowania dokumentu.');
  const key = await importVaultKey(vaultKey, ['decrypt']);
  try {
    const plaintext = new Uint8Array(await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: documentHexToBytes(envelope.ivHex, 'ivHex', 12) as unknown as BufferSource,
        additionalData: new TextEncoder().encode(context),
      },
      key,
      documentHexToBytes(envelope.ciphertextHex, 'ciphertextHex') as unknown as BufferSource,
    ));
    if (plaintext.byteLength > MAX_DOCUMENT_ENVELOPE_BYTES) throw new Error('Dokument przekracza limit magazynu.');
    return plaintext;
  } catch {
    throw new Error('Nie można odszyfrować dokumentu: nieprawidłowy klucz lub uszkodzony szyfrogram.');
  }
}

export async function wrapVaultKey(
  vaultKey: Uint8Array,
  passphrase: string,
  iterations = DEFAULT_KDF_ITERATIONS
): Promise<VaultKeyEnvelope> {
  validateVaultKey(vaultKey);
  assertPassphrase(passphrase);
  assertIterations(iterations);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveKey(passphrase, salt, iterations);
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, vaultKey as unknown as BufferSource);
  return {
    version: '1.0',
    algorithm: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA-256',
    iterations,
    saltHex: bytesToHex(salt),
    ivHex: bytesToHex(iv),
    wrappedVaultKeyHex: bytesToHex(new Uint8Array(wrapped)),
  };
}

export async function unwrapVaultKey(
  envelope: VaultKeyEnvelope,
  passphrase: string
): Promise<Uint8Array> {
  if (!isRecord(envelope) || envelope.version !== '1.0' || envelope.algorithm !== 'AES-GCM-256' || envelope.kdf !== 'PBKDF2-SHA-256') {
    throw new Error('Nieprawidłowe opakowanie klucza sejfu.');
  }
  assertIterations(envelope.iterations);
  const salt = hexToBytes(envelope.saltHex, 'saltHex', 16);
  const iv = hexToBytes(envelope.ivHex, 'ivHex', 12);
  const wrapped = hexToBytes(envelope.wrappedVaultKeyHex, 'wrappedVaultKeyHex', VAULT_KEY_BYTES + 16);
  const wrappingKey = await deriveKey(passphrase, salt, envelope.iterations);
  try {
    const rawKey = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, wrappingKey, wrapped as unknown as BufferSource));
    validateVaultKey(rawKey);
    return rawKey;
  } catch {
    throw new Error('Nie udało się odblokować klucza sejfu. Sprawdź hasło lub kopię.');
  }
}

async function encryptWithKey(plaintextJson: string, vaultKey: Uint8Array): Promise<{
  ivHex: string;
  ciphertextHex: string;
  manifestSha256?: string;
}> {
  return encryptWithKeyOptions(plaintextJson, vaultKey, true);
}

async function encryptWithKeyOptions(plaintextJson: string, vaultKey: Uint8Array, includeManifestSha256: boolean): Promise<{
  ivHex: string;
  ciphertextHex: string;
  manifestSha256?: string;
}> {
  const plaintextBytes = new TextEncoder().encode(plaintextJson);
  assertPlaintextSize(plaintextBytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const contentKey = await importVaultKey(vaultKey, ['encrypt']);
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, contentKey, plaintextBytes as unknown as BufferSource);
  return {
    ivHex: bytesToHex(iv),
    ciphertextHex: bytesToHex(new Uint8Array(ciphertextBuffer)),
    ...(includeManifestSha256 ? { manifestSha256: await computeSha256(plaintextBytes) } : {}),
  };
}

async function decryptWithKey(
  container: EncryptedContainer,
  vaultKey: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array
): Promise<string> {
  const contentKey = await importVaultKey(vaultKey, ['decrypt']);
  const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, contentKey, ciphertext as unknown as BufferSource);
  const plaintextBytes = new Uint8Array(decryptedBuffer);
  assertPlaintextSize(plaintextBytes);
  const computedHash = container.manifestSha256 ? await computeSha256(plaintextBytes) : undefined;
  if (container.manifestSha256 && computedHash?.toLowerCase() !== container.manifestSha256.toLowerCase()) {
    throw new Error('Naruszenie integralności odszyfrowanego sejfu (niezgodność sumy kontrolnej SHA-256).');
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(plaintextBytes);
}

/** Encrypt a manifest with a random vault key, then wrap that key with the passphrase. */
export async function encryptVault(plaintextJson: string, passphrase: string, options: { includeManifestSha256?: boolean } = {}): Promise<EncryptedContainer> {
  assertPassphrase(passphrase);
  const vaultKey = generateVaultKey();
  const keyEnvelope = await wrapVaultKey(vaultKey, passphrase);
  const content = await encryptWithKeyOptions(plaintextJson, vaultKey, options.includeManifestSha256 !== false);
  return {
    version: '1.1',
    algorithm: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA-256',
    iterations: keyEnvelope.iterations,
    saltHex: keyEnvelope.saltHex,
    ivHex: content.ivHex,
    ciphertextHex: content.ciphertextHex,
    ...(content.manifestSha256 ? { manifestSha256: content.manifestSha256 } : {}),
    keyMode: 'wrapped-vault-key',
    wrappedVaultKeyHex: keyEnvelope.wrappedVaultKeyHex,
    keyWrapIvHex: keyEnvelope.ivHex,
  };
}

export async function decryptVault(container: EncryptedContainer, passphrase: string): Promise<string> {
  validateEncryptedContainer(container);
  assertPassphrase(passphrase);
  const salt = hexToBytes(container.saltHex, 'saltHex', 16);
  const contentIv = hexToBytes(container.ivHex, 'ivHex', 12);
  const ciphertext = hexToBytes(container.ciphertextHex, 'ciphertextHex');

  try {
    if (container.version === '1.1') {
      const keyEnvelope: VaultKeyEnvelope = {
        version: '1.0',
        algorithm: 'AES-GCM-256',
        kdf: 'PBKDF2-SHA-256',
        iterations: container.iterations,
        saltHex: container.saltHex,
        ivHex: container.keyWrapIvHex as string,
        wrappedVaultKeyHex: container.wrappedVaultKeyHex as string,
      };
      const vaultKey = await unwrapVaultKey(keyEnvelope, passphrase);
      return await decryptWithKey(container, vaultKey, contentIv, ciphertext);
    }

    // Version 1.0 compatibility: content key was derived directly from passphrase.
    const directKey = await deriveKey(passphrase, salt, container.iterations);
    const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: contentIv as unknown as BufferSource }, directKey, ciphertext as unknown as BufferSource);
    const plaintextBytes = new Uint8Array(decryptedBuffer);
    assertPlaintextSize(plaintextBytes);
    const computedHash = await computeSha256(plaintextBytes);
    if (computedHash.toLowerCase() !== container.manifestSha256!.toLowerCase()) {
      throw new Error('Naruszenie integralności odszyfrowanego sejfu (niezgodność sumy kontrolnej SHA-256).');
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintextBytes);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Naruszenie integralności')) throw err;
    if (err instanceof Error && err.message.includes('Nieprawidłowy rozmiar')) throw err;
    throw new Error('Błąd odszyfrowania: nieprawidłowe hasło lub uszkodzony szyfrogram.');
  }
}

/** Change the wrapping passphrase without re-encrypting the manifest payload. */
export async function rewrapVaultPassphrase(
  container: EncryptedContainer,
  currentPassphrase: string,
  nextPassphrase: string
): Promise<EncryptedContainer> {
  validateEncryptedContainer(container);
  assertPassphrase(currentPassphrase);
  assertPassphrase(nextPassphrase);
  if (container.version === '1.0') {
    return encryptVault(await decryptVault(container, currentPassphrase), nextPassphrase);
  }

  const vaultKey = await unwrapVaultKey(
    {
      version: '1.0',
      algorithm: 'AES-GCM-256',
      kdf: 'PBKDF2-SHA-256',
      iterations: container.iterations,
      saltHex: container.saltHex,
      ivHex: container.keyWrapIvHex as string,
      wrappedVaultKeyHex: container.wrappedVaultKeyHex as string,
    },
    currentPassphrase
  );
  const nextEnvelope = await wrapVaultKey(vaultKey, nextPassphrase);
  return {
    ...container,
    iterations: nextEnvelope.iterations,
    saltHex: nextEnvelope.saltHex,
    keyWrapIvHex: nextEnvelope.ivHex,
    wrappedVaultKeyHex: nextEnvelope.wrappedVaultKeyHex,
  };
}

/** Upgrade a legacy direct-passphrase backup to the envelope format. */
export async function migrateEncryptedContainer(
  container: EncryptedContainer,
  passphrase: string
): Promise<EncryptedContainer> {
  validateEncryptedContainer(container);
  if (container.version === '1.1') return container;
  return encryptVault(await decryptVault(container, passphrase), passphrase);
}
