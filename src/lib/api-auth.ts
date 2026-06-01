import { NextRequest } from 'next/server';
import type { UserRole } from '@/contexts/AuthContext';
import { SESSION_COOKIE, verifySessionValue } from '@/lib/session';

export async function verifyRequest(req: NextRequest): Promise<{
  uid: string;
  email: string;
  role: UserRole;
}> {
  if (!verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value)) {
    throw new Error('Unauthorized');
  }

  return {
    uid: 'local-admin',
    email: 'local@trading-journal.app',
    role: 'owner',
  };
}
