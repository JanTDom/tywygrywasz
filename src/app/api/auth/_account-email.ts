import { after } from 'next/server';
import { accountEmailUsesTestMailbox, deliverAccountEmail } from '@/domain/account-email';
import type { AccountTokenPurpose } from '@/domain/auth-store';

/** Return the same response before mailbox lookup/delivery to avoid enumeration.
 * Next.js keeps `after` work alive for the bounded lifetime of this request. */
export async function scheduleAccountEmail(email: string, purpose: AccountTokenPurpose): Promise<void> {
  if (accountEmailUsesTestMailbox()) {
    await deliverAccountEmail(email, purpose);
    return;
  }
  after(async () => {
    try { await deliverAccountEmail(email, purpose); }
    catch { /* No PII, tokens or provider response is emitted into logs. A new request can retry. */ }
  });
}
