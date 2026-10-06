import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const scrypt = promisify(scryptCallback) as unknown as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

export const SESSION_COOKIE_NAME = 'obywatel_session';
export const CSRF_COOKIE_NAME = 'obywatel_csrf';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_BYTES = 16;
const SESSION_TOKEN_BYTES = 32;
const CSRF_TOKEN_BYTES = 24;

type UserRecord = {
  id: string;
  name: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  emailVerifiedAt: string | null;
  credentialVersion: number;
};

type SessionRecord = {
  userId: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: string;
};

type DurableUserRow = {
  id: string;
  name: string;
  email: string;
  email_normalized: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
  email_verified_at: string | null;
  credential_version: number;
};

type DurableSessionRow = {
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
};

export type PublicUser = Pick<UserRecord, 'id' | 'name' | 'email' | 'createdAt' | 'emailVerifiedAt' | 'credentialVersion'> & { emailVerified: boolean };

/**
 * Local fallback used by tests and the offline development server. When both
 * Supabase variables are configured, account/session reads use Postgres.
 * Document bytes never enter this store.
 */
const usersByEmail = new Map<string, UserRecord>();
const usersById = new Map<string, UserRecord>();
const sessionsByTokenHash = new Map<string, SessionRecord>();
export type AccountTokenPurpose = 'verify_email' | 'reset_password';
type AccountTokenRecord = { tokenHash: string; userId: string; purpose: AccountTokenPurpose; expiresAt: number; createdAt: number };
const accountTokensByHash = new Map<string, AccountTokenRecord>();
let supabaseAdmin: SupabaseClient | null | undefined;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function publicUser(user: UserRecord): PublicUser {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, emailVerifiedAt: user.emailVerifiedAt, emailVerified: Boolean(user.emailVerifiedAt), credentialVersion: user.credentialVersion };
}

function userFromRow(row: DurableUserRow): PublicUser {
  return { id: row.id, name: row.name, email: row.email, createdAt: row.created_at, emailVerifiedAt: row.email_verified_at ?? null, emailVerified: Boolean(row.email_verified_at), credentialVersion: row.credential_version ?? 0 };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function durableClient(): SupabaseClient | null {
  if (process.env.NODE_ENV === 'production' && !hasDurableAuthStorage()) throw new Error('Magazyn kont nie jest skonfigurowany.');
  if (supabaseAdmin !== undefined) return supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    if (process.env.NODE_ENV === 'production') throw new Error('Magazyn kont nie jest skonfigurowany.');
    supabaseAdmin = null;
    return supabaseAdmin;
  }
  supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return supabaseAdmin;
}

export function hasDurableAuthStorage(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Server-only client. Never import this module from the browser bundle. */
export function getSupabaseAdminClient(): SupabaseClient | null {
  return durableClient();
}

async function derivePasswordHash(password: string, salt: Buffer): Promise<Buffer> {
  const derived = await scrypt(password, salt, PASSWORD_KEY_LENGTH, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  });
  return Buffer.from(derived as Uint8Array);
}

export function validateRegistrationInput(input: { name?: unknown; email?: unknown; password?: unknown }): { name: string; email: string; password: string } {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (name.length < 2 || name.length > 120) throw new Error('Podaj nazwę użytkownika (2–120 znaków).');
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error('Podaj poprawny adres e-mail.');
  if (password.length < 12 || password.length > 128) throw new Error('Hasło musi mieć od 12 do 128 znaków.');

  return { name, email, password };
}

export async function createUser(input: { name: string; email: string; password: string }): Promise<PublicUser> {
  const emailNormalized = normalizeEmail(input.email);
  const id = `user-${randomBytes(16).toString('hex')}`;
  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const passwordHash = await derivePasswordHash(input.password, salt);
  const now = new Date().toISOString();
  const db = durableClient();

  if (db) {
    const { data, error } = await db.from('app_users').insert({
      id,
      name: input.name.trim(),
      email: input.email.trim(),
      email_normalized: emailNormalized,
      password_hash: passwordHash.toString('hex'),
      password_salt: salt.toString('hex'),
      created_at: now,
    }).select('id,name,email,created_at,email_verified_at,credential_version').single();
    if (error) {
      if (error.code === '23505') throw new Error('Konto z tym adresem e-mail już istnieje.');
      throw new Error('Nie udało się zapisać konta.');
    }
    return userFromRow(data as DurableUserRow);
  }

  if (usersByEmail.has(emailNormalized)) throw new Error('Konto z tym adresem e-mail już istnieje.');
  const user: UserRecord = {
    id,
    name: input.name.trim(),
    email: input.email.trim(),
    emailNormalized,
    passwordHash: passwordHash.toString('hex'),
    passwordSalt: salt.toString('hex'),
    createdAt: now,
    emailVerifiedAt: null,
    credentialVersion: 0,
  };
  usersByEmail.set(emailNormalized, user);
  usersById.set(id, user);
  return publicUser(user);
}

export async function verifyCredentials(email: string, password: string): Promise<PublicUser | null> {
  if (password.length > 128 || email.length > 254) return null;
  const db = durableClient();
  if (db) {
    const { data, error } = await db.from('app_users')
      .select('id,name,email,email_normalized,password_hash,password_salt,created_at,email_verified_at,credential_version')
      .eq('email_normalized', normalizeEmail(email))
      .maybeSingle();
    if (error || !data) return null;
    const row = data as DurableUserRow;
    const expected = Buffer.from(row.password_hash, 'hex');
    const actual = await derivePasswordHash(password, Buffer.from(row.password_salt, 'hex'));
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    return userFromRow(row);
  }

  const user = usersByEmail.get(normalizeEmail(email));
  if (!user) return null;
  const expectedVersion = user.credentialVersion;
  const expected = Buffer.from(user.passwordHash, 'hex');
  const actual = await derivePasswordHash(password, Buffer.from(user.passwordSalt, 'hex'));
  if (user.credentialVersion !== expectedVersion || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return publicUser(user);
}

export function createCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString('base64url');
}

export function safeEqualStrings(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function createSession(userId: string, expectedCredentialVersion?: number): Promise<string> {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const tokenHash = sha256(token);
  const now = new Date();
  const expiresAt = now.getTime() + SESSION_TTL_SECONDS * 1000;
  const db = durableClient();

  if (db) {
    const { data, error } = await db.rpc('create_app_session', {
      p_user_id: userId,
      p_token_hash: tokenHash,
      p_expires_at: new Date(expiresAt).toISOString(),
      p_expected_credential_version: expectedCredentialVersion ?? null,
    });
    if (error || !data) throw new Error('Nie udało się utworzyć sesji.');
    return token;
  }

  const storedUser = usersById.get(userId);
  if (!storedUser || (expectedCredentialVersion !== undefined && storedUser.credentialVersion !== expectedCredentialVersion)) throw new Error('Nie udało się utworzyć sesji. Zaloguj się ponownie.');
  sessionsByTokenHash.set(tokenHash, { userId, tokenHash, expiresAt, createdAt: now.toISOString() });
  return token;
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = sha256(token);
  const db = durableClient();
  if (db) {
    const { error } = await db.from('app_sessions').delete().eq('token_hash', tokenHash);
    if (error) throw new Error('Nie udało się unieważnić sesji.');
    return;
  }
  sessionsByTokenHash.delete(tokenHash);
}

export async function getUserBySessionToken(token: string | undefined): Promise<PublicUser | null> {
  if (!token) return null;
  const tokenHash = sha256(token);
  const db = durableClient();

  if (db) {
    const { data: sessionData, error: sessionError } = await db.from('app_sessions')
      .select('user_id,token_hash,expires_at,created_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (sessionError || !sessionData) return null;
    const session = sessionData as DurableSessionRow;
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await db.from('app_sessions').delete().eq('token_hash', tokenHash);
      return null;
    }
    const { data: userData, error: userError } = await db.from('app_users')
      .select('id,name,email,email_normalized,password_hash,password_salt,created_at,email_verified_at,credential_version')
      .eq('id', session.user_id)
      .maybeSingle();
    return userError || !userData ? null : userFromRow(userData as DurableUserRow);
  }

  const session = sessionsByTokenHash.get(tokenHash);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessionsByTokenHash.delete(tokenHash);
    return null;
  }
  const user = usersById.get(session.userId);
  return user ? publicUser(user) : null;
}

export async function updateUserName(userId: string, name: string): Promise<PublicUser> {
  const cleanName = name.trim();
  if (cleanName.length < 2 || cleanName.length > 120) throw new Error('Podaj nazwę użytkownika (2–120 znaków).');
  const db = durableClient();

  if (db) {
    const { data, error } = await db.from('app_users').update({ name: cleanName }).eq('id', userId).select('id,name,email,created_at,email_verified_at,credential_version').single();
    if (error || !data) throw new Error('Konto nie istnieje.');
    return userFromRow(data as DurableUserRow);
  }

  const user = usersById.get(userId);
  if (!user) throw new Error('Konto nie istnieje.');
  user.name = cleanName;
  return publicUser(user);
}

export function clearAuthStoreForTests(): void {
  usersByEmail.clear();
  usersById.clear();
  sessionsByTokenHash.clear();
  accountTokensByHash.clear();
  supabaseAdmin = undefined;
}

/** Only server mail delivery receives the raw secret. The store keeps SHA-256. */
export async function issueAccountToken(email: string, purpose: AccountTokenPurpose): Promise<{ user: PublicUser; token: string; expiresAt: string } | null> {
  const db = durableClient();
  let user: PublicUser | null;
  if (db) {
    const { data, error } = await db.from('app_users').select('id,name,email,created_at,email_verified_at,credential_version')
      .eq('email_normalized', normalizeEmail(email)).maybeSingle();
    if (error) throw new Error('Nie udało się przygotować operacji konta.');
    user = data ? userFromRow(data as DurableUserRow) : null;
  } else {
    const stored = usersByEmail.get(normalizeEmail(email));
    user = stored ? publicUser(stored) : null;
  }
  if (!user || (purpose === 'verify_email' && user.emailVerified)) return null;
  const token = randomBytes(32).toString('base64url');
  const tokenHash = sha256(token);
  const now = Date.now();
  const expiresAt = new Date(now + (purpose === 'verify_email' ? 24 * 60 * 60 : 30 * 60) * 1000).toISOString();
  if (db) {
    const { data, error } = await db.rpc('issue_app_account_token', {
      p_user_id: user.id, p_purpose: purpose, p_token_hash: tokenHash, p_expires_at: expiresAt,
    });
    if (error) throw new Error('Nie udało się przygotować operacji konta.');
    if (!data) return null; // Durable per-account resend cooldown.
  } else {
    for (const record of accountTokensByHash.values()) {
      if (record.userId === user.id && record.purpose === purpose && now - record.createdAt < 60_000) return null;
    }
    for (const [hash, record] of accountTokensByHash) {
      if (record.userId === user.id && record.purpose === purpose) accountTokensByHash.delete(hash);
    }
    accountTokensByHash.set(tokenHash, { tokenHash, userId: user.id, purpose, expiresAt: Date.parse(expiresAt), createdAt: now });
  }
  return { user, token, expiresAt };
}

export async function invalidateAccountToken(token: string): Promise<void> {
  const db = durableClient();
  if (db) {
    const { error } = await db.from('app_account_tokens').delete().eq('token_hash', sha256(token));
    if (error) throw new Error('Nie udało się unieważnić kodu.');
  } else accountTokensByHash.delete(sha256(token));
}

function validateAccountToken(token: string): void {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Kod jest nieprawidłowy, wygasł albo został już użyty.');
}

export async function verifyAccountEmail(userId: string, token: string): Promise<void> {
  validateAccountToken(token);
  const db = durableClient();
  if (db) {
    const { data, error } = await db.rpc('consume_app_account_token', {
      p_token_hash: sha256(token), p_purpose: 'verify_email', p_expected_user_id: userId,
      p_password_hash: null, p_password_salt: null,
    });
    if (error || !data) throw new Error('Kod jest nieprawidłowy, wygasł albo został już użyty.');
    return;
  }
  const tokenHash = sha256(token);
  const record = accountTokensByHash.get(tokenHash);
  if (!record || record.userId !== userId || record.purpose !== 'verify_email' || record.expiresAt <= Date.now()) {
    throw new Error('Kod jest nieprawidłowy, wygasł albo został już użyty.');
  }
  const user = usersById.get(userId);
  if (!user) throw new Error('Kod jest nieprawidłowy, wygasł albo został już użyty.');
  accountTokensByHash.delete(tokenHash);
  user.emailVerifiedAt = new Date().toISOString();
}

/** Account recovery never reads/wraps/decrypts a vault key or sync envelope. */
export async function resetAccountPassword(token: string, password: string): Promise<void> {
  validateAccountToken(token);
  if (password.length < 12 || password.length > 128) throw new Error('Hasło musi mieć od 12 do 128 znaków.');
  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const passwordHash = (await derivePasswordHash(password, salt)).toString('hex');
  const db = durableClient();
  if (db) {
    const { data, error } = await db.rpc('consume_app_account_token', {
      p_token_hash: sha256(token), p_purpose: 'reset_password', p_expected_user_id: null,
      p_password_hash: passwordHash, p_password_salt: salt.toString('hex'),
    });
    if (error || !data) throw new Error('Kod jest nieprawidłowy, wygasł albo został już użyty.');
    return;
  }
  // No await between checking and consuming; local concurrent resets cannot replay.
  const tokenHash = sha256(token);
  const record = accountTokensByHash.get(tokenHash);
  if (!record || record.purpose !== 'reset_password' || record.expiresAt <= Date.now()) {
    throw new Error('Kod jest nieprawidłowy, wygasł albo został już użyty.');
  }
  const user = usersById.get(record.userId);
  if (!user) throw new Error('Kod jest nieprawidłowy, wygasł albo został już użyty.');
  user.passwordHash = passwordHash;
  user.passwordSalt = salt.toString('hex');
  user.credentialVersion += 1;
  // Possession of a reset code confirms access to the email mailbox.
  user.emailVerifiedAt = user.emailVerifiedAt || new Date().toISOString();
  for (const [hash, session] of sessionsByTokenHash) if (session.userId === user.id) sessionsByTokenHash.delete(hash);
  for (const [hash, existing] of accountTokensByHash) if (existing.userId === user.id) accountTokensByHash.delete(hash);
}

/** Replace every session with one new secret, including the current session. */
export async function rotateAccountSessions(currentToken: string): Promise<string> {
  const db = durableClient();
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const now = new Date();
  const expiresAt = now.getTime() + SESSION_TTL_SECONDS * 1000;
  if (db) {
    const { data, error } = await db.rpc('rotate_app_sessions', {
      p_current_token_hash: sha256(currentToken), p_new_token_hash: sha256(token), p_expires_at: new Date(expiresAt).toISOString(),
    });
    if (error || !data) throw new Error('Sesja wygasła. Zaloguj się ponownie.');
    return token;
  }
  const current = sessionsByTokenHash.get(sha256(currentToken));
  if (!current || current.expiresAt <= Date.now()) throw new Error('Sesja wygasła. Zaloguj się ponownie.');
  for (const [hash, session] of sessionsByTokenHash) if (session.userId === current.userId) sessionsByTokenHash.delete(hash);
  sessionsByTokenHash.set(sha256(token), { userId: current.userId, tokenHash: sha256(token), expiresAt, createdAt: now.toISOString() });
  return token;
}
