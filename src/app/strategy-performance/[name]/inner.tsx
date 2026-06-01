'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { StrategyDrilldownResponse, StrategyMonthlyAgg, StrategyTradeGroup } from '@/types/strategy-performance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useExchangeRate } from '@/lib/useExchangeRate';
import { cn } from '@/lib/utils';
import { apiGet } from '@/lib/api-client';

type PnLUnit = 'points' | 'usd' | 'twd';

function fmtUsd(v: number): string {
  return `${v >= 0 ? '+' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPts(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)} 點`;
}
function fmtTwd(v: number, rate: number): string {
  const twd = Math.round(v * rate);
  return `${twd >= 0 ? '+' : '-'}NT$${Math.abs(twd).toLocaleString()}`;
}
function fmtPnL(pnlUsd: number, pnlPoints: number, unit: PnLUnit, usdTwd: number): string {
  if (unit === 'points') return fmtPts(pnlPoints);
  if (unit === 'twd') return fmtTwd(pnlUsd, usdTwd);
  return fmtUsd(pnlUsd);
}

// Monthly bar chart (pure div)
function MonthlyBarChart({
  monthly,
  unit,
  usdTwd,
}: {
  monthly: StrategyMonthlyAgg[];
  unit: PnLUnit;
  usdTwd: number;
}) {
  if (monthly.length === 0) return <div className="text-[#8A8F98] text-sm py-4">暫無月度資料</div>;

  const values = monthly.map(m =>
    unit === 'points' ? m.pnlPoints : unit === 'twd' ? m.pnlUsd * usdTwd : m.pnlUsd
  );
  const maxAbs = Math.max(...values.map(Math.abs), 1);
  const BAR_MAX_H = 120;

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1.5 pt-2" style={{ minWidth: monthly.length * 40 }}>
        {monthly.map((m, i) => {
          const v = values[i];
          const h = (Math.abs(v) / maxAbs) * BAR_MAX_H;
          const isPos = v >= 0;
          return (
            <div key={m.month} className="flex flex-col items-center gap-1" style={{ minWidth: 36 }}>
              {/* value label */}
              <span className={cn('text-[9px] tabular-nums', isPos ? 'text-green-400' : 'text-red-400')}>
                {unit === 'points' ? v.toFixed(0) : `$${Math.abs(v).toFixed(0)}`}
              </span>
              {/* bar */}
              <div
                className={cn('w-7 rounded-t-sm', isPos ? 'bg-green-500/60' : 'bg-red-500/60')}
                style={{ height: Math.max(h, 2) }}
                title={`${m.month}: ${v.toFixed(2)} | ${m.trades}筆 | 勝率${m.winRate}%`}
              />
              {/* month label */}
              <span className="text-[9px] text-[#8A8F98] whitespace-nowrap">{m.month.slice(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DrilldownInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { usdTwd } = useExchangeRate();

  const rawName = Array.isArray(params.name) ? params.name[0] : (params.name ?? '');
  const strategyName = decodeURIComponent(rawName);
  const displayName = strategyName === '__none__' ? '無' : strategyName;

  const [data, setData] = useState<StrategyDrilldownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<PnLUnit>((searchParams.get('unit') as PnLUnit) ?? 'usd');

  useEffect(() => {
    let cancelled = false;

    // Pass through filter params from URL
    const qs = searchParams.toString();
    const url = `/api/stats/strategy/${encodeURIComponent(rawName)}${qs ? `?${qs}` : ''}`;

    apiGet<StrategyDrilldownResponse>(url)
      .then(json => {
        if (cancelled) return;
        setData(json);
        setError(null);
        setLoading(false);
      })
      .catch(e => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [rawName, searchParams]);

  const summary = data?.summary;
  const groups = data?.groups ?? [];
  const monthly = data?.monthly ?? [];
  const color = data?.color ?? '#8A8F98';

  const unitOptions: { value: PnLUnit; label: string }[] = [
    { value: 'points', label: '點數' },
    { value: 'usd', label: 'USD' },
    { value: 'twd', label: 'TWD' },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#8A8F98]">
        <Link href="/strategy-performance" className="hover:text-[#EDEDEF] transition-colors">
          策略績效
        </Link>
        <span>/</span>
        <span className="text-[#EDEDEF]">{displayName}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium border"
            style={{ backgroundColor: `${color}22`, borderColor: `${color}55`, color }}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {displayName}
          </span>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">
            策略 Drilldown
          </h1>
        </div>
        {/* Unit toggle */}
        <div className="flex gap-1">
          {unitOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setUnit(opt.value)}
              className={cn(
                'h-8 px-3 text-xs rounded-lg border transition-all duration-200',
                unit === opt.value
                  ? 'bg-[#5E6AD2] border-[#5E6AD2]/80 text-white'
                  : 'bg-white/[0.03] border-white/[0.08] text-[#8A8F98] hover:border-white/[0.15]'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {!loading && !error && summary && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              {
                label: '總損益',
                value: fmtPnL(summary.totalPnLUsd, summary.totalPnLPoints, unit, usdTwd),
                cls: summary.totalPnLUsd >= 0 ? 'text-green-400' : 'text-red-400',
              },
              { label: '筆數', value: String(summary.trades), cls: 'text-[#EDEDEF]' },
              {
                label: '勝率',
                value: `${summary.winRate.toFixed(1)}%`,
                cls: summary.winRate >= 55 ? 'text-green-400' : summary.winRate >= 45 ? 'text-yellow-400' : 'text-red-400',
              },
              {
                label: 'PF',
                value: summary.profitFactor === null ? 'N/A' : summary.profitFactor.toFixed(2),
                cls: summary.profitFactor === null ? 'text-[#8A8F98]' : summary.profitFactor >= 2 ? 'text-green-400' : summary.profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400',
              },
              {
                label: 'EV/筆',
                value: fmtUsd(summary.expectancyUsd),
                cls: summary.expectancyUsd >= 0 ? 'text-green-400' : 'text-red-400',
              },
              {
                label: 'avg R:R',
                value: summary.avgRR === null ? 'N/A' : `${summary.avgRR.toFixed(2)} (${summary.rrSampleCount}/${summary.rrTotal})`,
                cls: summary.avgRR === null ? 'text-[#8A8F98]' : summary.avgRR >= 2 ? 'text-green-400' : 'text-yellow-400',
              },
              {
                label: 'MaxDD',
                value: `$${summary.maxDrawdownUsd.toFixed(2)}`,
                cls: 'text-red-400',
              },
            ].map(item => (
              <Card key={item.label} className="p-4">
                <CardContent className="p-0">
                  <div className="text-xs text-[#8A8F98] mb-1">{item.label}</div>
                  <div className={cn('text-lg font-semibold tabular-nums', item.cls)}>{item.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Monthly P&L */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">月度損益</CardTitle>
            </CardHeader>
            <CardContent>
              <MonthlyBarChart monthly={monthly} unit={unit} usdTwd={usdTwd} />
            </CardContent>
          </Card>

          {/* Trade groups table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">交易 Groups（{groups.length} 筆）</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {['日期', '方向', '進場', '出場', 'qty', '損益', 'R:R', '備註'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-xs font-medium text-[#8A8F98] text-left whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g: StrategyTradeGroup) => {
                      const pnl = unit === 'points'
                        ? (g.pnl_points !== null ? fmtPts(g.pnl_points) : '—')
                        : unit === 'twd'
                          ? (g.pnl_usd !== null ? fmtTwd(g.pnl_usd, usdTwd) : '—')
                          : (g.pnl_usd !== null ? fmtUsd(g.pnl_usd) : '—');
                      const pnlPositive = unit === 'points'
                        ? (g.pnl_points ?? 0) >= 0
                        : (g.pnl_usd ?? 0) >= 0;

                      return (
                        <tr
                          key={g.id}
                          className="border-b border-white/[0.04] cursor-pointer hover:bg-white/[0.03] transition-colors"
                          onClick={() => router.push(`/trades?group=${g.id}`)}
                        >
                          <td className="px-3 py-2 text-[#EDEDEF] whitespace-nowrap">{g.date}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={cn(
                              'text-xs font-medium px-1.5 py-0.5 rounded',
                              g.side === 'LONG' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            )}>
                              {g.side}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums text-[#8A8F98]">{g.entry_price.toFixed(2)}</td>
                          <td className="px-3 py-2 tabular-nums text-[#8A8F98]">
                            {g.exit_price !== null ? g.exit_price.toFixed(2) : '—'}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-[#8A8F98]">{g.qty}</td>
                          <td className={cn('px-3 py-2 tabular-nums font-medium', g.pnl_usd === null ? 'text-[#8A8F98]' : pnlPositive ? 'text-green-400' : 'text-red-400')}>
                            {pnl}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-[#8A8F98]">
                            {g.rr !== null ? g.rr.toFixed(2) : '—'}
                          </td>
                          <td className="px-3 py-2 text-[#8A8F98] max-w-[200px] truncate">
                            {g.notes ?? ''}
                          </td>
                        </tr>
                      );
                    })}
                    {groups.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-[#8A8F98]">
                          暫無資料
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
