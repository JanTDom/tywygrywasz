/**
 * TyWygrywasz - zero-knowledge E2EE sync route.
 *
 * The service-role client is server-only. The route stores only a client
 * encrypted envelope and uses an atomic version check for concurrent writes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readLimitedRequestText } from '@/domain/http-body';
import {
  legacyRevision,
  SyncRecordPayload,
  validateSyncRecordPayload,
} from '@/domain/sync-engine';
import { getSupabaseAdminClient } from '@/domain/auth-store';
import { csrfIsValid, jsonError, userFromRequest } from '../auth/_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vercel Functions reject request bodies above roughly 4.5 MB before this
// handler runs. Keep a lower application limit and preserve a clear error.
const MAX_SYNC_BODY_BYTES = 4 * 1024 * 1024;
const serverEncryptedStore: Map<string, SyncRecordPayload> = new Map();

type DurableSyncRow = {
  record_id: string;
  user_id: string;
  payload: unknown;
  version?: number | string | null;
  revision?: string | null;
  updated_at?: string | null;
};

class SyncConflictError extends Error {
  public readonly status = 409;
  public readonly currentVersion: number;
  public readonly currentUpdatedAt: string;

  constructor(current: SyncRecordPayload) {
    super('Rekord został zmieniony na innym urządzeniu. Pobierz najnowszą wersję i wybierz sposób rozwiązania konfliktu.');
    this.name = 'SyncConflictError';
    this.currentVersion = current.version;
    this.currentUpdatedAt = current.updatedAt;
  }
}

class SyncSchemaError extends Error {
  public readonly status = 503;

  constructor() {
    super('Synchronizacja jest chwilowo niedostępna. Dokończ migrację bazy danych synchronizacji.');
    this.name = 'SyncSchemaError';
  }
}

function sameOwner(record: SyncRecordPayload, userId: string): boolean {
  return record.userId === userId;
}

async function parsePayload(req: NextRequest): Promise<SyncRecordPayload> {
  const raw = await readLimitedRequestText(req, MAX_SYNC_BODY_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Nieprawidłowy JSON pakietu synchronizacyjnego.');
  }
  return validateSyncRecordPayload(parsed);
}

function rowLooksLikeMissingConcurrencyColumns(error: { code?: string; message?: string } | null): boolean {
  const message = error?.message || '';
  return error?.code === '42703' || /column .*version|column .*revision|schema cache/i.test(message);
}

async function normalizeStoredRecord(row: DurableSyncRow): Promise<SyncRecordPayload> {
  if (!row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) {
    throw new Error('Uszkodzony rekord synchronizacji.');
  }
  const payload = { ...(row.payload as Record<string, unknown>) };
  const container = payload.encryptedContainer;
  const candidate = {
    ...payload,
    userId: row.user_id,
    version: Number.isSafeInteger(Number(row.version)) && Number(row.version) >= 1
      ? Number(row.version)
      : payload.version,
    revision: typeof row.revision === 'string' && row.revision
      ? row.revision
      : payload.revision,
    updatedAt: row.updated_at || payload.updatedAt,
  };

  // Rows written before revision columns were introduced get a deterministic
  // opaque id derived from ciphertext, never from decrypted manifest content.
  if (typeof candidate.revision !== 'string' || !candidate.revision) {
    if (!container || typeof container !== 'object') throw new Error('Uszkodzony rekord synchronizacji.');
    candidate.revision = await legacyRevision(row.record_id, container as SyncRecordPayload['encryptedContainer']);
  }
  return validateSyncRecordPayload(candidate);
}

async function readRecord(recordId: string): Promise<SyncRecordPayload | null> {
  const db = getSupabaseAdminClient();
  if (!db) return serverEncryptedStore.get(recordId) || null;

  const result = await db.from('sync_records')
    .select('record_id,user_id,payload,version,revision,updated_at')
    .eq('record_id', recordId)
    .maybeSingle();

  if (!result.error) return result.data ? normalizeStoredRecord(result.data as DurableSyncRow) : null;
  if (!rowLooksLikeMissingConcurrencyColumns(result.error)) return null;

  // Keep reads useful during a rolling deploy while the migration is being
  // applied. Writes remain blocked until the CAS columns exist.
  const legacy = await db.from('sync_records')
    .select('record_id,user_id,payload,updated_at')
    .eq('record_id', recordId)
    .maybeSingle();
  if (legacy.error || !legacy.data) return null;
  return normalizeStoredRecord(legacy.data as DurableSyncRow);
}

function sameCiphertext(left: SyncRecordPayload, right: SyncRecordPayload): boolean {
  const a = left.encryptedContainer;
  const b = right.encryptedContainer;
  return a.ciphertextHex === b.ciphertextHex && a.ivHex === b.ivHex && a.saltHex === b.saltHex;
}

function validateExpectedVersion(payload: SyncRecordPayload): void {
  if (payload.expectedVersion !== undefined && payload.version !== payload.expectedVersion + 1) {
    throw new Error('Wersja pakietu musi być o jeden większa od wersji bazowej.');
  }
}

async function writeRecord(
  payload: SyncRecordPayload,
  userId: string,
  existing: SyncRecordPayload | null,
): Promise<{ record: SyncRecordPayload; idempotent: boolean }> {
  validateExpectedVersion(payload);

  if (existing) {
    // A retry of the same revision is safe and does not create another version.
    if (existing.revision === payload.revision) {
      if (!sameCiphertext(existing, payload)) throw new SyncConflictError(existing);
      return { record: existing, idempotent: true };
    }

    if (payload.expectedVersion !== undefined) {
      if (payload.expectedVersion !== existing.version) throw new SyncConflictError(existing);
    } else if (existing.clientDeviceId !== payload.clientDeviceId) {
      // Legacy clients did not send a CAS precondition. Reject cross-device
      // overwrites rather than silently losing an offline edit.
      throw new SyncConflictError(existing);
    }
  } else if (payload.expectedVersion !== undefined && payload.expectedVersion !== 0) {
    throw new SyncConflictError({ ...payload, version: 0 });
  }

  const now = new Date().toISOString();
  const stored: SyncRecordPayload = {
    ...payload,
    userId,
    // The server is authoritative for the persisted revision number and time.
    version: existing ? existing.version + 1 : 1,
    updatedAt: now,
  };
  // A CAS precondition is a write intent, not part of the persisted record.
  delete stored.expectedVersion;
  delete stored.manifestSha256;

  const db = getSupabaseAdminClient();
  if (!db) {
    const current = serverEncryptedStore.get(payload.recordId);
    // The initial read and this write are separate async operations. Re-check
    // the in-memory adapter so two simultaneous first writes cannot overwrite
    // one another between those operations.
    if (current && (!existing || current.version !== existing.version)) throw new SyncConflictError(current);
    if (!current && existing) throw new SyncConflictError(existing);
    serverEncryptedStore.set(stored.recordId, stored);
    return { record: stored, idempotent: false };
  }

  const row = {
    record_id: stored.recordId,
    user_id: userId,
    payload: stored,
    version: stored.version,
    revision: stored.revision,
    updated_at: stored.updatedAt,
  };

  if (!existing) {
    const inserted = await db.from('sync_records').insert(row).select('record_id').maybeSingle();
    if (!inserted.error) return { record: stored, idempotent: false };
    if (rowLooksLikeMissingConcurrencyColumns(inserted.error)) throw new SyncSchemaError();
    if (inserted.error.code === '23505') {
      const current = await readRecord(stored.recordId);
      if (current) throw new SyncConflictError(current);
    }
    throw new Error('Nie udało się zapisać pakietu synchronizacyjnego.');
  }

  const updated = await db.from('sync_records')
    .update(row)
    .eq('record_id', existing.recordId)
    .eq('user_id', userId)
    .eq('version', existing.version)
    .select('record_id')
    .maybeSingle();
  if (updated.error) {
    if (rowLooksLikeMissingConcurrencyColumns(updated.error)) throw new SyncSchemaError();
    throw new Error('Nie udało się zapisać pakietu synchronizacyjnego.');
  }
  if (!updated.data) {
    const current = await readRecord(stored.recordId);
    if (current) throw new SyncConflictError(current);
    throw new Error('Nie udało się potwierdzić wersji pakietu synchronizacyjnego.');
  }
  return { record: stored, idempotent: false };
}

export async function GET(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return jsonError('Wymagane zalogowanie do synchronizacji.', 401);

  const { searchParams } = new URL(req.url);
  const recordId = searchParams.get('recordId');
  if (!recordId || recordId.length > 256) return jsonError('Brak wymaganego recordId.', 400);

  const record = await readRecord(recordId);
  // Do not reveal whether another user's record exists.
  if (!record || !sameOwner(record, user.id)) return jsonError('Rekord nie istnieje.', 404);
  return NextResponse.json({ success: true, record }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return jsonError('Wymagane zalogowanie do synchronizacji.', 401);
  if (!csrfIsValid(req)) return jsonError('Nieprawidłowy token formularza.', 403);

  try {
    const payload = await parsePayload(req);
    const existing = await readRecord(payload.recordId);
    if (existing && !sameOwner(existing, user.id)) return jsonError('Rekord nie istnieje.', 404);

    const result = await writeRecord(payload, user.id, existing);
    return NextResponse.json({
      success: true,
      recordId: result.record.recordId,
      version: result.record.version,
      revision: result.record.revision,
      updatedAt: result.record.updatedAt,
      idempotent: result.idempotent,
      serverMessage: 'Szyfrogram zapisany na serwerze bez znajomości kluczy.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SyncConflictError) {
      return NextResponse.json({
        success: false,
        code: 'SYNC_CONFLICT',
        error: error.message,
        currentVersion: error.currentVersion,
        currentUpdatedAt: error.currentUpdatedAt,
      }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    }
    if (error instanceof SyncSchemaError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : 'Błąd synchronizacji serwerowej.', 400);
  }
}
