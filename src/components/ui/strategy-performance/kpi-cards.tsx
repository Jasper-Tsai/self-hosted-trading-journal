'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { StrategyPerformanceRow } from '@/types/strategy-performance';
import { PnLUnit } from '@/lib/hooks/useStrategyPerformance';
import { cn } from '@/lib/utils';

interface KpiCardsProps {
  rows: StrategyPerformanceRow[];
  enabledStrategies: string; // CSV — empty = all
  unit: PnLUnit;
  usdTwd: number;
}

function Tooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center ml-1">
      <svg className="w-3.5 h-3.5 text-[#8A8F98] cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 w-52 rounded-lg border border-white/[0.08] bg-[#0D0D10] p-2.5 text-xs text-[#8A8F98] shadow-xl whitespace-normal">
        {text}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  valueClass,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  tooltip: string;
}) {
  return (
    <Card className="p-4">
      <CardContent className="p-0">
        <div className="flex items-center gap-0.5 mb-2">
          <span className="text-xs text-[#8A8F98] font-medium">{label}</span>
          <Tooltip text={tooltip} />
        </div>
        <div className={cn('text-2xl font-semibold tabular-nums', valueClass ?? 'text-[#EDEDEF]')}>
          {value}
        </div>
        {sub && <div className="text-xs text-[#8A8F98] mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function formatPnL(v: number, unit: PnLUnit, usdTwd: number): string {
  if (unit === 'points') return `${v >= 0 ? '+' : ''}${v.toFixed(2)} point`;
  if (unit === 'twd') {
    const twd = Math.round(v * usdTwd);
    return `${twd >= 0 ? '+' : ''}NT$${Math.abs(twd).toLocaleString()}`;
  }
  return `${v >= 0 ? '+' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function KpiCards({ rows, enabledStrategies, unit, usdTwd }: KpiCardsProps) {
  const enabledSet = enabledStrategies
    ? new Set(enabledStrategies.split(',').filter(Boolean))
    : null;

  const filtered = enabledSet
    ? rows.filter(r => enabledSet.has(r.strategy))
    : rows;

  // Aggregate
  let totalPnLPoints = 0;
  let totalPnLUsd = 0;
  let trades = 0;
  let wins = 0;
  let totalSumWinUsd = 0;
  let totalSumLossUsd = 0;
  let totalExpectancyUsdWeighted = 0;
  let rrSum = 0;
  let rrSampleCount = 0;
  let rrTotal = 0;
  let maxDD = 0;

  for (const r of filtered) {
    totalPnLPoints += r.totalPnLPoints;
    totalPnLUsd += r.totalPnLUsd;
    trades += r.trades;
    wins += r.wins;
    totalSumWinUsd += r.avgWinUsd * r.wins;
    totalSumLossUsd += r.avgLossUsd * r.losses;
    if (r.trades > 0) totalExpectancyUsdWeighted += r.expectancyUsd * r.trades;
    if (r.avgRR !== null) {
      rrSum += r.avgRR * r.rrSampleCount;
      rrSampleCount += r.rrSampleCount;
    }
    rrTotal += r.rrTotal;
    if (r.maxDrawdownUsd > maxDD) maxDD = r.maxDrawdownUsd;
  }

  const winRate = trades > 0 ? (wins / trades) * 100 : 0;
  const profitFactor = totalSumLossUsd < 0
    ? totalSumWinUsd / Math.abs(totalSumLossUsd)
    : null;
  const lossSampleCount = filtered.reduce((s, r) => s + r.losses, 0);
  const expectancyUsd = trades > 0 ? totalExpectancyUsdWeighted / trades : 0;
  const avgRR = rrSampleCount > 0 ? rrSum / rrSampleCount : null;

  const pnlValue = unit === 'points' ? totalPnLPoints : totalPnLUsd;
  const pnlDisplay = formatPnL(
    unit === 'points' ? totalPnLPoints : totalPnLUsd,
    unit,
    usdTwd
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      <KpiCard
        label="Total profit and loss"
        value={pnlDisplay}
        valueClass={cn('text-2xl font-semibold tabular-nums', pnlValue >= 0 ? 'text-green-400' : 'text-red-400')}
        tooltip="All filtered strategies, Position closed group Total net profit and loss (Including fee)"
      />
      <KpiCard
        label="Trades"
        value={String(trades)}
        tooltip="Closed positions for filtered strategies trade group quantity"
      />
      <KpiCard
        label="winning rate"
        value={`${winRate.toFixed(1)}%`}
        valueClass={cn('text-2xl font-semibold tabular-nums',
          winRate >= 60 ? 'text-green-400' :
          winRate >= 50 ? 'text-yellow-400' :
          'text-red-400'
        )}
        tooltip="profit group number ÷ total group number"
      />
      <KpiCard
        label="Profit Factor"
        value={profitFactor === null ? 'N/A' : profitFactor.toFixed(2)}
        sub={profitFactor === null ? `${lossSampleCount} Loss sample` : undefined}
        valueClass={cn('text-2xl font-semibold tabular-nums',
          profitFactor === null ? 'text-[#8A8F98]' :
          profitFactor >= 2 ? 'text-green-400' :
          profitFactor >= 1 ? 'text-yellow-400' :
          'text-red-400'
        )}
        tooltip="Total profit divided by total loss (absolute value). Shows N/A when there are no loss samples."
      />
      <KpiCard
        label="expected value/trades"
        value={`$${expectancyUsd >= 0 ? '+' : ''}${expectancyUsd.toFixed(2)}`}
        valueClass={cn('text-2xl font-semibold tabular-nums', expectancyUsd >= 0 ? 'text-green-400' : 'text-red-400')}
        tooltip="Average net P&L per trade group (USD)"
      />
      <KpiCard
        label="average R:R"
        value={avgRR === null ? 'N/A' : avgRR.toFixed(2)}
        sub={`${rrSampleCount}/${rrTotal} one`}
        valueClass={cn('text-2xl font-semibold tabular-nums',
          avgRR === null ? 'text-[#8A8F98]' :
          avgRR >= 2 ? 'text-green-400' :
          avgRR >= 1 ? 'text-yellow-400' :
          'text-red-400'
        )}
        tooltip="Average R:R for groups with a stop loss; sample coverage is SL groups divided by total groups."
      />
      <KpiCard
        label="Max Drawdown"
        value={`$${maxDD.toFixed(2)}`}
        valueClass="text-2xl font-semibold tabular-nums text-red-400"
        tooltip="Each strategy is calculated independently max drawdown Take the maximum value after (USD)"
      />
    </div>
  );
}
