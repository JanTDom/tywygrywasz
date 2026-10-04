import { describe, expect, it } from 'vitest';
import {
  computeSha256,
  deriveKey,
  decryptVault,
  encryptVault,
  migrateEncryptedContainer,
  rewrapVaultPassphrase,
  validateEncryptedContainer,
} from '../src/domain/crypto';

describe('Vault envelope encryption', () => {
  const firstPassword = 'PierwszeHasloSejfu2026!';
  const nextPassword = 'NoweHasloSejfu2026!';

  it('encrypts with a random vault key wrapped by the passphrase', async () => {
    const container = await encryptVault('{"vaultId":"envelope-test"}', firstPassword);

    expect(container.version).toBe('1.1');
    expect(container.keyMode).toBe('wrapped-vault-key');
    expect(container.wrappedVaultKeyHex).toHaveLength(96);
    expect(container.keyWrapIvHex).toHaveLength(24);
    expect(await decryptVault(container, firstPassword)).toContain('envelope-test');
  });

  it('rewraps the vault key without changing the encrypted manifest', async () => {
    const container = await encryptVault('{"vaultId":"rewrap-test"}', firstPassword);
    const rewrapped = await rewrapVaultPassphrase(container, firstPassword, nextPassword);

    expect(rewrapped.ciphertextHex).toBe(container.ciphertextHex);
    expect(rewrapped.ivHex).toBe(container.ivHex);
    expect(rewrapped.wrappedVaultKeyHex).not.toBe(container.wrappedVaultKeyHex);
    await expect(decryptVault(rewrapped, nextPassword)).resolves.toContain('rewrap-test');
    await expect(decryptVault(rewrapped, firstPassword)).rejects.toThrow();
  });

  it('rejects untrusted or computationally unbounded container metadata', () => {
    expect(() => validateEncryptedContainer({})).toThrow();
    expect(() => validateEncryptedContainer({
      version: '1.0',
      algorithm: 'AES-GCM-256',
      kdf: 'PBKDF2-SHA-256',
      iterations: 50_000,
      saltHex: '00'.repeat(16),
      ivHex: '00'.repeat(12),
      ciphertextHex: '00'.repeat(16),
      manifestSha256: '00'.repeat(32),
    })).toThrow(/iteracji KDF/);
  });

  it('migrates a legacy container through the compatibility path', async () => {
    const plaintext = '{"vaultId":"migration-test"}';
    const plaintextBytes = new TextEncoder().encode(plaintext);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(firstPassword, salt, 100_000);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      plaintextBytes as unknown as BufferSource
    );
    const legacy = {
      version: '1.0' as const,
      algorithm: 'AES-GCM-256' as const,
      kdf: 'PBKDF2-SHA-256' as const,
      iterations: 100_000,
      saltHex: Array.from(salt).map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      ivHex: Array.from(iv).map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      ciphertextHex: Array.from(new Uint8Array(ciphertext)).map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      manifestSha256: await computeSha256(plaintextBytes),
    };
    const migrated = await migrateEncryptedContainer(legacy, firstPassword);
    expect(migrated.version).toBe('1.1');
    await expect(decryptVault(migrated, firstPassword)).resolves.toBe(plaintext);
  });
});
