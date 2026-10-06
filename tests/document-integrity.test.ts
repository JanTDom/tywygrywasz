import { describe, expect, it } from 'vitest';
import { computeSha256 } from '../src/domain/crypto';
import { validateRelink, verifyOriginalBytes } from '../src/domain/document-integrity';

describe('Original-byte verification and relinking', () => {
  it('accepts a relocated identical original and rejects a same-size altered document', async () => {
    const original = new Uint8Array([1, 2, 3, 4]);
    const record = { originalSha256: await computeSha256(original), fileSize: original.length };
    expect(await verifyOriginalBytes(record, null)).toBe('missing');
    expect(await verifyOriginalBytes(record, original.slice())).toBe('verified');
    expect(await verifyOriginalBytes(record, new Uint8Array([1, 2, 3, 5]))).toBe('modified');
    await expect(validateRelink(record, original)).resolves.toBeUndefined();
    await expect(validateRelink(record, new Uint8Array([1, 2, 3, 5]))).rejects.toThrow('inne bajty');
  });
});
