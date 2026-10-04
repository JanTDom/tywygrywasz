import { beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from '../src/app/api/sync/route';
import { NextRequest } from 'next/server';
import { SyncRecordPayload } from '../src/domain/sync-engine';
import { clearAuthStoreForTests } from '../src/domain/auth-store';
import { GET as csrfGet } from '../src/app/api/auth/csrf/route';
import { POST as registerPost } from '../src/app/api/auth/register/route';

function cookieValue(setCookie: string | null, name: string): string {
  const match = setCookie?.match(new RegExp(`${name}=([^;]+)`));
  if (!match) throw new Error(`Missing cookie ${name}`);
  return match[1];
}

describe('API Route /api/sync (sesja serwerowa + izolacja szyfrogramów)', () => {
  const dummyPayload: SyncRecordPayload = {
    recordId: 'sync-test-user-a',
    userId: 'spoofed-client-user',
    clientDeviceId: 'device-test-01',
    encryptedContainer: {
      version: '1.0', algorithm: 'AES-GCM-256', kdf: 'PBKDF2-SHA-256', iterations: 100000,
      ciphertextHex: '0102030405060708090a0b0c0d0e0f10', ivHex: '0102030405060708090a0b0c', saltHex: '0102030405060708090a0b0c0d0e0f10',
      manifestSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    manifestSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    version: 1, revision: 'revision-test-0001', updatedAt: '2026-10-04T12:00:00Z',
  };
  let csrf = '';
  let csrfCookie = '';
  let userACookie = '';
  let userBCookie = '';
  let runId = '';

  beforeEach(async () => {
    clearAuthStoreForTests();
    runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    dummyPayload.recordId = `sync-test-user-a-${runId}`;
    const csrfResponse = await csrfGet(new NextRequest('http://localhost:3000/api/auth/csrf'));
    csrf = (await csrfResponse.json()).csrfToken;
    csrfCookie = cookieValue(csrfResponse.headers.get('set-cookie'), 'obywatel_csrf');

    const register = async (name: string, email: string) => registerPost(new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `obywatel_csrf=${csrfCookie}`, 'x-csrf-token': csrf },
      body: JSON.stringify({ name, email, password: 'BardzoMocneHaslo!2026' }),
    }));
    userACookie = `obywatel_session=${cookieValue((await register('Użytkownik A', 'a@example.test')).headers.get('set-cookie'), 'obywatel_session')}; obywatel_csrf=${csrfCookie}`;
    userBCookie = `obywatel_session=${cookieValue((await register('Użytkownik B', 'b@example.test')).headers.get('set-cookie'), 'obywatel_session')}; obywatel_csrf=${csrfCookie}`;
  });

  it('wymaga zweryfikowanej sesji, nawet gdy klient podaje x-user-id', async () => {
    const response = await POST(new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-a', 'x-csrf-token': csrf, Cookie: `obywatel_csrf=${csrfCookie}` }, body: JSON.stringify(dummyPayload),
    }));
    expect(response.status).toBe(401);
  });

  it('zapisuje i odczytuje szyfrogram w sesji A', async () => {
    const post = await POST(new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: userACookie, 'x-csrf-token': csrf }, body: JSON.stringify(dummyPayload),
    }));
    expect(post.status).toBe(200);
    expect((await post.json()).success).toBe(true);

    const get = await GET(new NextRequest(`http://localhost:3000/api/sync?recordId=${dummyPayload.recordId}`, { headers: { Cookie: userACookie } }));
    expect(get.status).toBe(200);
    const data = await get.json();
    expect(data.record.userId).not.toBe('spoofed-client-user');
    expect(data.record.encryptedContainer.ciphertextHex).toBe('0102030405060708090a0b0c0d0e0f10');
    expect(data.record.manifestSha256).toBeUndefined();
  });

  it('nie ujawnia rekordu A użytkownikowi B i blokuje jego nadpisanie', async () => {
    await POST(new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: userACookie, 'x-csrf-token': csrf }, body: JSON.stringify(dummyPayload),
    }));
    const get = await GET(new NextRequest(`http://localhost:3000/api/sync?recordId=${dummyPayload.recordId}`, { headers: { Cookie: userBCookie } }));
    expect(get.status).toBe(404);

    const post = await POST(new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: userBCookie, 'x-csrf-token': csrf }, body: JSON.stringify({ ...dummyPayload, version: 2 }),
    }));
    expect(post.status).toBe(404);
  });

  it('wykonuje atomiczny CAS i odrzuca nieaktualną wersję', async () => {
    const first = await POST(new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: userACookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ ...dummyPayload, recordId: `sync-cas-${runId}`, revision: 'revision-cas-0001' }),
    }));
    expect(first.status).toBe(200);

    const second = await POST(new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: userACookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ ...dummyPayload, recordId: `sync-cas-${runId}`, revision: 'revision-cas-0002', version: 2, expectedVersion: 1 }),
    }));
    expect(second.status).toBe(200);
    expect((await second.json()).version).toBe(2);

    const stale = await POST(new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: userACookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ ...dummyPayload, recordId: `sync-cas-${runId}`, revision: 'revision-cas-0003', version: 2, expectedVersion: 1 }),
    }));
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe('SYNC_CONFLICT');
  });

  it('powtórzenie tej samej rewizji jest idempotentne', async () => {
    const body = JSON.stringify({ ...dummyPayload, recordId: `sync-idempotent-${runId}`, revision: 'revision-idempotent-01' });
    const headers = { 'Content-Type': 'application/json', Cookie: userACookie, 'x-csrf-token': csrf };
    expect((await (await POST(new NextRequest('http://localhost:3000/api/sync', { method: 'POST', headers, body }))).json()).version).toBe(1);
    const retry = await POST(new NextRequest('http://localhost:3000/api/sync', { method: 'POST', headers, body }));
    expect(retry.status).toBe(200);
    expect((await retry.json()).idempotent).toBe(true);
  });

  it('odrzuca nieprawidłowy szyfrogram przed zapisem', async () => {
    const response = await POST(new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: userACookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ ...dummyPayload, encryptedContainer: { ...dummyPayload.encryptedContainer, ivHex: '00' } }),
    }));
    expect(response.status).toBe(400);
  });
});
