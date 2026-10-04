import { NextRequest, NextResponse } from 'next/server';
import { createSession, createUser, validateRegistrationInput } from '@/domain/auth-store';
import { csrfIsValid, jsonError, parseJsonBody, setSessionCookie } from '../_utils';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!csrfIsValid(request)) return jsonError('Nieprawidłowy token formularza. Odśwież stronę i spróbuj ponownie.', 403);
  try {
    const body = await parseJsonBody(request);
    const input = validateRegistrationInput(body);
    const user = await createUser(input);
    const sessionToken = await createSession(user.id);
    const response = NextResponse.json({ success: true, user }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nie udało się założyć konta.';
    const status = message.includes('już istnieje') ? 409 : 400;
    const response = jsonError(message, status);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
