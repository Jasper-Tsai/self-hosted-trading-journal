import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { getPointValue, getTaipeiTimeParts } from '@/lib/utils';
import { formatChicagoDate } from '@/lib/trade-utils';
import { getViewerStartDate } from '@/lib/user-filters';
import { listTradeGroups } from '@/lib/actions/trade-groups';
import { classifyByPointsPerContract, computeWinRate } from '@/lib/win-rate';



export async function GET(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10);
    const isViewerMode = role === 'viewer';

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    const queryStartDate = isViewerMode ? getViewerStartDate() : formatChicagoDate(startDate);

    const groups = await listTradeGroups({
      fromDate: queryStartDate,
      toDate: formatChicagoDate(endDate),
    });

    const hourlyStats = new Array(24).fill(null).map(() => ({
      count: 0, totalPnL: 0, totalAmount: 0, wins: 0, losses: 0,
    }));

    groups
      .filter(g => g.exit_price_avg != null && g.total_exit_qty != null && g.total_exit_qty > 0)
      .forEach(g => {
        const direction = g.side === 'LONG' ? 1 : -1;
        const exitQty = g.total_exit_qty!;
        const pnl = direction * (g.exit_price_avg! - g.entry_price_avg) * exitQty;
        const pointValue = getPointValue(g.symbol as Parameters<typeof getPointValue>[0]);
        const closedRatio = g.total_qty > 0 ? exitQty / g.total_qty : 1;
        const proratedFee = (g.fee_total ?? 0) * closedRatio;
        const amount = pnl * pointValue - proratedFee;
        const timeParts = getTaipeiTimeParts(g.entry_time_first);
        const hour = timeParts ? timeParts.hour : new Date(g.entry_time_first).getHours();
        const s = hourlyStats[hour];
        s.count++;
        s.totalPnL += pnl;
        s.totalAmount += amount;
        const outcome = classifyByPointsPerContract(pnl, exitQty);
        if (outcome === 'win') s.wins++;
        else if (outcome === 'loss') s.losses++;
      });

    const timePatterns = hourlyStats
      .map((s, hour) => ({
        hour,
        count: s.count,
        totalPnL: Math.round(s.totalPnL * 100) / 100,
        totalAmount: Math.round(s.totalAmount * 100) / 100,
        wins: s.wins,
        losses: s.losses,
        winRate: Math.round(computeWinRate(s.wins, s.losses)),
        avgPnL: s.count > 0 ? Math.round((s.totalPnL / s.count) * 100) / 100 : 0,
      }))
      .filter(s => s.count > 0);

    return NextResponse.json({ timePatterns });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}
