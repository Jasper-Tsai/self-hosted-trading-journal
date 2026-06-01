import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { strategies } from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';
import { Trade } from '@/types';
import {
  computeStrategyStats,
  applyTradeFilter,
  buildRangeLabel,
  TradeFilter,
} from '@/lib/strategy-performance';
import { selectTradesWithGroupAttrs } from '@/lib/db/trades-read';

function parseFilter(params: URLSearchParams): TradeFilter {
  const filter: TradeFilter = {};

  const from = params.get('from');
  const to   = params.get('to');
  if (from) filter.from = from;
  if (to)   filter.to   = to;

  if (!filter.from && !filter.to) {
    const daysParam = params.get('days');
    if (daysParam && daysParam !== 'all') {
      const d = parseInt(daysParam, 10);
      if (!isNaN(d) && d > 0) filter.days = d;
    } else if (daysParam === 'all') {
      filter.days = 'all';
    }
  }

  const symbols = params.get('symbols');
  if (symbols) filter.symbols = symbols.split(',').map(s => s.trim()).filter(Boolean);

  const sides = params.get('sides');
  if (sides) filter.sides = sides.split(',').map(s => s.trim()).filter(Boolean);

  const brokers = params.get('brokers');
  if (brokers) filter.brokers = brokers.split(',').map(s => s.trim()).filter(Boolean);

  return filter;
}

export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);

    const [allTradesRaw, dbStrategies] = await Promise.all([
      selectTradesWithGroupAttrs(),
      db.select({ name: strategies.name, color: strategies.color, sort_order: strategies.sort_order })
        .from(strategies)
        .where(eq(strategies.enabled, true))
        .orderBy(asc(strategies.sort_order)),
    ]);

    const allTrades = allTradesRaw as unknown as Trade[];
    const allTimeStats = computeStrategyStats(allTrades, dbStrategies);

    const filter = parseFilter(req.nextUrl.searchParams);
    const rangeLabel = buildRangeLabel(filter);

    let rangeStats = allTimeStats;
    const hasFilter = filter.from || filter.to || (filter.days && filter.days !== 'all') ||
      filter.symbols?.length || filter.sides?.length || filter.brokers?.length;

    if (hasFilter) {
      const rangeTrades = applyTradeFilter(allTrades, filter);
      rangeStats = computeStrategyStats(rangeTrades, dbStrategies);
    }

    return NextResponse.json({ allTimeStats, rangeStats, rangeLabel });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}
