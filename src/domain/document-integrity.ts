import { computeSha256 } from './crypto';
import type { DocumentRecord } from './types';

export type DocumentIntegrityStatus = 'verified' | 'missing' | 'modified';
export async function verifyOriginalBytes(record: Pick<DocumentRecord, 'originalSha256' | 'fileSize'>, bytes: Uint8Array | null): Promise<DocumentIntegrityStatus> {
  if (!bytes) return 'missing';
  return bytes.byteLength === record.fileSize && await computeSha256(bytes) === record.originalSha256 ? 'verified' : 'modified';
}
/** A replacement locator may change, but replacement evidence must match the immutable original. */
export async function validateRelink(record: Pick<DocumentRecord, 'originalSha256' | 'fileSize'>, bytes: Uint8Array): Promise<void> {
  if (await verifyOriginalBytes(record, bytes) !== 'verified') throw new Error('Wskazany plik ma inne bajty niż oryginał. Dodaj go jako odrębny dokument; dotychczasowy dowód nie został zastąpiony.');
}
