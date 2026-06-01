import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { getPointValue } from '@/lib/utils';
import { formatChicagoDate } from '@/lib/trade-utils';
import { getViewerStartDate } from '@/lib/user-filters';
import { listTradeGroups } from '@/lib/actions/trade-groups';



export async function GET(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10);
    const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '10', 10);
    const isViewerMode = role === 'viewer';

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    const queryStartDate = isViewerMode ? getViewerStartDate() : formatChicagoDate(startDate);

    const groups = await listTradeGroups({
      fromDate: queryStartDate,
      toDate: formatChicagoDate(endDate),
    });

    const groupsWithPnL = groups
      .filter(g => g.exit_price_avg != null && g.total_exit_qty != null && g.total_exit_qty > 0)
      .map(g => {
        const direction = g.side === 'LONG' ? 1 : -1;
        const pnl = direction * (g.exit_price_avg! - g.entry_price_avg) * g.total_exit_qty!;
        const pointValue = getPointValue(g.symbol as Parameters<typeof getPointValue>[0]);
        const closedRatio = g.total_qty > 0 ? g.total_exit_qty! / g.total_qty : 1;
        const proratedFee = (g.fee_total ?? 0) * closedRatio;
        const amount = pnl * pointValue - proratedFee;
        return { ...g, pnl: Math.round(pnl * 100) / 100, amount: Math.round(amount * 100) / 100 };
      });

    const sorted = [...groupsWithPnL].sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      bestTrades: sorted.slice(0, limit),
      worstTrades: sorted.slice(-limit).reverse(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}
