import { NextRequest, NextResponse } from 'next/server';
import { revokeSession, SESSION_COOKIE_NAME } from '@/domain/auth-store';
import { clearSessionCookie, csrfIsValid, jsonError } from '../_utils';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!csrfIsValid(request)) return jsonError('Nieprawidłowy token formularza.', 403);
  await revokeSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const response = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  clearSessionCookie(response);
  return response;
}
