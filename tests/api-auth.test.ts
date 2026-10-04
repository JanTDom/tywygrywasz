import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { clearAuthStoreForTests } from '../src/domain/auth-store';
import { GET as csrfGet } from '../src/app/api/auth/csrf/route';
import { POST as registerPost } from '../src/app/api/auth/register/route';
import { POST as loginPost } from '../src/app/api/auth/login/route';
import { POST as logoutPost } from '../src/app/api/auth/logout/route';
import { GET as meGet, PATCH as mePatch } from '../src/app/api/auth/me/route';

function cookieValue(setCookie: string | null, name: string): string {
  const match = setCookie?.match(new RegExp(`${name}=([^;]+)`));
  if (!match) throw new Error(`Missing cookie ${name}`);
  return match[1];
}

async function csrfToken() {
  const response = await csrfGet(new NextRequest('http://localhost:3000/api/auth/csrf'));
  const data = await response.json();
  return { token: data.csrfToken as string, cookie: cookieValue(response.headers.get('set-cookie'), 'obywatel_csrf') };
}

describe('API auth (session cookie + CSRF)', () => {
  beforeEach(() => clearAuthStoreForTests());

  it('rejestruje konto i zwraca HttpOnly cookie sesji bez hasła', async () => {
    const csrf = await csrfToken();
    const response = await registerPost(new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', Cookie: `obywatel_csrf=${csrf.cookie}`, 'x-csrf-token': csrf.token },
      body: JSON.stringify({ name: 'Anna Testowa', email: 'anna@example.test', password: 'BardzoMocneHaslo!2026' }),
    }));

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.user.email).toBe('anna@example.test');
    expect(data.user.passwordHash).toBeUndefined();
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax');
  });

  it('odrzuca brak CSRF i logowanie błędnym hasłem', async () => {
    const csrf = await csrfToken();
    const missingCsrf = await registerPost(new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ala', email: 'ala@example.test', password: 'BardzoMocneHaslo!2026' }),
    }));
    expect(missingCsrf.status).toBe(403);

    await registerPost(new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `obywatel_csrf=${csrf.cookie}`, 'x-csrf-token': csrf.token }, body: JSON.stringify({ name: 'Ala Testowa', email: 'ala@example.test', password: 'BardzoMocneHaslo!2026' }),
    }));
    const login = await loginPost(new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `obywatel_csrf=${csrf.cookie}`, 'x-csrf-token': csrf.token }, body: JSON.stringify({ email: 'ala@example.test', password: 'błędne-hasło-2026' }),
    }));
    expect(login.status).toBe(401);
  });

  it('wiąże /me i wylogowanie z sesją, a PATCH nie działa po revokacji', async () => {
    const csrf = await csrfToken();
    const registered = await registerPost(new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `obywatel_csrf=${csrf.cookie}`, 'x-csrf-token': csrf.token }, body: JSON.stringify({ name: 'Jan Testowy', email: 'jan@example.test', password: 'BardzoMocneHaslo!2026' }),
    }));
    const session = cookieValue(registered.headers.get('set-cookie'), 'obywatel_session');
    const cookie = `obywatel_session=${session}; obywatel_csrf=${csrf.cookie}`;

    const me = await meGet(new NextRequest('http://localhost:3000/api/auth/me', { headers: { Cookie: cookie } }));
    expect(me.status).toBe(200);
    expect((await me.json()).user.name).toBe('Jan Testowy');

    const logout = await logoutPost(new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, 'x-csrf-token': csrf.token } }));
    expect(logout.status).toBe(200);
    const afterLogout = await meGet(new NextRequest('http://localhost:3000/api/auth/me', { headers: { Cookie: cookie } }));
    expect(afterLogout.status).toBe(401);

    const patch = await mePatch(new NextRequest('http://localhost:3000/api/auth/me', { method: 'PATCH', headers: { Cookie: cookie, 'x-csrf-token': csrf.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Nie powinno się zapisać' }) }));
    expect(patch.status).toBe(401);
  });
});
