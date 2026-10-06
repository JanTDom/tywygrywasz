import { createHash } from 'node:crypto';
import { hasDurableAuthStorage, invalidateAccountToken, issueAccountToken, type AccountTokenPurpose } from './auth-store';

type AccountEmail = { to: string; purpose: AccountTokenPurpose; code: string; expiresAt: string; text: string };
const testMailbox: AccountEmail[] = [];

/** Only availability is public; provider credentials and account state remain server-only. */
export function accountEmailIsConfigured(): boolean {
  try { assertAccountEmailConfigured(); return true; }
  catch { return false; }
}

export function assertAccountEmailConfigured(): void {
  if (process.env.NODE_ENV === 'production' && !hasDurableAuthStorage()) throw new Error('Magazyn kont nie jest skonfigurowany.');
  if (process.env.AUTH_EMAIL_TRANSPORT === 'memory' && process.env.NODE_ENV === 'test') return;
  if (process.env.AUTH_EMAIL_TRANSPORT !== 'resend' || !process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM || !process.env.APP_URL) {
    throw new Error('Wysyłka kodów konta nie jest skonfigurowana. Spróbuj ponownie później.');
  }
  const url = new URL(process.env.APP_URL);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Wysyłka kodów konta nie jest skonfigurowana. Spróbuj ponownie później.');
}

export function accountEmailUsesTestMailbox(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.AUTH_EMAIL_TRANSPORT === 'memory';
}

/** No document, filename, private date or vault secret enters this transport. */
export async function deliverAccountEmail(email: string, purpose: AccountTokenPurpose): Promise<void> {
  assertAccountEmailConfigured();
  const issued = await issueAccountToken(email, purpose);
  if (!issued) return;
  const action = purpose === 'verify_email' ? 'potwierdzenia adresu e-mail' : 'zmiany hasła do konta';
  const text = [
    `Twój jednorazowy kod ${action} w TyWygrywasz.pl:`, '', issued.token, '',
    `Ważny do: ${issued.expiresAt}.`,
    `Otwórz ${process.env.APP_URL || 'aplikację TyWygrywasz.pl'} i wklej kod w panelu konta.`,
    'Zmiana hasła konta nie odzyskuje ani nie odblokowuje sejfu. Sejf wymaga osobnego klucza odzyskiwania i kopii zapasowej.',
    'Jeśli to nie Twoja prośba, zignoruj wiadomość. Nie przekazuj nikomu kodu.',
  ].join('\n');
  if (accountEmailUsesTestMailbox()) {
    testMailbox.push({ to: issued.user.email, purpose, code: issued.token, expiresAt: issued.expiresAt, text });
    return;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': createHash('sha256').update(issued.token).digest('hex'),
      },
      body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM, to: [issued.user.email], subject: `TyWygrywasz.pl — kod ${action}`, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Dostawca nie przyjął wiadomości.');
  } catch {
    await invalidateAccountToken(issued.token);
    // Provider payloads may contain PII; never log or return them.
    throw new Error('Nie udało się wysłać kodu.');
  }
}

/** Test-only synthetic inbox. Never available in development/production APIs. */
export function readAccountEmailForTests(): readonly AccountEmail[] {
  if (process.env.NODE_ENV !== 'test') throw new Error('Skrzynka testowa jest dostępna wyłącznie w testach.');
  return testMailbox.map((item) => ({ ...item }));
}

export function clearAccountEmailsForTests(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('Skrzynka testowa jest dostępna wyłącznie w testach.');
  testMailbox.length = 0;
}
