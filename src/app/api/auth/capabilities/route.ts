import { NextResponse } from 'next/server';
import { accountEmailIsConfigured } from '@/domain/account-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** No identity, secret, provider response or document data is exposed. */
export async function GET() {
  return NextResponse.json({ emailCodesAvailable: accountEmailIsConfigured() }, { headers: { 'Cache-Control': 'no-store' } });
}
