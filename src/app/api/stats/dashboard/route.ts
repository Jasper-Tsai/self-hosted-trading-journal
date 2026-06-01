import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { trades } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPointValue, parseTaipeiDateTime } from '@/lib/utils';
import { getActualFee } from '@/lib/trade-utils';
import { Trade } from '@/types';
import { selectTradesWithGroupAttrs } from '@/lib/db/trades-read';

export async function GET(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    const date = req.nextUrl.searchParams.get('date');
    if (!date) return NextResponse.json({ error: '缺少 date 參數' }, { status: 400 });

    const isViewerMode = role === 'viewer';
    let dayTrades = await selectTradesWithGroupAttrs()
      .where(eq(trades.date, date));

    if (isViewerMode) {
      // SPEC §4.1：t.strategy 已解析為群組策略，viewer 過濾以「該筆所屬群組是否有策略」為單位
      dayTrades = dayTrades.filter(t => t.strategy != null && t.strategy !== '');
    }

    const asTrades = dayTrades as unknown as Trade[];

    const totalPnL = asTrades.reduce((sum, t) => {
      if (t.exit_price && t.entry_price) {
        const pnl = t.side === 'LONG'
          ? (t.exit_price - t.entry_price) * t.qty
          : (t.entry_price - t.exit_price) * t.qty;
        return sum + pnl;
      }
      return sum;
    }, 0);

    const totalPnLAmount = asTrades.reduce((sum, t) => {
      if (!t.exit_price) return sum;
      const pnl = t.side === 'LONG'
        ? (t.exit_price - t.entry_price) * t.qty
        : (t.entry_price - t.exit_price) * t.qty;
      const pointValue = getPointValue(t.symbol ?? 'MNQ');
      return sum + (pnl * pointValue) - getActualFee(t);
    }, 0);

    // Group-level trade count: distinct trade_group_id, NULL 各自算 1 筆
    const tradeCount = new Set(asTrades.map(t => t.trade_group_id ?? t.id ?? `${t.date}_${t.entry_time}`)).size;
    const totalQty = asTrades.reduce((sum, t) => sum + t.qty, 0);
    const avgPnL = totalQty > 0 ? totalPnL / totalQty : 0;

    let maxHoldTime = 0;
    asTrades.forEach(t => {
      if (t.exit_time && t.entry_time) {
        const entryDate = parseTaipeiDateTime(t.entry_time) ?? new Date(t.entry_time);
        const exitDate = parseTaipeiDateTime(t.exit_time) ?? new Date(t.exit_time);
        const holdTime = exitDate.getTime() - entryDate.getTime();
        if (holdTime > maxHoldTime) maxHoldTime = holdTime;
      }
    });

    return NextResponse.json({
      totalPnL: Math.round(totalPnL * 100) / 100,
      totalPnLAmount: Math.round(totalPnLAmount * 100) / 100,
      tradeCount,
      avgPnL: Math.round(avgPnL * 100) / 100,
      maxHoldTime: Math.floor(maxHoldTime / (1000 * 60)),
      trades: dayTrades,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}
