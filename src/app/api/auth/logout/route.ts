import { NextResponse } from 'next/server';
import { getSessionCookieOptions, SESSION_COOKIE } from '@/lib/session';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', getSessionCookieOptions(0));
  return res;
}
