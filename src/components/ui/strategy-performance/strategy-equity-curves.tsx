'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StrategyPerformanceRow, StrategyDrilldownResponse } from '@/types/strategy-performance';
import { PnLUnit } from '@/lib/hooks/useStrategyPerformance';
import { cn } from '@/lib/utils';

interface StrategyEquityCurvesProps {
  rows: StrategyPerformanceRow[];
  enabledStrategies: string;
  drilldownCache: Map<string, StrategyDrilldownResponse>;
  fetchDrilldowns: (names: string[]) => Promise<void>;
  unit: PnLUnit;
  usdTwd: number;
}

interface CurvePoint {
  date: string;
  value: number;
}

function buildCumulative(
  data: StrategyDrilldownResponse,
  unit: PnLUnit,
  usdTwd: number
): CurvePoint[] {
  const groups = [...data.groups]
    .filter(g => g.pnl_usd !== null)
    .sort((a, b) => a.entry_time.localeCompare(b.entry_time));

  let cum = 0;
  return groups.map(g => {
    const val = unit === 'points'
      ? (g.pnl_points ?? 0)
      : unit === 'twd'
        ? (g.pnl_usd ?? 0) * usdTwd
        : (g.pnl_usd ?? 0);
    cum += val;
    return { date: g.date, value: cum };
  });
}

export function StrategyEquityCurves({
  rows,
  enabledStrategies,
  drilldownCache,
  fetchDrilldowns,
  unit,
  usdTwd,
}: StrategyEquityCurvesProps) {
  const enabledSet = enabledStrategies
    ? new Set(enabledStrategies.split(',').filter(Boolean))
    : null;
  const visibleRows = enabledSet ? rows.filter(r => enabledSet.has(r.strategy)) : rows;

  useEffect(() => {
    const names = visibleRows.map(r => r.strategy);
    if (names.length > 0) fetchDrilldowns(names);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows.map(r => r.strategy).join(',')]);

  // Hidden series state
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const curves = useMemo(() => {
    return visibleRows
      .map(row => {
        const dd = drilldownCache.get(row.strategy);
        if (!dd) return null;
        return {
          strategy: row.strategy,
          color: row.color,
          points: buildCumulative(dd, unit, usdTwd),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null && c.points.length > 0);
  }, [visibleRows, drilldownCache, unit, usdTwd]);

  // Determine chart bounds
  const allValues = curves.flatMap(c => c.points.map(p => p.value));
  const allDates = Array.from(new Set(curves.flatMap(c => c.points.map(p => p.date)))).sort();

  const minVal = allValues.length ? Math.min(0, ...allValues) : 0;
  const maxVal = allValues.length ? Math.max(0, ...allValues) : 100;
  const range = maxVal - minVal || 1;

  const HEIGHT = 360;
  const PADDING_TOP = 20;
  const PADDING_BOTTOM = 30;
  const plotH = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  function toY(v: number): number {
    return PADDING_TOP + plotH - ((v - minVal) / range) * plotH;
  }

  function toX(idx: number, total: number): number {
    if (total <= 1) return 50;
    return (idx / (total - 1)) * 100;
  }

  // Build SVG path for each curve
  function buildPath(points: CurvePoint[]): string {
    if (points.length === 0) return '';
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
    const total = sorted.length;
    return sorted.map((p, i) => {
      const x = toX(i, total);
      const y = toY(p.value);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
  }

  const hasData = curves.length > 0;
  const loading = visibleRows.some(r => !drilldownCache.has(r.strategy));

  const unitLabel = unit === 'points' ? 'point' : unit === 'twd' ? 'TWD' : 'USD';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategy equity curves</CardTitle>
        <CardDescription>Cumulative profit and loss trend of each strategy ({unitLabel})</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="h-[360px] flex items-center justify-center">
            <div className="text-[#8A8F98] text-sm">loading...</div>
          </div>
        )}
        {!loading && !hasData && (
          <div className="h-[360px] flex items-center justify-center">
            <div className="text-[#8A8F98] text-sm">No information yet</div>
          </div>
        )}
        {!loading && hasData && (
          <>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-4">
              {curves.map(c => (
                <button
                  key={c.strategy}
                  onClick={() => setHidden(prev => {
                    const next = new Set(prev);
                    if (next.has(c.strategy)) next.delete(c.strategy);
                    else next.add(c.strategy);
                    return next;
                  })}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-all duration-200',
                    hidden.has(c.strategy) ? 'opacity-40' : 'opacity-100'
                  )}
                  style={{
                    backgroundColor: `${c.color}18`,
                    borderColor: `${c.color}44`,
                    color: c.color,
                  }}
                >
                  <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: c.color }} />
                  {c.strategy}
                </button>
              ))}
            </div>

            {/* SVG Chart */}
            <div className="relative w-full overflow-hidden" style={{ height: HEIGHT }}>
              <svg
                viewBox={`0 0 100 ${HEIGHT}`}
                preserveAspectRatio="none"
                className="w-full h-full"
              >
                {/* Zero line */}
                <line
                  x1="0" y1={toY(0).toFixed(2)}
                  x2="100" y2={toY(0).toFixed(2)}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="0.3"
                  strokeDasharray="1,1"
                  vectorEffect="non-scaling-stroke"
                />
                {/* Gridlines */}
                {[0.25, 0.5, 0.75].map(f => {
                  const v = minVal + range * f;
                  return (
                    <line
                      key={f}
                      x1="0" y1={toY(v).toFixed(2)}
                      x2="100" y2={toY(v).toFixed(2)}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth="0.3"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}

                {/* Curves */}
                {curves.map(c => {
                  if (hidden.has(c.strategy)) return null;
                  const d = buildPath(c.points);
                  return (
                    <path
                      key={c.strategy}
                      d={d}
                      fill="none"
                      stroke={c.color}
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  );
                })}
              </svg>

              {/* Y axis labels */}
              <div className="absolute right-1 top-0 h-full flex flex-col justify-between pointer-events-none" style={{ paddingTop: PADDING_TOP, paddingBottom: PADDING_BOTTOM }}>
                {[maxVal, (maxVal + minVal) / 2, minVal].map((v, i) => (
                  <span key={i} className="text-[10px] text-[#8A8F98] leading-none">
                    {unit === 'points' ? v.toFixed(0) :
                     unit === 'twd' ? `${(v / 1000).toFixed(0)}k` :
                     `$${v.toFixed(0)}`}
                  </span>
                ))}
              </div>

              {/* X axis dates */}
              {allDates.length > 1 && (
                <div className="absolute bottom-0 left-0 right-0 flex justify-between pointer-events-none px-2">
                  <span className="text-[10px] text-[#8A8F98]">{allDates[0]}</span>
                  <span className="text-[10px] text-[#8A8F98]">{allDates[allDates.length - 1]}</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
