import { NextRequest, NextResponse } from 'next/server';
import { createSession, createUser, validateRegistrationInput } from '@/domain/auth-store';
import { accountEmailIsConfigured } from '@/domain/account-email';
import { scheduleAccountEmail } from '../_account-email';
import { csrfIsValid, enforceAuthRateLimit, jsonError, parseJsonBody, setSessionCookie } from '../_utils';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const limited = await enforceAuthRateLimit(request, 'auth-register', 8);
  if (limited) return limited;
  if (!csrfIsValid(request)) return jsonError('Nieprawidłowy token formularza. Odśwież stronę i spróbuj ponownie.', 403);
  try {
    const body = await parseJsonBody(request);
    const input = validateRegistrationInput(body);
    const user = await createUser(input);
    const emailCodesAvailable = accountEmailIsConfigured();
    if (emailCodesAvailable) await scheduleAccountEmail(user.email, 'verify_email');
    const sessionToken = await createSession(user.id, user.credentialVersion);
    const response = NextResponse.json({ success: true, user, emailCodesAvailable }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nie udało się założyć konta.';
    const status = message.includes('już istnieje') ? 409 : message.includes('skonfigurowan') ? 503 : 400;
    const response = jsonError(message, status);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
