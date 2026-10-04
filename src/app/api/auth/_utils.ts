import { NextRequest, NextResponse } from 'next/server';
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createCsrfToken,
  getUserBySessionToken,
  safeEqualStrings,
} from '@/domain/auth-store';

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function csrfCookieOptions() {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, '', { ...sessionCookieOptions(), maxAge: 0 });
}

export function ensureCsrfCookie(request: NextRequest, response: NextResponse): string {
  const existing = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (existing) return existing;
  const token = createCsrfToken();
  response.cookies.set(CSRF_COOKIE_NAME, token, csrfCookieOptions());
  return token;
}

export function csrfIsValid(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const sameOrigin = !origin || origin === new URL(request.url).origin;
  const fetchSite = request.headers.get('sec-fetch-site');
  const sameSite = !fetchSite || fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none';
  return sameOrigin && sameSite && safeEqualStrings(
    request.cookies.get(CSRF_COOKIE_NAME)?.value,
    request.headers.get('x-csrf-token') || undefined,
  );
}

export async function parseJsonBody(request: NextRequest, maxBytes = 16 * 1024): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxBytes) throw new Error('Dane formularza są zbyt duże.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error('Dane formularza są zbyt duże.');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Nieprawidłowe dane formularza.');
  return parsed as Record<string, unknown>;
}

export async function userFromRequest(request: NextRequest) {
  return getUserBySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
