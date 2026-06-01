import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionValue,
  getAuthConfig,
  getSessionCookieOptions,
  SESSION_COOKIE,
  verifyCredentials,
} from '@/lib/session';

export async function POST(req: NextRequest) {
  const config = getAuthConfig();
  if (!config.isAuthConfigured) {
    return NextResponse.json(
      { error: 'Authentication is not configured. Set JOURNAL_PASSWORD and JOURNAL_SESSION_SECRET.' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!verifyCredentials(username, password)) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const res = NextResponse.json({
    ok: true,
    user: {
      uid: 'local-admin',
      email: 'local@trading-journal.app',
      displayName: 'Local Admin',
    },
    isUsingDefaultPassword: config.isUsingDefaultPassword,
  });
  res.cookies.set(SESSION_COOKIE, createSessionValue(), getSessionCookieOptions());
  return res;
}
