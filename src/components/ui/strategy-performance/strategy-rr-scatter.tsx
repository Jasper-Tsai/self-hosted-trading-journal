'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StrategyPerformanceRow, StrategyDrilldownResponse } from '@/types/strategy-performance';

interface StrategyRRScatterProps {
  rows: StrategyPerformanceRow[];
  enabledStrategies: string;
  drilldownCache: Map<string, StrategyDrilldownResponse>;
  fetchDrilldowns: (names: string[]) => Promise<void>;
}

interface ScatterPoint {
  strategy: string;
  color: string;
  date: string;
  riskPoints: number;
  pnlPoints: number;
  rr: number;
  qty: number;
}

const HEIGHT = 380;
const PAD = { top: 20, right: 20, bottom: 40, left: 50 };

export function StrategyRRScatter({
  rows,
  enabledStrategies,
  drilldownCache,
  fetchDrilldowns,
}: StrategyRRScatterProps) {
  const enabledSet = enabledStrategies
    ? new Set(enabledStrategies.split(',').filter(Boolean))
    : null;
  const visibleRows = enabledSet ? rows.filter(r => enabledSet.has(r.strategy)) : rows;

  useEffect(() => {
    const names = visibleRows.map(r => r.strategy);
    if (names.length > 0) fetchDrilldowns(names);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows.map(r => r.strategy).join(',')]);

  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: ScatterPoint } | null>(null);

  const points = useMemo((): ScatterPoint[] => {
    const result: ScatterPoint[] = [];
    for (const row of visibleRows) {
      const dd = drilldownCache.get(row.strategy);
      if (!dd) continue;
      for (const g of dd.groups) {
        if (g.sl_price == null || g.pnl_points == null) continue;
        const riskPoints = Math.abs(g.entry_price - g.sl_price) * g.qty;
        if (riskPoints < 1e-6) continue;
        result.push({
          strategy: row.strategy,
          color: row.color,
          date: g.date,
          riskPoints,
          pnlPoints: g.pnl_points,
          rr: g.pnl_points / (Math.abs(g.entry_price - g.sl_price) * g.qty / g.qty), // per-unit RR
          qty: g.qty,
        });
      }
    }
    return result;
  }, [visibleRows, drilldownCache]);

  const loading = visibleRows.some(r => !drilldownCache.has(r.strategy));

  const maxRisk = points.length ? Math.max(...points.map(p => p.riskPoints)) * 1.1 : 10;
  const minPnl = points.length ? Math.min(...points.map(p => p.pnlPoints)) : -10;
  const maxPnl = points.length ? Math.max(...points.map(p => p.pnlPoints)) : 10;
  const pnlPad = (maxPnl - minPnl) * 0.1 || 5;
  const yMin = Math.min(minPnl - pnlPad, -maxRisk * 0.5);
  const yMax = Math.max(maxPnl + pnlPad, maxRisk * 3);

  const plotH = HEIGHT - PAD.top - PAD.bottom;

  function toSvgX(risk: number): number {
    return PAD.left + (risk / maxRisk) * (100 - PAD.left / 10 - PAD.right / 10) * (100 / 100);
  }
  function toSvgY(pnl: number): number {
    return PAD.top + (1 - (pnl - yMin) / (yMax - yMin)) * plotH;
  }

  // Reference lines: pnl = N * risk (1R, 2R, 3R)
  function refLinePath(multiplier: number): string {
    const x0 = toSvgX(0);
    const y0 = toSvgY(0);
    const x1 = toSvgX(maxRisk);
    const y1 = toSvgY(maxRisk * multiplier);
    return `M${x0.toFixed(1)},${y0.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)}`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>R:R Scatter plot</CardTitle>
        <CardDescription>risk vs profit and loss (have SL of group)</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="h-[380px] flex items-center justify-center">
            <div className="text-[#8A8F98] text-sm">loading...</div>
          </div>
        )}
        {!loading && points.length === 0 && (
          <div className="h-[380px] flex items-center justify-center">
            <div className="text-[#8A8F98] text-sm">Not included yet SL trade data</div>
          </div>
        )}
        {!loading && points.length > 0 && (
          <div className="relative" style={{ height: HEIGHT }}>
            <svg
              viewBox={`0 0 100 ${HEIGHT}`}
              preserveAspectRatio="none"
              className="w-full h-full"
            >
              {/* Grid */}
              <line x1={toSvgX(0)} y1={PAD.top} x2={toSvgX(0)} y2={PAD.top + plotH}
                stroke="rgba(255,255,255,0.1)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
              <line x1={PAD.left} y1={toSvgY(0)} x2="100" y2={toSvgY(0)}
                stroke="rgba(255,255,255,0.15)" strokeWidth="0.4" strokeDasharray="1,0.5" vectorEffect="non-scaling-stroke" />

              {/* Reference lines */}
              {[1, 2, 3].map(r => (
                <g key={r}>
                  <path
                    d={refLinePath(r)}
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="0.4"
                    strokeDasharray="1.5,1"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* Label */}
                  <text
                    x={toSvgX(maxRisk * 0.85).toFixed(1)}
                    y={(toSvgY(maxRisk * r * 0.85) - 1).toFixed(1)}
                    fontSize="2"
                    fill="rgba(255,255,255,0.3)"
                    textAnchor="middle"
                  >
                    {r}R
                  </text>
                </g>
              ))}

              {/* Scatter points */}
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={toSvgX(p.riskPoints).toFixed(2)}
                  cy={toSvgY(p.pnlPoints).toFixed(2)}
                  r="1.2"
                  fill={p.color}
                  fillOpacity="0.75"
                  stroke={p.color}
                  strokeWidth="0.3"
                  strokeOpacity="0.9"
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.closest('svg')?.parentElement?.getBoundingClientRect();
                    if (!rect) return;
                    setTooltip({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                      point: p,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}

              {/* X axis labels */}
              <text x={toSvgX(0)} y={PAD.top + plotH + 10} fontSize="2.5" fill="#8A8F98" textAnchor="middle">0</text>
              <text x={toSvgX(maxRisk)} y={PAD.top + plotH + 10} fontSize="2.5" fill="#8A8F98" textAnchor="middle">
                {maxRisk.toFixed(0)}pts
              </text>
              <text x={50} y={PAD.top + plotH + 18} fontSize="2.5" fill="#8A8F98" textAnchor="middle">risk (point)</text>

              {/* Y axis labels */}
              <text x={PAD.left - 3} y={toSvgY(yMax)} fontSize="2.5" fill="#8A8F98" textAnchor="end">{yMax.toFixed(0)}</text>
              <text x={PAD.left - 3} y={toSvgY(0)} fontSize="2.5" fill="#8A8F98" textAnchor="end">0</text>
              <text x={PAD.left - 3} y={toSvgY(yMin)} fontSize="2.5" fill="#8A8F98" textAnchor="end">{yMin.toFixed(0)}</text>
            </svg>

            {/* Tooltip */}
            {tooltip && (
              <div
                className="absolute pointer-events-none z-50 rounded-lg border border-white/[0.08] bg-[#0D0D10] p-2.5 text-xs shadow-xl"
                style={{ left: tooltip.x + 10, top: tooltip.y - 40 }}
              >
                <div className="font-medium mb-1" style={{ color: tooltip.point.color }}>
                  {tooltip.point.strategy}
                </div>
                <div className="text-[#8A8F98]">{tooltip.point.date}</div>
                <div className="text-[#EDEDEF]">R:R {tooltip.point.rr.toFixed(2)}</div>
                <div className="text-[#8A8F98]">risk {tooltip.point.riskPoints.toFixed(1)} point</div>
                <div className={tooltip.point.pnlPoints >= 0 ? 'text-green-400' : 'text-red-400'}>
                  profit and loss {tooltip.point.pnlPoints.toFixed(1)} point
                </div>
                <div className="text-[#8A8F98]">qty {tooltip.point.qty}</div>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        {!loading && points.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-3">
            {visibleRows.map(row => (
              <div key={row.strategy} className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="text-[#8A8F98]">{row.strategy}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
