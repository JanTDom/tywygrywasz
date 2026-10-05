import { NextRequest, NextResponse } from 'next/server';
import { userFromRequest } from '../../auth/_utils';
import { paymentBySession } from '@/domain/payments';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const user = await userFromRequest(request); if (!user) return NextResponse.json({ success: false, error: 'Zaloguj się.' }, { status: 401 });
  const sessionId = request.nextUrl.searchParams.get('sessionId')?.trim(); if (!sessionId || sessionId.length > 100) return NextResponse.json({ success: false, error: 'Brak identyfikatora płatności.' }, { status: 400 });
  const row = await paymentBySession(sessionId); if (!row || row.user_id !== user.id) return NextResponse.json({ success: false, error: 'Nie znaleziono płatności.' }, { status: 404 });
  return NextResponse.json({ success: true, status: row.status, paid: row.status === 'paid' }, { headers: { 'Cache-Control': 'no-store' } });
}
