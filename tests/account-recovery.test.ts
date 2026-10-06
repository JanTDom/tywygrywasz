import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { clearAuthStoreForTests, createSession, createUser, getUserBySessionToken, issueAccountToken, resetAccountPassword, verifyCredentials } from '../src/domain/auth-store';
import { clearAccountEmailsForTests, deliverAccountEmail, readAccountEmailForTests } from '../src/domain/account-email';
import { POST as requestReset, PATCH as consumeReset } from '../src/app/api/auth/password-reset/route';
import { POST as requestVerification, PATCH as consumeVerification } from '../src/app/api/auth/verify-email/route';
import { POST as rotateSessions } from '../src/app/api/auth/sessions/route';

const originalPassword = 'HasloPierwsze!2026';
const newPassword = 'HasloDrugie!2026';

function request(path: string, method: 'POST' | 'PATCH', body: Record<string, string> = {}, session?: string, withCsrf = true) {
  return new NextRequest(`http://localhost:3000/api/auth/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json', Origin: 'http://localhost:3000',
      Cookie: [withCsrf ? 'obywatel_csrf=synthetic-csrf' : '', session ? `obywatel_session=${session}` : ''].filter(Boolean).join('; '),
      ...(withCsrf ? { 'x-csrf-token': 'synthetic-csrf' } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function account(email = 'konto@example.test') {
  const user = await createUser({ name: 'Konto syntetyczne', email, password: originalPassword });
  return { user, session: await createSession(user.id, user.credentialVersion) };
}

describe('odzyskiwanie konta bez dostępu do klucza sejfu', () => {
  beforeEach(() => {
    clearAuthStoreForTests(); clearAccountEmailsForTests();
    vi.stubEnv('AUTH_EMAIL_TRANSPORT', 'memory');
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('potwierdza tylko adres właściciela sesji; odrzuca cudzy kod i replay', async () => {
    const owner = await account(); const stranger = await account('inne@example.test');
    expect(owner.user.emailVerified).toBe(false);
    const requested = await requestVerification(request('verify-email', 'POST', {}, owner.session));
    expect(requested.status).toBe(200);
    const mail = readAccountEmailForTests()[0];
    expect(mail.to).toBe(owner.user.email);
    expect(JSON.stringify(await requested.json())).not.toContain(mail.code);
    expect((await consumeVerification(request('verify-email', 'PATCH', { code: mail.code }, stranger.session))).status).toBe(400);
    const verified = await consumeVerification(request('verify-email', 'PATCH', { code: mail.code }, owner.session));
    expect(verified.status).toBe(200);
    expect((await verified.json()).user.emailVerified).toBe(true);
    expect((await consumeVerification(request('verify-email', 'PATCH', { code: mail.code }, owner.session))).status).toBe(400);
    expect((await getUserBySessionToken(stranger.session))?.emailVerified).toBe(false);
  });

  it('nie ujawnia, czy istnieje konto w żądaniu resetu, i nie zwraca kodu', async () => {
    const owner = await account();
    const known = await requestReset(request('password-reset', 'POST', { email: owner.user.email }));
    const unknown = await requestReset(request('password-reset', 'POST', { email: 'nieistniejace@example.test' }));
    expect(known.status).toBe(unknown.status);
    const knownBody = await known.json();
    expect(knownBody).toEqual(await unknown.json());
    expect(readAccountEmailForTests()).toHaveLength(1);
    expect(JSON.stringify(knownBody)).not.toContain(readAccountEmailForTests()[0].code);
  });

  it('resetuje hasło, unieważnia wszystkie sesje właściciela i token; chroni konto B', async () => {
    const owner = await account(); const other = await account('inne@example.test');
    const secondSession = await createSession(owner.user.id);
    const beforeResetCredentials = await verifyCredentials(owner.user.email, originalPassword);
    await requestReset(request('password-reset', 'POST', { email: owner.user.email }));
    const code = readAccountEmailForTests()[0].code;
    const response = await consumeReset(request('password-reset', 'PATCH', { code, password: newPassword }));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(await getUserBySessionToken(owner.session)).toBeNull();
    expect(await getUserBySessionToken(secondSession)).toBeNull();
    expect(await getUserBySessionToken(other.session)).not.toBeNull();
    expect(await verifyCredentials(owner.user.email, originalPassword)).toBeNull();
    expect((await verifyCredentials(owner.user.email, newPassword))?.emailVerified).toBe(true);
    expect((await consumeReset(request('password-reset', 'PATCH', { code, password: originalPassword }))).status).toBe(400);
    await expect(createSession(owner.user.id, beforeResetCredentials?.credentialVersion)).rejects.toThrow();
  });

  it('odrzuca wygasły kod, nie zmieniając hasła ani sesji', async () => {
    const owner = await account();
    const token = await issueAccountToken(owner.user.email, 'reset_password');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    await expect(resetAccountPassword(token!.token, newPassword)).rejects.toThrow('wygasł');
    expect(await verifyCredentials(owner.user.email, originalPassword)).not.toBeNull();
    expect(await getUserBySessionToken(owner.session)).not.toBeNull();
  });

  it('zapobiega równoległemu ponownemu użyciu kodu', async () => {
    const owner = await account();
    const token = await issueAccountToken(owner.user.email, 'reset_password');
    const results = await Promise.allSettled([resetAccountPassword(token!.token, newPassword), resetAccountPassword(token!.token, newPassword)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('rotuje bieżący token i usuwa wszystkie pozostałe sesje tego konta', async () => {
    const owner = await account(); const other = await account('inne@example.test');
    const secondSession = await createSession(owner.user.id);
    const response = await rotateSessions(request('sessions', 'POST', {}, owner.session));
    expect(response.status).toBe(200);
    const newToken = response.headers.get('set-cookie')?.match(/obywatel_session=([^;]+)/)?.[1];
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(owner.session);
    expect(await getUserBySessionToken(owner.session)).toBeNull();
    expect(await getUserBySessionToken(secondSession)).toBeNull();
    expect((await getUserBySessionToken(newToken))?.id).toBe(owner.user.id);
    expect(await getUserBySessionToken(other.session)).not.toBeNull();
    expect((await rotateSessions(request('sessions', 'POST', {}, owner.session))).status).toBe(401);
  });

  it('odrzuca brak CSRF w każdym nowym endpointcie', async () => {
    const owner = await account();
    const handlers = [requestReset, consumeReset, requestVerification, consumeVerification, rotateSessions];
    for (const handler of handlers) expect((await handler(request('test', 'POST', {}, owner.session, false))).status).toBe(403);
  });

  it('nie udaje wysłania kodu przy braku konfiguracji mailera', async () => {
    vi.stubEnv('AUTH_EMAIL_TRANSPORT', 'disabled');
    const response = await requestReset(request('password-reset', 'POST', { email: 'konto@example.test' }));
    expect(response.status).toBe(503);
    expect(readAccountEmailForTests()).toHaveLength(0);
  });

  it('unieważnia kod, gdy dostawca nie przyjmie wiadomości; nie dodaje prywatnych danych', async () => {
    const owner = await account();
    vi.stubEnv('AUTH_EMAIL_TRANSPORT', 'resend'); vi.stubEnv('RESEND_API_KEY', 'synthetic-api-key');
    vi.stubEnv('AUTH_EMAIL_FROM', 'Test <noreply@example.test>'); vi.stubEnv('APP_URL', 'https://example.test');
    let sentCode = '';
    const transport = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      expect(url).toBe('https://api.resend.com/emails');
      const body = JSON.parse(init?.body as string);
      expect(Object.keys(body).sort()).toEqual(['from', 'subject', 'text', 'to']);
      expect(body.text).not.toContain('vaultKey');
      sentCode = body.text.split('\n')[2];
      return new Response('{}', { status: 500 });
    });
    await expect(deliverAccountEmail(owner.user.email, 'reset_password')).rejects.toThrow('wysłać');
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(resetAccountPassword(sentCode, newPassword)).rejects.toThrow('nieprawidłowy');
  });
});
