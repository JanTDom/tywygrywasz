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
};

type DurableSessionRow = {
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
};

export type PublicUser = Pick<UserRecord, 'id' | 'name' | 'email' | 'createdAt'>;

/**
 * Local fallback used by tests and the offline development server. When both
 * Supabase variables are configured, account/session reads use Postgres.
 * Document bytes never enter this store.
 */
const usersByEmail = new Map<string, UserRecord>();
const usersById = new Map<string, UserRecord>();
const sessionsByTokenHash = new Map<string, SessionRecord>();
let supabaseAdmin: SupabaseClient | null | undefined;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function publicUser(user: UserRecord): PublicUser {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

function userFromRow(row: DurableUserRow): PublicUser {
  return { id: row.id, name: row.name, email: row.email, createdAt: row.created_at };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function durableClient(): SupabaseClient | null {
  if (supabaseAdmin !== undefined) return supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
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
    }).select('id,name,email,created_at').single();
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
  };
  usersByEmail.set(emailNormalized, user);
  usersById.set(id, user);
  return publicUser(user);
}

export async function verifyCredentials(email: string, password: string): Promise<PublicUser | null> {
  const db = durableClient();
  if (db) {
    const { data, error } = await db.from('app_users')
      .select('id,name,email,email_normalized,password_hash,password_salt,created_at')
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
  const expected = Buffer.from(user.passwordHash, 'hex');
  const actual = await derivePasswordHash(password, Buffer.from(user.passwordSalt, 'hex'));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
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

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const tokenHash = sha256(token);
  const now = new Date();
  const expiresAt = now.getTime() + SESSION_TTL_SECONDS * 1000;
  const db = durableClient();

  if (db) {
    const { error } = await db.from('app_sessions').insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: new Date(expiresAt).toISOString(),
      created_at: now.toISOString(),
    });
    if (error) throw new Error('Nie udało się utworzyć sesji.');
    return token;
  }

  if (!usersById.has(userId)) throw new Error('Nie można utworzyć sesji dla nieistniejącego konta.');
  sessionsByTokenHash.set(tokenHash, { userId, tokenHash, expiresAt, createdAt: now.toISOString() });
  return token;
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = sha256(token);
  const db = durableClient();
  if (db) {
    await db.from('app_sessions').delete().eq('token_hash', tokenHash);
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
      .select('id,name,email,email_normalized,password_hash,password_salt,created_at')
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
    const { data, error } = await db.from('app_users').update({ name: cleanName }).eq('id', userId).select('id,name,email,created_at').single();
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
}
