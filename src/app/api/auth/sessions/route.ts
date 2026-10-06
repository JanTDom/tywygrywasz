import { NextRequest, NextResponse } from 'next/server';
import { rotateAccountSessions, SESSION_COOKIE_NAME } from '@/domain/auth-store';
import { csrfCookieOptions, csrfIsValid, enforceAuthRateLimit, jsonError, setSessionCookie } from '../_utils';
import { createCsrfToken, CSRF_COOKIE_NAME } from '@/domain/auth-store';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const limited = await enforceAuthRateLimit(request, 'auth-session-rotate', 10);
  if (limited) return limited;
  if (!csrfIsValid(request)) return jsonError('Nieprawidłowy token formularza.', 403);
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return jsonError('Brak aktywnej sesji.', 401);
  try {
    const replacement = await rotateAccountSessions(token);
    const response = NextResponse.json({ success: true, message: 'Pozostałe sesje zostały wylogowane. Bieżąca sesja otrzymała nowy token.' }, { headers: { 'Cache-Control': 'no-store' } });
    setSessionCookie(response, replacement);
    response.cookies.set(CSRF_COOKIE_NAME, createCsrfToken(), csrfCookieOptions());
    return response;
  } catch {
    return jsonError('Sesja wygasła. Zaloguj się ponownie.', 401);
  }
}
