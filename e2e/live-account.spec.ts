import { test, expect, type APIRequestContext } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { LocalVault } from '../src/domain/vault';
import { E2EESyncEngine } from '../src/domain/sync-engine';

/** Explicit release check using fresh synthetic accounts only. No email is sent.
 * The release operator removes these exact IDs after inspection via service role. */
test('live account sessions and encrypted sync isolate two synthetic owners', async ({ playwright, baseURL }) => {
  test.skip(process.env.E2E_REMOTE_ACCOUNT_TEST !== '1', 'Opt-in check for the selected release environment.');
  const origin = new URL(baseURL!).origin;
  const contexts: APIRequestContext[] = [];
  const created: string[] = [];
  const headers = { Origin: origin, 'sec-fetch-site': 'same-origin' };
  const password = 'Synthetic-release-check!2026';
  const stamp = Date.now();

  async function csrf(context: APIRequestContext) {
    return (await (await context.get('/api/auth/csrf')).json()).csrfToken as string;
  }
  async function post(context: APIRequestContext, path: string, data = {}) {
    return context.post(path, { headers: { ...headers, 'x-csrf-token': await csrf(context) }, data });
  }
  try {
    for (let index = 0; index < 2; index++) {
      const context = await playwright.request.newContext({ baseURL });
      contexts.push(context);
      const capabilities = await context.get('/api/auth/capabilities');
      expect(capabilities.ok()).toBe(true);
      test.skip((await capabilities.json()).emailCodesAvailable !== false, 'This synthetic check does not send account mail.');
      expect((await context.get('/api/auth/me')).status()).toBe(401);
      const registered = await post(context, '/api/auth/register', { name: `Synthetic release ${index}`, email: `release-${stamp}-${index}@example.test`, password });
      expect(registered.status()).toBe(201);
      const body = await registered.json();
      created.push(body.user.id);
      await writeFile('/private/tmp/urzad-release-synthetic-accounts.json', JSON.stringify({ ids: created }));
      expect(body.user.emailVerified).toBe(false);
      expect(body.emailCodesAvailable).toBe(false);
      expect(body.user.passwordHash).toBeUndefined();
      expect((await (await context.get('/api/auth/me')).json()).user.id).toBe(body.user.id);
    }
    const [owner, stranger] = contexts;
    const manifest = new LocalVault(`sejf-${created[0]}`);
    manifest.createCase({ title: 'SYNTHETIC_PRIVATE_RELEASE_CANARY', goalDescription: 'Synthetic check', procedureType: 'administrative', authorityJurisdictionReason: 'Synthetic jurisdiction to review' });
    const payload = await new E2EESyncEngine().prepareSyncPayload(manifest.toManifest(), password, { expectedVersion: 0 });
    expect(JSON.stringify(payload)).not.toContain('SYNTHETIC_PRIVATE_RELEASE_CANARY');
    expect((await post(owner, '/api/sync', payload)).status()).toBe(200);
    const read = await owner.get(`/api/sync?recordId=${encodeURIComponent(payload.recordId)}`);
    expect(read.status()).toBe(200);
    const server = (await read.json()).record;
    expect((await new E2EESyncEngine().decryptSyncPayload(server, password)).cases[0].title).toBe('SYNTHETIC_PRIVATE_RELEASE_CANARY');
    expect((await stranger.get(`/api/sync?recordId=${encodeURIComponent(payload.recordId)}`)).status()).toBe(404);
    expect((await owner.get('/api/workspace')).status()).toBe(410);
    expect((await post(owner, '/api/auth/password-reset', { email: `release-${stamp}-0@example.test` })).status()).toBe(503);
    expect((await post(owner, '/api/auth/sessions')).status()).toBe(200);
    expect((await owner.get('/api/auth/me')).status()).toBe(200);
    expect((await post(owner, '/api/auth/logout')).status()).toBe(200);
    expect((await owner.get('/api/auth/me')).status()).toBe(401);
    expect((await stranger.get('/api/auth/me')).status()).toBe(200);
  } finally {
    await Promise.allSettled(contexts.map((context) => context.dispose()));
  }
});
