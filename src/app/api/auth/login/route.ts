import { NextRequest, NextResponse } from 'next/server';
import { createSession, verifyCredentials } from '@/domain/auth-store';
import { csrfIsValid, enforceRateLimit, jsonError, parseJsonBody, setSessionCookie } from '../_utils';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'auth-login', 10);
  if (limited) return limited;
  if (!csrfIsValid(request)) return jsonError('Nieprawidłowy token formularza. Odśwież stronę i spróbuj ponownie.', 403);
  try {
    const body = await parseJsonBody(request);
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const user = await verifyCredentials(email, password);
    if (!user) return jsonError('Nieprawidłowy e-mail lub hasło.', 401);
    const response = NextResponse.json({ success: true, user }, { headers: { 'Cache-Control': 'no-store' } });
    setSessionCookie(response, await createSession(user.id));
    return response;
  } catch {
    return jsonError('Nieprawidłowy e-mail lub hasło.', 401);
  }
}
