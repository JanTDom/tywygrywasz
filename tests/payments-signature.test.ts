import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { p24Sign, registrationSign, validateWebhook, webhookSign, type PaymentConfig, type P24Webhook } from '@/domain/payments';

const config: PaymentConfig = { merchantId: 999999, posId: 999999, crc: 'crc-test', apiKey: 'api-test', amount: 6900, currency: 'PLN', offerName: 'Plan TyWygrywasz', sellerName: 'TyWygrywasz', sellerEmail: 'sprzedaz@example.test', returnUrl: 'https://tywygrywasz.pl/platosc', statusUrl: 'https://tywygrywasz.pl/api/payments/webhook', baseUrl: 'https://sandbox.przelewy24.pl/api/v1' };

describe('Przelewy24 signatures', () => {
  it('uses SHA-384 over the documented JSON field order', () => {
    const expected = createHash('sha384').update(JSON.stringify({ sessionId: 'tw-session', merchantId: 999999, amount: 6900, currency: 'PLN', crc: 'crc-test' })).digest('hex');
    expect(registrationSign({ ...config, sessionId: 'tw-session' })).toBe(expected);
    expect(p24Sign({ sessionId: 'tw-session', merchantId: 999999, amount: 6900, currency: 'PLN', crc: 'crc-test' })).toBe(expected);
  });

  it('accepts only an exact, amount-bound webhook', () => {
    const base: Omit<P24Webhook, 'sign'> = { merchantId: 999999, posId: 999999, sessionId: 'tw-session', amount: 6900, originAmount: 6900, currency: 'PLN', orderId: 12345, methodId: 154, statement: 'TyWygrywasz' };
    const payload = { ...base, sign: webhookSign({ ...base, crc: config.crc }) };
    expect(validateWebhook(payload, config, { amount: 6900, currency: 'PLN', merchantId: 999999, posId: 999999 })).toBe(true);
    expect(validateWebhook({ ...payload, amount: 1 }, config, { amount: 6900, currency: 'PLN', merchantId: 999999, posId: 999999 })).toBe(false);
    expect(validateWebhook({ ...payload, merchantId: 1 }, config, { amount: 6900, currency: 'PLN', merchantId: 999999, posId: 999999 })).toBe(false);
  });
});
