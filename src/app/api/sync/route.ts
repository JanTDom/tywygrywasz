/**
 * Obywatel - Zero-Knowledge E2EE Server Sync Route
 * Stores only the client-encrypted structure. Authentication comes from the
 * server session cookie; client supplied user IDs and fallback identities are ignored.
 * The Map is a development adapter and must be replaced with PostgreSQL before production.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SyncRecordPayload } from '@/domain/sync-engine';
import { getSupabaseAdminClient } from '@/domain/auth-store';
import { csrfIsValid, jsonError, userFromRequest } from '../auth/_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vercel Functions reject request bodies above roughly 4.5 MB before this
// handler runs. Keep a lower application limit and preserve a clear error.
const MAX_SYNC_BODY_BYTES = 4 * 1024 * 1024;
const serverEncryptedStore: Map<string, SyncRecordPayload> = new Map();

function sameOwner(record: SyncRecordPayload, userId: string): boolean {
  return record.userId === userId;
}

async function parsePayload(req: NextRequest): Promise<SyncRecordPayload> {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_SYNC_BODY_BYTES) throw new Error('Pakiet synchronizacyjny jest zbyt duży.');
  return JSON.parse(raw) as SyncRecordPayload;
}

async function readRecord(recordId: string): Promise<SyncRecordPayload | null> {
  const db = getSupabaseAdminClient();
  if (!db) return serverEncryptedStore.get(recordId) || null;
  const { data, error } = await db.from('sync_records').select('record_id,user_id,payload').eq('record_id', recordId).maybeSingle();
  if (error || !data) return null;
  const payload = data.payload as SyncRecordPayload;
  // The relational owner column is authoritative even if a legacy payload
  // contains a stale or tampered userId field.
  payload.userId = data.user_id as string;
  return payload;
}

async function writeRecord(payload: SyncRecordPayload): Promise<void> {
  const db = getSupabaseAdminClient();
  if (!db) {
    serverEncryptedStore.set(payload.recordId, payload);
    return;
  }
  const { error } = await db.from('sync_records').upsert({
    record_id: payload.recordId,
    user_id: payload.userId,
    payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'record_id' });
  if (error) throw new Error('Nie udało się zapisać pakietu synchronizacyjnego.');
}

export async function GET(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return jsonError('Wymagane zalogowanie do synchronizacji.', 401);

  const { searchParams } = new URL(req.url);
  const recordId = searchParams.get('recordId');
  if (!recordId) return jsonError('Brak wymaganego recordId.', 400);

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
    if (!payload.recordId || !payload.encryptedContainer || typeof payload.recordId !== 'string') {
      return jsonError('Nieprawidłowy pakiet synchronizacyjny (brak szyfrogramu).', 400);
    }

    const existing = await readRecord(payload.recordId);
    if (existing && !sameOwner(existing, user.id)) return jsonError('Rekord nie istnieje.', 404);

    // Never trust the owner from the body. It is derived from the session.
    payload.userId = user.id;
    await writeRecord(payload);

    return NextResponse.json({
      success: true,
      recordId: payload.recordId,
      version: payload.version,
      updatedAt: payload.updatedAt,
      serverMessage: 'Szyfrogram zapisany na serwerze bez znajomości kluczy.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Błąd synchronizacji serwerowej.', 400);
  }
}
