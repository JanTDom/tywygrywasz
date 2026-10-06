import { test, expect, type Page, type Request as PlaywrightRequest } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { LocalVault } from '../src/domain/vault';
import { E2EESyncEngine } from '../src/domain/sync-engine';

const PASSWORD = 'Synthetic-vault-password-2026';
const BACKUP_PASSWORD = 'Synthetic-backup-password-2026';
const CANARY = 'PRIVATE_CANARY_6f51a4';
const NOTE = 'Prywatny opis użytkownika PRIVATE_CANARY_6f51a4';

async function createLocalVault(page: Page) {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Ustaw hasło swojego sejfu' });
  await dialog.getByLabel('Nowe hasło sejfu').fill(PASSWORD);
  await dialog.getByLabel('Powtórz hasło').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Zabezpiecz sejf' }).click();
  await expect(dialog).toBeHidden();
}

async function importFile(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.getByRole('button', { name: 'Dokumenty', exact: true }).click();
  await page.locator('input[type=file][multiple]').setInputFiles({ name, mimeType, buffer });
  const dialog = page.getByRole('dialog', { name: 'Dodaj dokument do sejfu' });
  await dialog.getByRole('textbox').fill(NOTE);
  await dialog.getByRole('button', { name: 'Dodaj do sejfu', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 120_000 });
  await page.getByText(name, { exact: true }).first().click();
}

async function originalBytes(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Pobierz nienaruszony oryginał' }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  return readFile(path!);
}

async function mockAccount(page: Page, id: string, afterLogout = false) {
  await page.route('**/api/auth/csrf', (route) => route.fulfill({ json: { csrfToken: 'synthetic-csrf' } }));
  await page.route('**/api/auth/login', (route) => route.fulfill({ json: { user: { id, name: `Synthetic ${id}`, email: `${id}@example.test` } } }));
  await page.route('**/api/auth/logout', (route) => route.fulfill({ json: { success: true } }));
  if (afterLogout) await page.getByRole('button', { name: 'Użyj konta', exact: true }).click();
  else await page.getByRole('button', { name: 'Zaloguj lub załóż konto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Zaloguj się do swojego konta' });
  await dialog.getByLabel('Adres e-mail').fill(`${id}@example.test`);
  await dialog.getByLabel('Hasło konta').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test('failed second import preserves the first manifest; corrupt ciphertext ends preview loading', async ({ page }) => {
  await createLocalVault(page);
  await page.getByRole('button', { name: 'Dokumenty', exact: true }).click();
  await page.locator('input[type=file][multiple]').setInputFiles([
    { name: 'preserved-first.txt', mimeType: 'text/plain', buffer: Buffer.from(CANARY) },
    { name: 'empty-second.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) },
  ]);
  const dialog = page.getByRole('dialog', { name: 'Dodaj dokument do sejfu' });
  await dialog.getByRole('button', { name: 'Dodaj do sejfu', exact: true }).click();
  await expect(dialog.getByText('Plik jest pusty.', { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('tywygrywasz-vault-local')))).toBe(true);
  await page.reload();
  await page.getByRole('dialog').getByLabel('Hasło sejfu lub klucz').fill(PASSWORD);
  await page.getByRole('button', { name: 'Odblokuj sejf', exact: true }).click();
  await page.getByRole('button', { name: 'Dokumenty', exact: true }).click();
  await page.getByText('preserved-first.txt', { exact: true }).first().click();
  expect((await originalBytes(page)).toString()).toBe(CANARY);
  await expect(page.getByText('empty-second.txt', { exact: true })).toHaveCount(0);
  await page.evaluate(async () => {
    for (const database of await indexedDB.databases()) {
      if (!database.name?.endsWith('-documents') && !database.name?.startsWith('tywygrywasz-owned-documents-')) continue;
      const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open(database.name!); request.onsuccess = () => resolve(request.result); });
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('encrypted-documents', 'readwrite');
        const store = transaction.objectStore('encrypted-documents');
        const request = store.getAll();
        request.onsuccess = () => {
          for (const record of request.result) {
            const value = record.encryptedPayload.ciphertextHex as string;
            record.encryptedPayload.ciphertextHex = (value[0] === '0' ? '1' : '0') + value.slice(1);
            store.put(record);
          }
        };
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
      }); db.close();
    }
  });
  await page.reload();
  await page.getByRole('dialog').getByLabel('Hasło sejfu lub klucz').fill(PASSWORD);
  await page.getByRole('button', { name: 'Odblokuj sejf', exact: true }).click();
  await page.getByRole('button', { name: 'Dokumenty', exact: true }).click();
  await page.getByText('preserved-first.txt', { exact: true }).first().click();
  await expect(page.getByText('Nie można odczytać lokalnego oryginału.', { exact: false })).toBeVisible();
  await expect(page.getByText('Sprawdzanie bajtów', { exact: false })).toHaveCount(0);
});

for (const delayed of [false, true]) {
  test(`account switch clears cloud conflict and private fields, delayed response=${delayed}`, async ({ page }) => {
    await createLocalVault(page);
    await mockAccount(page, 'account-a');
    const cloud = new LocalVault('sejf-account-a');
    cloud.createCase({ title: CANARY, goalDescription: 'Synthetic goal', procedureType: 'administrative', authorityOrOpponentName: 'Synthetic authority', authorityJurisdictionReason: 'Synthetic jurisdiction to review' });
    const record = await new E2EESyncEngine().prepareSyncPayload(cloud.toManifest(), BACKUP_PASSWORD);
    let release!: () => void;
    let requested!: () => void;
    const requestedPromise = new Promise<void>((resolve) => { requested = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/sync?*', async (route) => {
      requested();
      if (delayed) await releasePromise;
      await route.fulfill({ json: { record } });
    });
    await page.getByRole('button', { name: 'Kopie i prywatność' }).click();
    await page.locator('input[type=password]').first().fill('Private-backup-password-A');
    await page.locator('input[type=password]').last().fill(BACKUP_PASSWORD);
    await page.getByRole('button', { name: 'Pobierz z serwera' }).click();
    await requestedPromise;
    if (!delayed) await expect(page.getByRole('button', { name: 'Zastosuj serwerową' })).toBeVisible();
    await page.getByRole('button', { name: 'Otwórz profil Synthetic account-a' }).click();
    await page.getByRole('button', { name: 'Wyloguj się', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Zaloguj lub załóż konto' })).toBeVisible();
    await mockAccount(page, 'account-b', true);
    release();
    await expect(page.getByRole('button', { name: 'Zastosuj serwerową' })).toHaveCount(0);
    await expect(page.getByText(CANARY, { exact: true })).toHaveCount(0);
    await expect(page.locator('input[type=password]').first()).toHaveValue('');
    expect(await page.evaluate(() => localStorage.getItem('tywygrywasz-sync-checkpoint-sejf-account-b'))).toBeNull();
  });
}

test('account recovery dialog stays scrollable on mobile and reports unavailable mail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 650 });
  await page.route('**/api/auth/capabilities', (route) => route.fulfill({ json: { emailCodesAvailable: false } }));
  await createLocalVault(page);
  await page.getByRole('button', { name: 'Zaloguj lub załóż konto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Zaloguj się do swojego konta' });
  await expect(dialog.getByText('Wysyłka kodów e-mail jest teraz niedostępna.', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Nie pamiętam hasła konta' }).click();
  await dialog.getByLabel('E-mail konta').fill('synthetic@example.test');
  await expect(dialog.getByRole('button', { name: 'Wyślij kod na e-mail' })).toBeDisabled();
  const reset = dialog.getByRole('button', { name: 'Zmień hasło konta' });
  await reset.scrollIntoViewIfNeeded();
  await expect(reset).toBeInViewport();
  expect(await dialog.evaluate((element) => element.clientHeight < element.scrollHeight && getComputedStyle(element).overflowY === 'auto')).toBe(true);
});

test('restoring account A backup into B leaves account A original storage unchanged', async ({ page }) => {
  await createLocalVault(page);
  await mockAccount(page, 'account-a');
  await importFile(page, 'owner-a-original.txt', 'text/plain', Buffer.from(CANARY));
  await page.getByRole('button', { name: 'Kopie i prywatność' }).click();
  await page.locator('input[type=password]').first().fill(BACKUP_PASSWORD);
  await page.getByRole('button', { name: 'Wygeneruj kopię', exact: false }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Pobierz plik JSON' }).click();
  const backup = await readFile((await (await download).path())!);
  const ownerSnapshot = async () => page.evaluate(async () => {
    const database = (await indexedDB.databases()).find((item) => item.name?.startsWith('tywygrywasz-owned-documents-') && item.name.includes('["account-a",'))!;
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open(database.name!); request.onsuccess = () => resolve(request.result); });
    const records = await new Promise<unknown[]>((resolve) => { const request = db.transaction('encrypted-documents', 'readonly').objectStore('encrypted-documents').getAll(); request.onsuccess = () => resolve(request.result); });
    db.close(); return JSON.stringify(records);
  });
  const original = await ownerSnapshot();
  await page.getByRole('button', { name: 'Otwórz profil Synthetic account-a' }).click();
  await page.getByRole('button', { name: 'Wyloguj się', exact: true }).click();
  await mockAccount(page, 'account-b', true);
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-owner-backup.json', mimeType: 'application/json', buffer: backup });
  await expect(page.getByPlaceholder('Wklej zaszyfrowany kontener JSON...')).toHaveValue(backup.toString());
  await page.locator('input[type=password]').nth(1).fill(BACKUP_PASSWORD);
  await page.getByRole('checkbox', { name: /Wybieram zastąpienie/ }).check();
  await page.getByRole('button', { name: 'Odtwórz sejf', exact: true }).click();
  await expect(page.getByText('Odtworzono sejf. Hasło kopii', { exact: false })).toBeVisible();
  expect(await ownerSnapshot()).toBe(original);
  await page.getByRole('button', { name: 'Dokumenty', exact: true }).click();
  await page.getByText('owner-a-original.txt', { exact: true }).first().click();
  expect((await originalBytes(page)).toString()).toBe(CANARY);
});

test('real local OCR, encrypted bytes, clean-profile full backup, reload and relink', async ({ browser, page, baseURL }) => {
  const networkLeaks: string[] = [];
  const foreignRequests: string[] = [];
  const mutations: string[] = [];
  const observeRequest = (request: PlaywrightRequest) => {
    const serialized = request.url() + JSON.stringify(request.headers()) + (request.postData() || '');
    const url = new URL(request.url());
    if (serialized.includes(CANARY)) networkLeaks.push(request.method() + ' ' + url.pathname);
    if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.method() + ' ' + url.pathname);
    if (url.origin !== new URL(baseURL!).origin && !['blob:', 'data:'].includes(url.protocol)) foreignRequests.push(request.url());
  };
  page.context().on('request', observeRequest);
  await createLocalVault(page);
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1500; canvas.height = 650;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1500, 650);
    ctx.fillStyle = 'black'; ctx.font = '60px Arial';
    ctx.fillText('DECYZJA 123/2026', 80, 120); ctx.fillText('Znak: WAB.6740.12.2026', 80, 230);
    ctx.fillText('Data: 6 pazdziernika 2026', 80, 340); ctx.fillText('PRIVATE_CANARY_6f51a4', 80, 450);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await importFile(page, 'synthetic-scan.png', 'image/png', png);
  await expect(page.getByText('SHA-256 i rozmiar zgodne', { exact: false })).toBeVisible();
  await expect(page.getByText('Znak: WAB.6740.12.2026', { exact: false }).first()).toBeVisible();
  expect(await originalBytes(page)).toEqual(png);

  // Image-only PDF proves PDF rasterization feeds the real local OCR worker.
  const pdf = await PDFDocument.create(); const image = await pdf.embedPng(png);
  const pdfPage = pdf.addPage([750, 325]); pdfPage.drawImage(image, { x: 0, y: 0, width: 750, height: 325 });
  const pdfBytes = Buffer.from(await pdf.save());
  await importFile(page, 'synthetic-scanned.pdf', 'application/pdf', pdfBytes);
  await expect(page.getByText('Znak: WAB.6740.12.2026', { exact: false }).first()).toBeVisible();
  expect(await originalBytes(page)).toEqual(pdfBytes);
  await page.screenshot({ path: 'output/local-document-preview.png', fullPage: true });
  const serializedStorage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(serializedStorage).not.toContain(CANARY);
  expect(serializedStorage).not.toContain('TWY-');
  expect(serializedStorage).not.toContain('synthetic-scan');
  expect(await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const data: unknown[] = [];
    for (const database of databases) {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open(database.name!); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      for (const name of db.objectStoreNames) data.push(await new Promise((resolve, reject) => { const req = db.transaction(name).objectStore(name).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }));
      db.close();
    }
    return JSON.stringify(data);
  })).not.toContain(CANARY);

  await page.getByRole('button', { name: 'Kopie i prywatność' }).click();
  await page.locator('input[type=password]').nth(0).fill(BACKUP_PASSWORD);
  await page.getByRole('button', { name: 'Wygeneruj kopię' }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Pobierz plik JSON' }).click();
  const backup = await readFile((await (await download).path())!);
  expect(backup.toString()).not.toContain(CANARY);
  expect(JSON.parse(backup.toString()).documents.records).toHaveLength(2);
  expect(networkLeaks).toEqual([]); expect(foreignRequests).toEqual([]); expect(mutations).toEqual([]);

  const clean = await browser.newContext();
  clean.on('request', observeRequest);
  const restored = await clean.newPage();
  await createLocalVault(restored);
  await restored.getByRole('button', { name: 'Kopie i prywatność' }).click();
  await restored.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await restored.locator('input[type=password]').nth(1).fill(BACKUP_PASSWORD);
  await restored.getByRole('checkbox', { name: /Wybieram zastąpienie/ }).check();
  await restored.getByRole('button', { name: 'Odtwórz sejf', exact: true }).click();
  await expect(restored.getByText(/Odtworzono 0 spraw, 2 rekordów i 2 oryginalnych plików/)).toBeVisible();
  await restored.getByRole('button', { name: 'Dokumenty', exact: true }).click();
  await restored.getByText('synthetic-scanned.pdf', { exact: true }).first().click();
  await expect(restored.getByText(NOTE, { exact: true })).toBeVisible();
  expect(createHash('sha256').update(await originalBytes(restored)).digest('hex')).toBe(createHash('sha256').update(pdfBytes).digest('hex'));
  await restored.reload();
  await restored.getByRole('dialog').getByLabel('Hasło sejfu lub klucz').fill(BACKUP_PASSWORD);
  await restored.getByRole('button', { name: 'Odblokuj sejf', exact: true }).click();
  await restored.getByRole('button', { name: 'Dokumenty', exact: true }).click();
  await restored.getByText('synthetic-scanned.pdf', { exact: true }).first().click();
  expect(await originalBytes(restored)).toEqual(pdfBytes);
  // Simulate a browser losing its encrypted original storage, then relink only matching bytes.
  await restored.evaluate(async () => {
    for (const database of await indexedDB.databases()) {
      if (!database.name?.endsWith('-documents') && !database.name?.startsWith('tywygrywasz-owned-documents-')) continue;
      const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open(database.name!); req.onsuccess = () => resolve(req.result); });
      await new Promise<void>((resolve, reject) => { const tx = db.transaction('encrypted-documents', 'readwrite'); tx.objectStore('encrypted-documents').clear(); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
    }
  });
  await restored.getByRole('button', { name: 'Odśwież stan z dysku' }).click();
  await expect(restored.getByText('Brak pliku na dysku').first()).toBeVisible();
  const changed = Buffer.from(pdfBytes); changed[changed.length - 20] ^= 1;
  await restored.locator('input[type=file]:not([multiple])').setInputFiles({ name: 'changed.pdf', mimeType: 'application/pdf', buffer: changed });
  await expect(restored.getByText(/Wskazany plik ma inne bajty/)).toBeVisible();
  await restored.locator('input[type=file]:not([multiple])').setInputFiles({ name: 'original.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
  await expect(restored.getByText('SHA-256 i rozmiar zgodne', { exact: false })).toBeVisible();
  expect(await originalBytes(restored)).toEqual(pdfBytes);
  await clean.close();
  expect(networkLeaks).toEqual([]);
  expect(foreignRequests).toEqual([]);
  expect(mutations).toEqual([]);
});

for (const failure of ['wrong-envelope-password', 'corrupt-manifest']) {
  test(`account switch ${failure} preserves stored data and clears the previous vault`, async ({ page }) => {
    await createLocalVault(page);
    await importFile(page, 'private-account-a.txt', 'text/plain', Buffer.from(CANARY));
    await page.evaluate((failure) => {
      localStorage.setItem('tywygrywasz-key-envelope-account-b', localStorage.getItem('tywygrywasz-key-envelope-local')!);
      if (failure === 'corrupt-manifest') localStorage.setItem('tywygrywasz-vault-account-b', '{corrupt-copy-preserve}');
    }, failure);
    await page.route('**/api/auth/csrf', (route) => route.fulfill({ json: { csrfToken: 'synthetic-csrf' } }));
    await page.route('**/api/auth/login', (route) => route.fulfill({ json: { user: { id: 'account-b', name: 'Synthetic B', email: 'b@example.test' } } }));
    await page.getByRole('button', { name: 'Zaloguj lub załóż konto' }).click();
    const dialog = page.getByRole('dialog', { name: 'Zaloguj się do swojego konta' });
    await dialog.getByLabel('Adres e-mail').fill('b@example.test');
    await dialog.getByLabel('Hasło konta').fill(failure === 'corrupt-manifest' ? PASSWORD : 'Wrong-local-password-2026');
    await dialog.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Odblokuj lokalny sejf' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
    await page.getByRole('button', { name: 'Dokumenty', exact: true }).click();
    await expect(page.getByText('private-account-a.txt', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('tywygrywasz-vault-account-b'))).toBe(failure === 'corrupt-manifest' ? '{corrupt-copy-preserve}' : null);
    expect(await page.evaluate(() => localStorage.getItem('tywygrywasz-vault-local'))).toBeTruthy();
  });
}

test('printing includes only selected draft text and excludes private guidance', async ({ page }) => {
  await page.addInitScript(() => {
    const append = Node.prototype.appendChild;
    Node.prototype.appendChild = function<T extends Node>(this: Node, child: T): T {
      const attached = append.call(this, child) as T;
      if (child instanceof HTMLIFrameElement && child.contentWindow) child.contentWindow.print = () => {
        (window as unknown as { capturedPrint: string }).capturedPrint = child.contentDocument?.body.textContent || '';
      };
      return attached;
    };
  });
  await createLocalVault(page);
  await page.getByRole('button', { name: 'Moje sprawy', exact: true }).click();
  await page.getByRole('button', { name: 'Utwórz nową sprawę' }).click();
  await page.getByPlaceholder('np. Odwołanie od odmowy pozwolenia na budowę').fill('Synthetic print case');
  await page.getByPlaceholder('np. Prezydent m.st. Warszawy').fill('Synthetic authority');
  await page.getByPlaceholder('np. Uchylenie niekorzystnej decyzji i uzyskanie pozwolenia zamiennego').fill('Synthetic goal');
  await page.getByPlaceholder('np. Organ I instancji w sprawach architektoniczno-budowlanych').fill('Synthetic jurisdiction to review');
  await page.getByRole('button', { name: 'Utwórz sprawę', exact: true }).click();
  await page.getByRole('button', { name: 'Pisma', exact: true }).click();
  await page.getByRole('button', { name: 'Utwórz projekt pisma' }).click();
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await page.getByRole('textbox', { name: 'Wskazówki robocze pisma' }).fill(NOTE);
  await page.getByRole('button', { name: 'Zapisz wskazówki' }).click();
  await page.getByRole('button', { name: /Drukuj|PDF/ }).first().click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { capturedPrint?: string }).capturedPrint || '')).toContain('Żądania:');
  const output = await page.evaluate(() => (window as unknown as { capturedPrint: string }).capturedPrint);
  expect(output).not.toContain(NOTE); expect(output).not.toContain('Wskazówki robocze');
  expect(output).not.toContain('Rejestracja'); expect(output).not.toContain('Wygenerowane pisma');
});
