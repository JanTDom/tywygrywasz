import { NextRequest, NextResponse } from 'next/server';
import { getPaymentConfig, paymentBySession, validateWebhook, verifyWithP24, markPaidIfPending, type P24Webhook } from '@/domain/payments';
import { parseJsonBody } from '../../auth/_utils';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  let payload: P24Webhook; try { payload = await parseJsonBody(request, 8 * 1024) as unknown as P24Webhook; } catch { return NextResponse.json({ success: false }, { status: 400 }); }
  if (!payload || typeof payload.sessionId !== 'string' || payload.sessionId.length < 8 || payload.sessionId.length > 100 ||
    !Number.isSafeInteger(payload.merchantId) || !Number.isSafeInteger(payload.posId) || !Number.isSafeInteger(payload.amount) ||
    !Number.isSafeInteger(payload.originAmount) || !Number.isSafeInteger(payload.orderId) || !Number.isSafeInteger(payload.methodId) ||
    typeof payload.currency !== 'string' || typeof payload.statement !== 'string' || typeof payload.sign !== 'string') {
    return NextResponse.json({ success: false }, { status: 400 });
  }
  let config; try { config = getPaymentConfig(); } catch { return NextResponse.json({ success: false }, { status: 503 }); }
  const payment = await paymentBySession(payload.sessionId); if (!payment || payment.status === 'failed' || payment.status === 'cancelled') return NextResponse.json({ success: false }, { status: 404 });
  if (!validateWebhook(payload, config, { amount: payment.amount, currency: payment.currency, merchantId: payment.merchant_id, posId: payment.pos_id })) return NextResponse.json({ success: false }, { status: 400 });
  if (!(await verifyWithP24({ sessionId: payload.sessionId, orderId: payload.orderId }))) return NextResponse.json({ success: false }, { status: 502 });
  await markPaidIfPending(payload.sessionId, payload.orderId); return NextResponse.json({ success: true });
}
