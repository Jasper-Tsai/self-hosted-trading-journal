import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { strategies } from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';
import { selectTradesWithGroupAttrs } from '@/lib/db/trades-read';
import { Trade } from '@/types';
import { StrategyDrilldownResponse } from '@/types/strategy-performance';
import {
  computeStrategyStats,
  applyTradeFilter,
  buildTradeGroups,
  buildMonthlyAgg,
  TradeFilter,
} from '@/lib/strategy-performance';

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    await verifyRequest(req);

    const { name: rawName } = await params;
    const strategyName = decodeURIComponent(rawName);
    // '' or '__none__' → treat as '無' (no strategy)
    const resolvedName = (strategyName === '' || strategyName === '__none__') ? '無' : strategyName;
    // null used internally to mean "no strategy label"
    const filterStrategy = resolvedName === '無' ? null : resolvedName;

    const [allTradesRaw, dbStrategies] = await Promise.all([
      selectTradesWithGroupAttrs(),
      db.select({ name: strategies.name, color: strategies.color, sort_order: strategies.sort_order })
        .from(strategies)
        .where(eq(strategies.enabled, true))
        .orderBy(asc(strategies.sort_order)),
    ]);

    const allTrades = allTradesRaw as unknown as Trade[];

    // summary uses full dataset (no range filter) for the named strategy
    const allTimeStats = computeStrategyStats(allTrades, dbStrategies);
    const summaryRow = allTimeStats.find(r => r.strategy === resolvedName);

    if (!summaryRow) {
      return NextResponse.json({ error: `策略不存在：${resolvedName}` }, { status: 404 });
    }

    // Apply optional filter for groups/monthly views
    const filter = parseFilter(req.nextUrl.searchParams);
    const hasFilter = filter.from || filter.to || (filter.days && filter.days !== 'all') ||
      filter.symbols?.length || filter.sides?.length || filter.brokers?.length;

    const filteredTrades = hasFilter ? applyTradeFilter(allTrades, filter) : allTrades;

    const groups  = buildTradeGroups(filteredTrades, filterStrategy === null ? '無' : filterStrategy);
    const monthly = buildMonthlyAgg(filteredTrades, filterStrategy === null ? '無' : filterStrategy);

    const colorMap = new Map(dbStrategies.map(s => [s.name, s.color]));
    const color = colorMap.get(resolvedName) ?? '#8A8F98';

    const response: StrategyDrilldownResponse = {
      strategy: resolvedName,
      color,
      summary: summaryRow,
      groups,
      monthly,
    };

    return NextResponse.json(response);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}
