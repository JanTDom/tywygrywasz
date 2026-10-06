import { readFile } from 'node:fs/promises';
import type { Cookie } from '@playwright/test';

/** Optional Vercel session obtained through the operator's CLI.
 * Never import app cookies, widen the domain, or put this value in traces. */
export async function deploymentProtectionCookies(baseURL?: string): Promise<Cookie[]> {
  const file = process.env.E2E_VERCEL_COOKIE_FILE;
  if (!file) return [];
  if (!baseURL) throw new Error('Protected deployment requires an exact base URL.');
  const target = new URL(baseURL);
  if (target.protocol !== 'https:' || !target.hostname.endsWith('.vercel.app')) throw new Error('Unexpected protected deployment origin.');
  const cookies: Cookie[] = [];
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    if (!line.startsWith('#HttpOnly_') && (line.startsWith('#') || !line.trim())) continue;
    const fields = line.split('\t');
    if (fields.length !== 7) continue;
    const [rawDomain, , path, secure, expires, name, value] = fields;
    const domain = rawDomain.replace(/^#HttpOnly_/, '');
    if (domain !== target.hostname || path !== '/' || name !== '_vercel_jwt' || secure !== 'TRUE' || !value) continue;
    cookies.push({ name, value, domain, path, expires: Number(expires) || -1, secure: true, httpOnly: true, sameSite: 'Lax' });
  }
  if (cookies.length !== 1) throw new Error('No origin-scoped deployment session was found.');
  return cookies;
}
