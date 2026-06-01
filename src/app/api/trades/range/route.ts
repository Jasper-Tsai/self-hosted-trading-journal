import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { trades } from '@/lib/db/schema';
import { gte, lte, and, asc } from 'drizzle-orm';
import { selectTradesWithGroupAttrs } from '@/lib/db/trades-read';

export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);
    const start = req.nextUrl.searchParams.get('start');
    const end = req.nextUrl.searchParams.get('end');
    if (!start || !end) return NextResponse.json({ error: '缺少 start/end 參數' }, { status: 400 });

    const result = await selectTradesWithGroupAttrs()
      .where(and(gte(trades.date, start), lte(trades.date, end)))
      .orderBy(asc(trades.entry_time));

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}
