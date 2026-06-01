import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthConfig, SESSION_COOKIE, verifySessionValue } from '@/lib/session';

export async function GET() {
  const cookieStore = await cookies();
  const config = getAuthConfig();
  const authenticated = verifySessionValue(cookieStore.get(SESSION_COOKIE)?.value);
  return NextResponse.json({
    authenticated,
    authConfigured: config.isAuthConfigured,
    user: authenticated
      ? {
          uid: 'local-admin',
          email: 'local@trading-journal.app',
          displayName: 'Local Admin',
        }
      : null,
    isUsingDefaultPassword: config.isUsingDefaultPassword,
  });
}
