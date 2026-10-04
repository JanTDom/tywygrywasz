import { NextRequest, NextResponse } from 'next/server';
import { CSRF_COOKIE_NAME, createCsrfToken } from '@/domain/auth-store';
import { csrfCookieOptions, enforceRateLimit } from '../_utils';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, 'auth-csrf', 60);
  if (limited) return limited;
  const existing = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const csrfToken = existing || createCsrfToken();
  const response = NextResponse.json({ success: true, csrfToken }, { headers: { 'Cache-Control': 'no-store' } });
  if (!existing) response.cookies.set(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions());
  return response;
}
