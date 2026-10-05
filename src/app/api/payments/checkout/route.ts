import { NextRequest, NextResponse } from 'next/server';
import { csrfIsValid, enforceRateLimit, jsonError, parseJsonBody, userFromRequest } from '../../auth/_utils';
import { attachP24Payment, createPendingPayment, failPendingPayment, getPaymentConfig, newPaymentSessionId, registerWithP24 } from '@/domain/payments';
import { getPublicCommerceConfig } from '@/domain/commerce-config';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'payment-checkout', 8); if (limited) return limited;
  if (!csrfIsValid(request)) return jsonError('Nieprawidłowy token formularza. Odśwież stronę i spróbuj ponownie.', 403);
  const user = await userFromRequest(request); if (!user) return jsonError('Zaloguj się, aby rozpocząć płatność.', 401);
  let body: Record<string, unknown>; try { body = await parseJsonBody(request); } catch (error) { return jsonError(error instanceof Error ? error.message : 'Nieprawidłowe dane.', 400); }
  if (body.consentTerms !== true || body.privacyAccepted !== true || body.consentDigital !== true) return jsonError('Zaznacz wymagane zgody przed przejściem do płatności.', 400);
  const commerce = getPublicCommerceConfig();
  if (!commerce.ready) return jsonError('Płatności nie są jeszcze skonfigurowane.', 503);
  let config; try { config = getPaymentConfig(); } catch (error) { return jsonError(error instanceof Error ? error.message : 'Płatności nie są gotowe.', 503); }
  if (user.email.length > 50) return jsonError('Adres e-mail konta jest zbyt długi dla operatora płatności.', 400);
  const sessionId = newPaymentSessionId();
  try { await createPendingPayment({ userId: user.id, email: user.email, sessionId, config }); const transaction = await registerWithP24({ sessionId, email: user.email }); await attachP24Payment(sessionId, transaction.token, transaction.orderId); return NextResponse.json({ success: true, sessionId, paymentUrl: `${config.baseUrl.replace('/api/v1', '')}/trnRequest/${encodeURIComponent(transaction.token)}` }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { await failPendingPayment(sessionId).catch(() => undefined); return jsonError(error instanceof Error ? error.message : 'Nie udało się rozpocząć płatności.', 502); }
}
