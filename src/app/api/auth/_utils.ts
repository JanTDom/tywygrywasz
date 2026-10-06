import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { readLimitedRequestText } from '@/domain/http-body';
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createCsrfToken,
  getUserBySessionToken,
  getSupabaseAdminClient,
  safeEqualStrings,
} from '@/domain/auth-store';

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();
const RATE_WINDOW_MS = 15 * 60 * 1000;

function clientAddress(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown-client';
}

/** Small in-process guard for credential endpoints. Durable deployments should
 * also configure provider/WAF rate limits; this prevents a single instance
 * from accepting an unbounded burst before those controls engage. */
export function enforceRateLimit(request: NextRequest, scope: string, limit: number): NextResponse | null {
  if (process.env.NODE_ENV === 'test') return null;
  const now = Date.now();
  const key = `${scope}:${clientAddress(request)}`;
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return null;
  }
  current.count += 1;
  if (current.count <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  const response = jsonError('Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.', 429);
  response.headers.set('Retry-After', String(retryAfter));
  return response;
}

export function clearRateLimitsForTests(): void {
  rateBuckets.clear();
}

/** Atomic shared limiter across production instances; only an HMAC of the
 * technical connection address reaches Postgres, never email or vault data. */
export async function enforceAuthRateLimit(request: NextRequest, scope: string, limit: number): Promise<NextResponse | null> {
  const localLimited = enforceRateLimit(request, scope, limit);
  if (localLimited) return localLimited;
  try {
    const db = getSupabaseAdminClient();
    if (!db) return null;
    const secret = process.env.AUTH_RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) return jsonError('Ochrona kont jest teraz niedostępna. Spróbuj ponownie później.', 503);
    const key = createHmac('sha256', secret).update(`${scope}:${clientAddress(request)}`).digest('hex');
    const { data, error } = await db.rpc('take_app_auth_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: RATE_WINDOW_MS / 1000 });
    if (error || typeof data !== 'number') return jsonError('Ochrona kont jest teraz niedostępna. Spróbuj ponownie później.', 503);
    if (data <= 0) return null;
    const response = jsonError('Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.', 429);
    response.headers.set('Retry-After', String(data));
    return response;
  } catch {
    return jsonError('Ochrona kont jest teraz niedostępna. Spróbuj ponownie później.', 503);
  }
}

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
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigins = (process.env.APP_ORIGINS || process.env.NEXT_PUBLIC_SITE_URL || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  // In production browsers send Origin on credentialed POSTs. Requiring it
  // closes the gap where a missing Origin header could bypass same-origin
  // checks; local tests/dev keep the previous compatibility behavior.
  const sameOrigin = process.env.NODE_ENV === 'production'
    ? Boolean(origin) && [requestOrigin, ...configuredOrigins].includes(origin || '')
    : (!origin || origin === requestOrigin);
  const fetchSite = request.headers.get('sec-fetch-site');
  const sameSite = process.env.NODE_ENV === 'production'
    ? fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none'
    : (!fetchSite || fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none');
  return sameOrigin && sameSite && safeEqualStrings(
    request.cookies.get(CSRF_COOKIE_NAME)?.value,
    request.headers.get('x-csrf-token') || undefined,
  );
}

export async function parseJsonBody(request: NextRequest, maxBytes = 16 * 1024): Promise<Record<string, unknown>> {
  const raw = await readLimitedRequestText(request, maxBytes);
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
