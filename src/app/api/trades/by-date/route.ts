import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { trades } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { selectTradesWithGroupAttrs } from '@/lib/db/trades-read';

export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);
    const date = req.nextUrl.searchParams.get('date');
    if (!date) return NextResponse.json({ error: 'Lack date parameter' }, { status: 400 });

    const result = await selectTradesWithGroupAttrs()
      .where(eq(trades.date, date))
      .orderBy(asc(trades.entry_time));

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}
