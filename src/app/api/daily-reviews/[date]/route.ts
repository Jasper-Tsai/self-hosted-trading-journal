import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { daily_reviews } from '@/lib/db/schema';
import { dailyReviewSchema, nullIfBlank } from '@/lib/journal-record-contracts';

function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }

export async function GET(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try { await verifyRequest(req); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const { date } = await params;
  if (!validDate(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  const [record] = await db.select().from(daily_reviews).where(eq(daily_reviews.date, date)).limit(1);
  return NextResponse.json({ record: record ? { ...record, error_tags: JSON.parse(record.error_tags) } : null });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try { await verifyRequest(req); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const { date } = await params;
  if (!validDate(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  const parsed = dailyReviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid daily review' }, { status: 400 });
  const data = parsed.data;
  const now = new Date().toISOString();
  const record = {
    date, status: data.status, structure: nullIfBlank(data.structure), scenario_a: nullIfBlank(data.scenario_a), scenario_b: nullIfBlank(data.scenario_b),
    scenario_c: nullIfBlank(data.scenario_c), rule_followed: data.rule_followed, error_tags: JSON.stringify(data.error_tags), lesson: nullIfBlank(data.lesson),
    next_action: nullIfBlank(data.next_action), updated_at: now,
  };
  await db.insert(daily_reviews).values({ ...record, created_at: now }).onConflictDoUpdate({ target: daily_reviews.date, set: record });
  return NextResponse.json({ record: { ...record, created_at: now, error_tags: data.error_tags } });
}
