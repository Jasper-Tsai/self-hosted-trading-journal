'use client';

import React, { useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StrategyPerformanceRow, StrategyDrilldownResponse } from '@/types/strategy-performance';
import { PnLUnit } from '@/lib/hooks/useStrategyPerformance';
import { cn } from '@/lib/utils';

interface StrategyPnLDistributionProps {
  rows: StrategyPerformanceRow[];
  enabledStrategies: string;
  drilldownCache: Map<string, StrategyDrilldownResponse>;
  fetchDrilldowns: (names: string[]) => Promise<void>;
  unit: PnLUnit;
  usdTwd: number;
}

const BINS = 20;

interface Bin {
  min: number;
  max: number;
  count: number;
  isWin: boolean;
}

function buildHistogram(values: number[]): { bins: Bin[]; mean: number; median: number } {
  if (values.length === 0) return { bins: [], mean: 0, median: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const minV = sorted[0];
  const maxV = sorted[sorted.length - 1];
  const range = maxV - minV || 1;
  const step = range / BINS;

  const bins: Bin[] = Array.from({ length: BINS }, (_, i) => ({
    min: minV + i * step,
    max: minV + (i + 1) * step,
    count: 0,
    isWin: minV + i * step + step / 2 >= 0,
  }));

  for (const v of values) {
    const idx = Math.min(Math.floor((v - minV) / step), BINS - 1);
    bins[idx].count++;
  }

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  return { bins, mean, median };
}

interface MiniBarChartProps {
  row: StrategyPerformanceRow;
  dd: StrategyDrilldownResponse;
  unit: PnLUnit;
  usdTwd: number;
}

function MiniBarChart({ row, dd, unit, usdTwd }: MiniBarChartProps) {
  const values = useMemo(() => {
    return dd.groups
      .filter(g => g.pnl_usd !== null && g.pnl_points !== null)
      .map(g => {
        if (unit === 'points') return g.pnl_points!;
        if (unit === 'twd') return g.pnl_usd! * usdTwd;
        return g.pnl_usd!;
      });
  }, [dd, unit, usdTwd]);

  const { bins, mean, median } = buildHistogram(values);
  const maxCount = Math.max(...bins.map(b => b.count), 1);

  // Convert value to % position in histogram (0-100%)
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 1;
  const range = maxV - minV || 1;

  function valueToX(v: number): string {
    return `${Math.max(0, Math.min(100, ((v - minV) / range) * 100)).toFixed(1)}%`;
  }

  const unitLabel = unit === 'points' ? '點' : unit === 'twd' ? 'TWD' : 'USD';

  return (
    <Card className="p-0">
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: row.color }}
            />
            <CardTitle className="text-sm font-medium" style={{ color: row.color }}>
              {row.strategy}
            </CardTitle>
          </div>
          <span className="text-xs text-[#8A8F98]">{values.length} 筆</span>
        </div>
        <CardDescription className="text-xs mt-0.5">
          {unitLabel} 均 {unit === 'points' ? mean.toFixed(1) : `$${mean.toFixed(2)}`} ／ 中 {unit === 'points' ? median.toFixed(1) : `$${median.toFixed(2)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {values.length === 0 ? (
          <div className="h-[120px] flex items-center justify-center text-xs text-[#8A8F98]">暫無資料</div>
        ) : (
          <div className="relative" style={{ height: 120 }}>
            {/* Bar chart */}
            <div className="flex items-end gap-px h-full pb-4">
              {bins.map((bin, i) => {
                const barH = (bin.count / maxCount) * (120 - 16);
                return (
                  <div
                    key={i}
                    className={cn(
                      'flex-1 rounded-t-sm transition-opacity hover:opacity-80',
                      bin.isWin ? 'bg-green-500/60' : 'bg-red-500/60'
                    )}
                    style={{ height: barH, minHeight: bin.count > 0 ? 2 : 0 }}
                    title={`${bin.min.toFixed(1)} ~ ${bin.max.toFixed(1)}: ${bin.count}筆`}
                  />
                );
              })}
            </div>

            {/* Mean line */}
            <div
              className="absolute top-0 bottom-4 w-px"
              style={{
                left: valueToX(mean),
                backgroundColor: row.color,
                opacity: 0.8,
              }}
            />
            {/* Median line */}
            <div
              className="absolute top-0 bottom-4 w-px"
              style={{
                left: valueToX(median),
                backgroundColor: 'rgba(255,255,255,0.4)',
              }}
            />

            {/* Zero line */}
            {minV < 0 && maxV > 0 && (
              <div
                className="absolute top-0 bottom-4 w-px bg-white/20"
                style={{ left: valueToX(0) }}
              />
            )}

            {/* X axis labels */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[9px] text-[#8A8F98]">
              <span>{unit === 'points' ? minV.toFixed(0) : `$${minV.toFixed(0)}`}</span>
              <span>{unit === 'points' ? maxV.toFixed(0) : `$${maxV.toFixed(0)}`}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function StrategyPnLDistribution({
  rows,
  enabledStrategies,
  drilldownCache,
  fetchDrilldowns,
  unit,
  usdTwd,
}: StrategyPnLDistributionProps) {
  const enabledSet = enabledStrategies
    ? new Set(enabledStrategies.split(',').filter(Boolean))
    : null;
  const visibleRows = enabledSet ? rows.filter(r => enabledSet.has(r.strategy)) : rows;

  useEffect(() => {
    const names = visibleRows.map(r => r.strategy);
    if (names.length > 0) fetchDrilldowns(names);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows.map(r => r.strategy).join(',')]);

  const loading = visibleRows.some(r => !drilldownCache.has(r.strategy));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold text-[#EDEDEF]">損益分布</h3>
        <span className="text-xs text-[#8A8F98]">（各策略獨立分布，直線=均值，白線=中位數）</span>
      </div>

      {loading && (
        <div className="h-32 flex items-center justify-center">
          <div className="text-[#8A8F98] text-sm">載入中...</div>
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {visibleRows.map(row => {
            const dd = drilldownCache.get(row.strategy);
            if (!dd) return null;
            return (
              <MiniBarChart
                key={row.strategy}
                row={row}
                dd={dd}
                unit={unit}
                usdTwd={usdTwd}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
