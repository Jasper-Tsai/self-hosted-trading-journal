import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { market_events } from '@/lib/db/schema';
import { and, gte, lte, or, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// GET /api/market-events?start=2026-03-01&end=2026-03-31
// Get valid market events within a specified date range
export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);

    const start = req.nextUrl.searchParams.get('start');
    const end = req.nextUrl.searchParams.get('end');

    if (!start || !end) {
      return NextResponse.json({ error: 'Lack start/end parameter' }, { status: 400 });
    }

    // event is in scope: start_date <= end AND (end_date >= start OR end_date IS NULL)
    const events = await db
      .select()
      .from(market_events)
      .where(
        and(
          lte(market_events.start_date, end),
          or(
            gte(market_events.end_date, start),
            isNull(market_events.end_date),
          ),
        ),
      );

    return NextResponse.json(events);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}

// POST /api/market-events — only owner Can be added
export async function POST(req: NextRequest) {
  try {
    const { role, email } = await verifyRequest(req);
    if (role !== 'owner') return NextResponse.json({ error: 'No permission' }, { status: 403 });

    const data = await req.json();
    const now = new Date().toISOString();
    const id = randomUUID();

    await db.insert(market_events).values({
      id,
      title: data.title,
      description: data.description ?? null,
      start_date: data.start_date,
      end_date: data.end_date ?? null,
      severity: data.severity ?? 'warning',
      created_by: email,
      created_at: now,
      updated_at: now,
    });

    return NextResponse.json({ success: true, id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
