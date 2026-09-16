import { randomUUID } from 'crypto';
import { and, asc, gte, lte } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { prop_firm_payouts } from '@/lib/db/schema';
import { dateRangeSchema, nullIfBlank, payoutSchema } from '@/lib/journal-record-contracts';

export async function GET(req: NextRequest) {
  try { await verifyRequest(req); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const parsed = dateRangeSchema.safeParse({ start: req.nextUrl.searchParams.get('start'), end: req.nextUrl.searchParams.get('end') });
  if (!parsed.success) return NextResponse.json({ error: 'A valid start/end date range is required' }, { status: 400 });
  const records = await db.select().from(prop_firm_payouts).where(and(gte(prop_firm_payouts.date, parsed.data.start), lte(prop_firm_payouts.date, parsed.data.end))).orderBy(asc(prop_firm_payouts.date));
  return NextResponse.json(records);
}
export async function POST(req: NextRequest) {
  try { await verifyRequest(req); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const parsed = payoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payout' }, { status: 400 });
  const now = new Date().toISOString();
  const record = { ...parsed.data, id: randomUUID(), notes: nullIfBlank(parsed.data.notes), created_at: now, updated_at: now };
  await db.insert(prop_firm_payouts).values(record);
  return NextResponse.json({ record }, { status: 201 });
}
