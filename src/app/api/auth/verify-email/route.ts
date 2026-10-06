import { NextRequest, NextResponse } from 'next/server';
import { assertAccountEmailConfigured } from '@/domain/account-email';
import { getUserBySessionToken, SESSION_COOKIE_NAME, verifyAccountEmail } from '@/domain/auth-store';
import { csrfIsValid, enforceAuthRateLimit, jsonError, parseJsonBody, userFromRequest } from '../_utils';
import { scheduleAccountEmail } from '../_account-email';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const limited = await enforceAuthRateLimit(request, 'auth-verify-request', 5);
  if (limited) return limited;
  if (!csrfIsValid(request)) return jsonError('Nieprawidłowy token formularza.', 403);
  const user = await userFromRequest(request);
  if (!user) return jsonError('Zaloguj się, aby potwierdzić adres konta.', 401);
  try {
    assertAccountEmailConfigured();
    await scheduleAccountEmail(user.email, 'verify_email');
    return NextResponse.json({ success: true, message: 'Jeśli adres wymaga potwierdzenia, otrzymasz jednorazowy kod ważny przez 24 godziny.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return jsonError('Wysyłka kodów konta jest teraz niedostępna. Spróbuj ponownie później.', 503);
  }
}

export async function PATCH(request: NextRequest) {
  const limited = await enforceAuthRateLimit(request, 'auth-verify-consume', 10);
  if (limited) return limited;
  if (!csrfIsValid(request)) return jsonError('Nieprawidłowy token formularza.', 403);
  const user = await userFromRequest(request);
  if (!user) return jsonError('Zaloguj się, aby potwierdzić adres konta.', 401);
  try {
    const body = await parseJsonBody(request);
    await verifyAccountEmail(user.id, typeof body.code === 'string' ? body.code.trim() : '');
    return NextResponse.json({ success: true, user: await getUserBySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value), message: 'Adres e-mail został potwierdzony.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Nie udało się potwierdzić adresu.', 400);
  }
}
