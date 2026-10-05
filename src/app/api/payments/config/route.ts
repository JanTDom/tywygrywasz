import { NextResponse } from 'next/server';
import { getPaymentReadiness } from '@/domain/payments';
import { getPublicCommerceConfig } from '@/domain/commerce-config';
export const dynamic = 'force-dynamic';
export async function GET() {
  const commerce = getPublicCommerceConfig();
  const payment = getPaymentReadiness();
  const missing = Array.from(new Set([...commerce.missing, ...payment.missing]));
  return NextResponse.json({
    success: true,
    ready: missing.length === 0,
    missing,
    offer: commerce.offer,
    seller: commerce.seller,
    paymentMethods: commerce.paymentMethods,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
