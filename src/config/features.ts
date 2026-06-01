import { NextResponse } from 'next/server';

export type PageKey =
  | 'dashboard'
  | 'trades'
  | 'review'
  | 'calendar'
  | 'csv';

const ALL_PAGES: PageKey[] = [
  'dashboard',
  'trades',
  'review',
  'calendar',
  'csv',
];

function parseEnabledPages(raw: string | undefined): Set<PageKey> {
  if (!raw) return new Set(ALL_PAGES);
  const keys = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is PageKey => ALL_PAGES.includes(s as PageKey));
  return new Set(keys);
}

export const features = {
  brandName: process.env.APP_BRAND_NAME ?? 'Self-Hosted Trading Journal',
  enabledPages: parseEnabledPages(process.env.ENABLED_PAGES),
  csv: process.env.ENABLE_CSV !== 'false',
};

export function isPageEnabled(key: PageKey): boolean {
  return features.enabledPages.has(key);
}

export const PAGE_ROUTES: Record<PageKey, string> = {
  dashboard: '/',
  trades: '/trades',
  review: '/review',
  calendar: '/calendar',
  csv: '/csv',
};

export function notEnabled(): NextResponse {
  return NextResponse.json({ error: 'feature disabled' }, { status: 404 });
}
