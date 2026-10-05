import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from './auth-store';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export type PaymentConfig = {
  merchantId: number;
  posId: number;
  crc: string;
  apiKey: string;
  amount: number;
  currency: 'PLN';
  offerName: string;
  sellerName: string;
  sellerEmail: string;
  returnUrl: string;
  statusUrl: string;
  baseUrl: string;
};

export type PaymentReadiness = { ready: boolean; missing: string[] };

function positiveInt(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function required(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function anyRequired(...names: string[]): string | null {
  for (const name of names) { const value = required(name); if (value) return value; }
  return null;
}

function configuredAmount(): number | null {
  const grosz = positiveInt(process.env.P24_AMOUNT_GROSZ);
  if (grosz) return grosz;
  const pln = Number(process.env.COMMERCE_PRICE_GROSS_PLN);
  return Number.isFinite(pln) && pln > 0 && Math.round(pln * 100) === pln * 100 ? Math.round(pln * 100) : null;
}

/** Configuration is deliberately server-only and fails closed when incomplete. */
export function getPaymentReadiness(): PaymentReadiness {
  const missing: string[] = [];
  if (!positiveInt(process.env.P24_MERCHANT_ID)) missing.push('P24_MERCHANT_ID');
  if (!positiveInt(process.env.P24_POS_ID)) missing.push('P24_POS_ID');
  for (const [names, label] of [
    [['P24_CRC'], 'P24_CRC'], [['P24_API_KEY'], 'P24_API_KEY'], [['P24_RETURN_URL'], 'P24_RETURN_URL'], [['P24_STATUS_URL'], 'P24_STATUS_URL'],
    [['P24_OFFER_NAME', 'COMMERCE_OFFER_NAME'], 'P24_OFFER_NAME/COMMERCE_OFFER_NAME'], [['P24_SELLER_NAME', 'COMMERCE_SELLER_NAME'], 'P24_SELLER_NAME/COMMERCE_SELLER_NAME'],
    [['P24_SELLER_ADDRESS', 'COMMERCE_SELLER_ADDRESS'], 'P24_SELLER_ADDRESS/COMMERCE_SELLER_ADDRESS'], [['P24_SELLER_TAX_ID', 'COMMERCE_SELLER_TAX_ID'], 'P24_SELLER_TAX_ID/COMMERCE_SELLER_TAX_ID'],
    [['P24_SELLER_EMAIL', 'COMMERCE_SELLER_EMAIL'], 'P24_SELLER_EMAIL/COMMERCE_SELLER_EMAIL'],
  ] as [string[], string][]) {
    if (!anyRequired(...names)) missing.push(label);
  }
  const amount = configuredAmount();
  if (!amount) missing.push('P24_AMOUNT_GROSZ');
  const publicPrice = Number(process.env.COMMERCE_PRICE_GROSS_PLN);
  if (positiveInt(process.env.P24_AMOUNT_GROSZ) && Number.isFinite(publicPrice) && publicPrice > 0 && Math.round(publicPrice * 100) !== positiveInt(process.env.P24_AMOUNT_GROSZ)) {
    missing.push('zgodność ceny brutto z kwotą P24');
  }
  if (!getSupabaseAdminClient()) missing.push('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
  return { ready: missing.length === 0, missing };
}

export function getPaymentConfig(): PaymentConfig {
  const readiness = getPaymentReadiness();
  if (!readiness.ready) throw new Error(`Płatności nie są jeszcze skonfigurowane: ${readiness.missing.join(', ')}`);
  const merchantId = positiveInt(process.env.P24_MERCHANT_ID)!;
  const posId = positiveInt(process.env.P24_POS_ID)!;
  const amount = configuredAmount()!;
  return {
    merchantId, posId, amount,
    crc: required('P24_CRC')!, apiKey: required('P24_API_KEY')!,
    currency: 'PLN', offerName: anyRequired('P24_OFFER_NAME', 'COMMERCE_OFFER_NAME')!,
    sellerName: anyRequired('P24_SELLER_NAME', 'COMMERCE_SELLER_NAME')!, sellerEmail: anyRequired('P24_SELLER_EMAIL', 'COMMERCE_SELLER_EMAIL')!,
    returnUrl: required('P24_RETURN_URL')!, statusUrl: required('P24_STATUS_URL')!,
    baseUrl: process.env.P24_ENV === 'sandbox' ? 'https://sandbox.przelewy24.pl/api/v1' : 'https://secure.przelewy24.pl/api/v1',
  };
}

export function newPaymentSessionId(): string {
  return `tw-${Date.now().toString(36)}-${randomBytes(12).toString('hex')}`;
}

/** P24 specifies JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES. */
export function p24Sign(payload: Record<string, unknown>): string {
  return createHash('sha384').update(JSON.stringify(payload)).digest('hex');
}

export function registrationSign(input: Pick<PaymentConfig, 'merchantId' | 'crc' | 'amount' | 'currency'> & { sessionId: string }): string {
  return p24Sign({ sessionId: input.sessionId, merchantId: input.merchantId, amount: input.amount, currency: input.currency, crc: input.crc });
}

export function verificationSign(input: Pick<PaymentConfig, 'crc' | 'amount' | 'currency'> & { sessionId: string; orderId: number }): string {
  return p24Sign({ sessionId: input.sessionId, orderId: input.orderId, amount: input.amount, currency: input.currency, crc: input.crc });
}

export type P24Webhook = {
  merchantId: number; posId: number; sessionId: string; amount: number; originAmount: number;
  currency: string; orderId: number; methodId: number; statement: string; sign: string;
};

export function webhookSign(input: Omit<P24Webhook, 'sign'> & { crc: string }): string {
  return p24Sign({ merchantId: input.merchantId, posId: input.posId, sessionId: input.sessionId, amount: input.amount, originAmount: input.originAmount, currency: input.currency, orderId: input.orderId, methodId: input.methodId, statement: input.statement, crc: input.crc });
}

export function secureStringEqual(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const a = Buffer.from(actual, 'utf8'); const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validateWebhook(input: P24Webhook, config: PaymentConfig, order: { amount: number; currency: string; merchantId: number; posId: number }): boolean {
  return input.merchantId === config.merchantId && input.posId === config.posId &&
    input.merchantId === order.merchantId && input.posId === order.posId &&
    input.amount === order.amount && input.originAmount === order.amount && input.currency === order.currency &&
    input.currency === config.currency && secureStringEqual(input.sign, webhookSign({ ...input, crc: config.crc }));
}

export async function registerWithP24(input: { sessionId: string; email: string }): Promise<{ token: string; orderId?: number }> {
  const config = getPaymentConfig();
  const returnUrl = new URL(config.returnUrl);
  returnUrl.searchParams.set('sessionId', input.sessionId);
  const payload = {
    merchantId: config.merchantId, posId: config.posId, sessionId: input.sessionId, amount: config.amount,
    currency: config.currency, description: config.offerName, email: input.email, country: 'PL', language: 'pl',
    urlReturn: returnUrl.toString(), urlStatus: config.statusUrl,
    sign: registrationSign({ ...config, sessionId: input.sessionId }),
  };
  const response = await fetch(`${config.baseUrl}/transaction/register`, {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${config.posId}:${config.apiKey}`).toString('base64')}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload), cache: 'no-store',
  });
  const body = await response.json().catch(() => null) as { data?: { token?: string; orderId?: number }; responseCode?: number } | null;
  if (!response.ok || body?.responseCode !== 0 || !body.data?.token) throw new Error('Przelewy24 nie przyjął transakcji.');
  return { token: body.data.token, orderId: body.data.orderId };
}

export async function verifyWithP24(input: { sessionId: string; orderId: number }): Promise<boolean> {
  const config = getPaymentConfig();
  const response = await fetch(`${config.baseUrl}/transaction/verify`, {
    method: 'PUT', headers: { Authorization: `Basic ${Buffer.from(`${config.posId}:${config.apiKey}`).toString('base64')}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ merchantId: config.merchantId, posId: config.posId, sessionId: input.sessionId, amount: config.amount, currency: config.currency, orderId: input.orderId, sign: verificationSign({ ...config, sessionId: input.sessionId, orderId: input.orderId }) }), cache: 'no-store',
  });
  const body = await response.json().catch(() => null) as { data?: { status?: string }; responseCode?: number } | null;
  return response.ok && body?.responseCode === 0 && body.data?.status === 'success';
}

export type PaymentRow = { id: string; user_id: string; email: string; session_id: string; amount: number; currency: string; merchant_id: number; pos_id: number; status: PaymentStatus; p24_token: string | null; p24_order_id: number | null; created_at: string; paid_at: string | null };

function db(): SupabaseClient {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('Trwałe płatności wymagają konfiguracji Supabase.');
  return client;
}

export async function createPendingPayment(input: { userId: string; email: string; sessionId: string; config: PaymentConfig }): Promise<PaymentRow> {
  const { data, error } = await db().from('payment_orders').insert({ user_id: input.userId, email: input.email, session_id: input.sessionId, amount: input.config.amount, currency: input.config.currency, merchant_id: input.config.merchantId, pos_id: input.config.posId, status: 'pending' }).select('*').single();
  if (error || !data) throw new Error('Nie udało się zapisać zamówienia.');
  return data as PaymentRow;
}

export async function attachP24Payment(sessionId: string, token: string, orderId?: number): Promise<void> {
  const { error } = await db().from('payment_orders').update({ p24_token: token, p24_order_id: orderId ?? null }).eq('session_id', sessionId).eq('status', 'pending');
  if (error) throw new Error('Nie udało się zapisać transakcji.');
}

export async function failPendingPayment(sessionId: string): Promise<void> { await db().from('payment_orders').update({ status: 'failed' }).eq('session_id', sessionId).eq('status', 'pending'); }

export async function paymentBySession(sessionId: string): Promise<PaymentRow | null> {
  const { data, error } = await db().from('payment_orders').select('*').eq('session_id', sessionId).maybeSingle();
  return error || !data ? null : data as PaymentRow;
}

export async function markPaidIfPending(sessionId: string, orderId: number): Promise<boolean> {
  const { data, error } = await db().from('payment_orders').update({ status: 'paid', p24_order_id: orderId, paid_at: new Date().toISOString() }).eq('session_id', sessionId).eq('status', 'pending').select('id').maybeSingle();
  return !error && Boolean(data);
}
