import { NextRequest, NextResponse } from 'next/server';
import { PAGE_ROUTES, PageKey } from '@/config/features';
import { SESSION_COOKIE, verifySessionValue } from '@/lib/session';

const ENABLED_PAGES_RAW = process.env.ENABLED_PAGES;

const ALL_PAGES: PageKey[] = [
  'dashboard',
  'trades',
  'review',
  'calendar',
  'csv',
];

function getEnabledPages(): Set<PageKey> {
  if (!ENABLED_PAGES_RAW) return new Set(ALL_PAGES);
  const keys = ENABLED_PAGES_RAW
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is PageKey => ALL_PAGES.includes(s as PageKey));
  return new Set(keys);
}

const enabledPages = getEnabledPages();

const ROUTE_TO_PAGE: Record<string, PageKey> = Object.fromEntries(
  Object.entries(PAGE_ROUTES).map(([key, route]) => [route, key as PageKey])
);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthenticated = verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value);

  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/access-denied'
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/') && !isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (pathname === '/login') {
    return isAuthenticated ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  }

  if (!isAuthenticated) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const pageKey = ROUTE_TO_PAGE[pathname];
  if (pageKey && !enabledPages.has(pageKey)) {
    return NextResponse.rewrite(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.png|.*\\.jpg|.*\\.svg).*)',
  ],
};
