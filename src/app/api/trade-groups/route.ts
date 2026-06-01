import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { listTradeGroups } from '@/lib/actions/trade-groups';

export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const groups = await listTradeGroups({
    fromDate: searchParams.get('from') ?? undefined,
    toDate: searchParams.get('to') ?? undefined,
    symbol: searchParams.get('symbol') ?? undefined,
    strategy: searchParams.get('strategy') ?? undefined,
  });
  return NextResponse.json({ groups });
}
