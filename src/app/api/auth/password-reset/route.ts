import { NextRequest, NextResponse } from 'next/server';
import { assertAccountEmailConfigured } from '@/domain/account-email';
import { resetAccountPassword } from '@/domain/auth-store';
import { clearSessionCookie, csrfIsValid, enforceAuthRateLimit, jsonError, parseJsonBody } from '../_utils';
import { scheduleAccountEmail } from '../_account-email';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const limited = await enforceAuthRateLimit(request, 'auth-reset-request', 5);
  if (limited) return limited;
  if (!csrfIsValid(request)) return jsonError('Nieprawidłowy token formularza.', 403);
  try {
    assertAccountEmailConfigured();
    const body = await parseJsonBody(request);
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return jsonError('Podaj poprawny adres e-mail.', 400);
    await scheduleAccountEmail(email, 'reset_password');
    return NextResponse.json({ success: true, message: 'Jeśli konto z tym adresem istnieje, otrzymasz kod zmiany hasła. Kod jest ważny przez 30 minut.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return jsonError('Wysyłka kodów konta jest teraz niedostępna. Spróbuj ponownie później.', 503);
  }
}

export async function PATCH(request: NextRequest) {
  const limited = await enforceAuthRateLimit(request, 'auth-reset-consume', 10);
  if (limited) return limited;
  if (!csrfIsValid(request)) return jsonError('Nieprawidłowy token formularza.', 403);
  try {
    const body = await parseJsonBody(request);
    await resetAccountPassword(typeof body.code === 'string' ? body.code.trim() : '', typeof body.password === 'string' ? body.password : '');
    const response = NextResponse.json({ success: true, message: 'Hasło konta zostało zmienione. Wszystkie sesje zostały wylogowane. Zaloguj się nowym hasłem; sejf odzyskasz osobnym kluczem.' }, { headers: { 'Cache-Control': 'no-store' } });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Nie udało się zmienić hasła.', 400);
  }
}
