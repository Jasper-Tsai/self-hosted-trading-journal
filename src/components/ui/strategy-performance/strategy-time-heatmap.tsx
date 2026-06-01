'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StrategyPerformanceRow, StrategyDrilldownResponse } from '@/types/strategy-performance';

interface StrategyTimeHeatmapProps {
  rows: StrategyPerformanceRow[];
  enabledStrategies: string;
  drilldownCache: Map<string, StrategyDrilldownResponse>;
  fetchDrilldowns: (names: string[]) => Promise<void>;
}

type MetricType = 'winRate' | 'avgPnl' | 'count';

const METRIC_OPTIONS: { value: MetricType; label: string }[] = [
  { value: 'winRate', label: '勝率' },
  { value: 'avgPnl', label: '均損益' },
  { value: 'count', label: '筆數' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i); // CT 0-23

function getChicagoHour(entryTime: string): number {
  try {
    const d = new Date(entryTime);
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      hour12: false,
    }).format(d);
    const h = parseInt(formatted, 10);
    return isNaN(h) ? -1 : h % 24;
  } catch {
    return -1;
  }
}

function winRateColor(wr: number): string {
  // 0% → hsl(0,70%,40%) red, 50% → hsl(45,70%,50%) yellow, 100% → hsl(120,60%,40%) green
  if (wr <= 50) {
    const hue = (wr / 50) * 45;
    return `hsl(${hue.toFixed(0)}, 70%, 40%)`;
  } else {
    const hue = 45 + ((wr - 50) / 50) * 75;
    return `hsl(${hue.toFixed(0)}, 65%, 42%)`;
  }
}

function pnlColor(val: number, maxAbs: number): string {
  if (maxAbs < 1e-6) return 'rgba(255,255,255,0.05)';
  const ratio = Math.min(Math.abs(val) / maxAbs, 1);
  if (val >= 0) return `rgba(34,197,94,${(ratio * 0.7 + 0.1).toFixed(2)})`;
  return `rgba(239,68,68,${(ratio * 0.7 + 0.1).toFixed(2)})`;
}

function countColor(count: number, maxCount: number): string {
  if (maxCount === 0) return 'rgba(255,255,255,0.05)';
  const opacity = (count / maxCount) * 0.75;
  return `rgba(94,106,210,${opacity.toFixed(2)})`;
}

export function StrategyTimeHeatmap({
  rows,
  enabledStrategies,
  drilldownCache,
  fetchDrilldowns,
}: StrategyTimeHeatmapProps) {
  const enabledSet = enabledStrategies
    ? new Set(enabledStrategies.split(',').filter(Boolean))
    : null;
  const visibleRows = enabledSet ? rows.filter(r => enabledSet.has(r.strategy)) : rows;

  useEffect(() => {
    const names = visibleRows.map(r => r.strategy);
    if (names.length > 0) fetchDrilldowns(names);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows.map(r => r.strategy).join(',')]);

  const [metric, setMetric] = useState<MetricType>('winRate');
  const [tooltip, setTooltip] = useState<{ row: string; hour: number; content: string } | null>(null);

  // Build heatmap data: strategy → hour → { wins, total, sumPnl }
  const heatData = useMemo(() => {
    const map = new Map<string, Map<number, { wins: number; total: number; sumPnl: number }>>();

    for (const row of visibleRows) {
      const dd = drilldownCache.get(row.strategy);
      if (!dd) continue;

      const hourMap = new Map<number, { wins: number; total: number; sumPnl: number }>();
      for (let h = 0; h < 24; h++) hourMap.set(h, { wins: 0, total: 0, sumPnl: 0 });

      for (const g of dd.groups) {
        if (g.pnl_usd === null) continue;
        const hour = getChicagoHour(g.entry_time);
        if (hour < 0) continue;
        const cell = hourMap.get(hour)!;
        cell.total++;
        cell.sumPnl += g.pnl_usd;
        if (g.pnl_usd > 0) cell.wins++;
      }

      map.set(row.strategy, hourMap);
    }
    return map;
  }, [visibleRows, drilldownCache]);

  // Compute scale for pnl/count
  let maxAbsPnl = 0;
  let maxCount = 0;
  for (const hourMap of heatData.values()) {
    for (const cell of hourMap.values()) {
      const avg = cell.total > 0 ? Math.abs(cell.sumPnl / cell.total) : 0;
      if (avg > maxAbsPnl) maxAbsPnl = avg;
      if (cell.total > maxCount) maxCount = cell.total;
    }
  }

  const loading = visibleRows.some(r => !drilldownCache.has(r.strategy));

  function getCellColor(strategy: string, hour: number): string {
    const hourMap = heatData.get(strategy);
    if (!hourMap) return 'rgba(255,255,255,0.04)';
    const cell = hourMap.get(hour);
    if (!cell || cell.total === 0) return 'rgba(255,255,255,0.04)';

    if (metric === 'winRate') return winRateColor((cell.wins / cell.total) * 100);
    if (metric === 'avgPnl') return pnlColor(cell.sumPnl / cell.total, maxAbsPnl);
    return countColor(cell.total, maxCount);
  }

  function getCellLabel(strategy: string, hour: number): string {
    const hourMap = heatData.get(strategy);
    if (!hourMap) return '—';
    const cell = hourMap.get(hour);
    if (!cell || cell.total === 0) return '—';
    if (metric === 'winRate') return `${((cell.wins / cell.total) * 100).toFixed(0)}%`;
    if (metric === 'avgPnl') return `${(cell.sumPnl / cell.total).toFixed(0)}`;
    return String(cell.total);
  }

  function getTooltipContent(strategy: string, hour: number): string {
    const hourMap = heatData.get(strategy);
    if (!hourMap) return '';
    const cell = hourMap.get(hour);
    if (!cell || cell.total === 0) return `CT${hour}:00 — 無資料`;
    const wr = ((cell.wins / cell.total) * 100).toFixed(1);
    const avg = (cell.sumPnl / cell.total).toFixed(2);
    return `CT ${hour}:00 | ${strategy} | ${cell.total}筆 | 勝率${wr}% | 均損益$${avg}`;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle>時段 Heatmap（CT 時區）</CardTitle>
            <CardDescription>策略 × 小時的績效分布</CardDescription>
          </div>
          <div className="flex gap-1">
            {METRIC_OPTIONS.map(opt => (
              <Button
                key={opt.value}
                variant={metric === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMetric(opt.value)}
                className="h-7 px-2.5 text-xs"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="h-40 flex items-center justify-center">
            <div className="text-[#8A8F98] text-sm">載入中...</div>
          </div>
        )}
        {!loading && visibleRows.length === 0 && (
          <div className="h-40 flex items-center justify-center">
            <div className="text-[#8A8F98] text-sm">暫無資料</div>
          </div>
        )}
        {!loading && visibleRows.length > 0 && (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 700 }}>
              {/* Hour headers */}
              <div className="flex mb-1">
                <div className="w-24 shrink-0" />
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="flex-1 text-center text-[9px] text-[#8A8F98]"
                    style={{ minWidth: 24 }}
                  >
                    {h}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {visibleRows.map(row => {
                const hasData = heatData.has(row.strategy);
                return (
                  <div key={row.strategy} className="flex items-center mb-1">
                    {/* Strategy label */}
                    <div className="w-24 shrink-0 pr-2">
                      <span
                        className="text-xs font-medium truncate block"
                        style={{ color: row.color }}
                      >
                        {row.strategy}
                      </span>
                    </div>
                    {/* Cells */}
                    {HOURS.map(h => {
                      const hourMap = heatData.get(row.strategy);
                      const cell = hourMap?.get(h);
                      const isEmpty = !hasData || !cell || cell.total === 0;
                      const label = getCellLabel(row.strategy, h);
                      const bgColor = getCellColor(row.strategy, h);

                      return (
                        <div
                          key={h}
                          className="flex-1 h-7 flex items-center justify-center text-[9px] font-medium rounded-sm mx-px cursor-default transition-opacity hover:opacity-80"
                          style={{
                            minWidth: 24,
                            backgroundColor: bgColor,
                            color: isEmpty ? '#444' : '#fff',
                          }}
                          onMouseEnter={() => setTooltip({
                            row: row.strategy,
                            hour: h,
                            content: getTooltipContent(row.strategy, h),
                          })}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          {isEmpty ? '—' : label}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div className="mt-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-xs text-[#8A8F98]">
            {tooltip.content}
          </div>
        )}

        {/* Legend */}
        {!loading && visibleRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-[#8A8F98]">
            {metric === 'winRate' && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: 'hsl(0,70%,40%)' }} /> 低勝率
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: 'hsl(45,70%,50%)' }} /> 50%
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: 'hsl(120,65%,42%)' }} /> 高勝率
                </div>
              </>
            )}
            {metric === 'avgPnl' && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block bg-red-500/60" /> 均虧損
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block bg-green-500/60" /> 均獲利
                </div>
              </>
            )}
            {metric === 'count' && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: 'rgba(94,106,210,0.6)' }} /> 交易筆數（深 = 多）
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
