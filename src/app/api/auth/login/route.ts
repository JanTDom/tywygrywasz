import { NextRequest, NextResponse } from 'next/server';
import { createSession, revokeSession, SESSION_COOKIE_NAME, verifyCredentials } from '@/domain/auth-store';
import { csrfIsValid, enforceAuthRateLimit, jsonError, parseJsonBody, setSessionCookie } from '../_utils';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const limited = await enforceAuthRateLimit(request, 'auth-login', 10);
  if (limited) return limited;
  if (!csrfIsValid(request)) return jsonError('Nieprawidłowy token formularza. Odśwież stronę i spróbuj ponownie.', 403);
  try {
    const body = await parseJsonBody(request);
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const user = await verifyCredentials(email, password);
    if (!user) return jsonError('Nieprawidłowy e-mail lub hasło.', 401);
    const response = NextResponse.json({ success: true, user }, { headers: { 'Cache-Control': 'no-store' } });
    const replacement = await createSession(user.id, user.credentialVersion);
    await revokeSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    setSessionCookie(response, replacement);
    return response;
  } catch {
    return jsonError('Nieprawidłowy e-mail lub hasło.', 401);
  }
}
