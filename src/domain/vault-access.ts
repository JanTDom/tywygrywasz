import { generateVaultKey, unwrapVaultKey, wrapVaultKey, type VaultKeyEnvelope } from './crypto';

/** Recovery secrets never go to the account API or persistent plaintext storage. */
export function encodeRecoveryKey(key: Uint8Array): string {
  if (key.byteLength !== 32) throw new Error('Klucz sejfu musi mieć 256 bitów.');
  return `TWY-${Array.from(key, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function decodeRecoveryKey(value: string): Uint8Array {
  const cleaned = value.trim();
  if (!/^TWY-[a-f0-9]{64}$/i.test(cleaned)) throw new Error('Nieprawidłowy klucz odzyskiwania.');
  return new Uint8Array(cleaned.slice(4).match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)));
}

export function validateVaultPassword(password: string): void {
  if (password.length < 12 || password.length > 256) throw new Error('Hasło sejfu musi mieć od 12 do 256 znaków.');
}

export async function createVaultAccess(password: string): Promise<{ key: Uint8Array; envelope: VaultKeyEnvelope }> {
  validateVaultPassword(password);
  const key = generateVaultKey();
  return { key, envelope: await wrapVaultKey(key, password) };
}

export async function unlockVaultAccess(envelope: VaultKeyEnvelope, password: string): Promise<Uint8Array> {
  return /^TWY-[a-f0-9]{64}$/i.test(password.trim()) ? decodeRecoveryKey(password) : unwrapVaultKey(envelope, password);
}

export const vaultManifestStorageKey = (owner: string) => `tywygrywasz-vault-${owner}`;
export const vaultEnvelopeStorageKey = (owner: string) => `tywygrywasz-key-envelope-${owner}`;
