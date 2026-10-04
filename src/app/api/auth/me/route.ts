import { NextRequest, NextResponse } from 'next/server';
import { updateUserName } from '@/domain/auth-store';
import { csrfIsValid, jsonError, parseJsonBody, userFromRequest } from '../_utils';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await userFromRequest(request);
  if (!user) return jsonError('Brak aktywnej sesji.', 401);
  return NextResponse.json({ success: true, user }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: NextRequest) {
  if (!csrfIsValid(request)) return jsonError('Nieprawidłowy token formularza.', 403);
  const user = await userFromRequest(request);
  if (!user) return jsonError('Brak aktywnej sesji.', 401);
  try {
    const body = await parseJsonBody(request);
    const name = typeof body.name === 'string' ? body.name : '';
    return NextResponse.json({ success: true, user: await updateUserName(user.id, name) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Nie udało się zaktualizować profilu.', 400);
  }
}
