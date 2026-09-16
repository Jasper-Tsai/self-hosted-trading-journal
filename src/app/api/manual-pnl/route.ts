import { randomUUID } from 'crypto';
import { and, asc, gte, lte } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { direct_pnl_trades } from '@/lib/db/schema';
import { dateRangeSchema, directPnlSchema, nullIfBlank } from '@/lib/journal-record-contracts';

export async function GET(req: NextRequest) {
  try { await verifyRequest(req); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const parsed = dateRangeSchema.safeParse({ start: req.nextUrl.searchParams.get('start'), end: req.nextUrl.searchParams.get('end') });
  if (!parsed.success) return NextResponse.json({ error: 'A valid start/end date range is required' }, { status: 400 });
  const records = await db.select().from(direct_pnl_trades).where(and(gte(direct_pnl_trades.date, parsed.data.start), lte(direct_pnl_trades.date, parsed.data.end))).orderBy(asc(direct_pnl_trades.date), asc(direct_pnl_trades.exit_time));
  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  try { await verifyRequest(req); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const parsed = directPnlSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid manual P&L record' }, { status: 400 });
  const now = new Date().toISOString();
  const record = { ...parsed.data, id: randomUUID(), strategy: nullIfBlank(parsed.data.strategy), notes: nullIfBlank(parsed.data.notes), created_at: now, updated_at: now };
  await db.insert(direct_pnl_trades).values(record);
  return NextResponse.json({ record }, { status: 201 });
}
