'use client';

import { useStrategyPerformance } from '@/lib/hooks/useStrategyPerformance';
import { FilterBar } from '@/components/ui/strategy-performance/filter-bar';
import { KpiCards } from '@/components/ui/strategy-performance/kpi-cards';
import { StrategyTable } from '@/components/ui/strategy-performance/strategy-table';
import { StrategyEquityCurves } from '@/components/ui/strategy-performance/strategy-equity-curves';
import { StrategyRRScatter } from '@/components/ui/strategy-performance/strategy-rr-scatter';
import { StrategyTimeHeatmap } from '@/components/ui/strategy-performance/strategy-time-heatmap';
import { StrategyPnLDistribution } from '@/components/ui/strategy-performance/strategy-pnl-distribution';

export function StrategyPerformanceInner() {
  const {
    data,
    loading,
    error,
    filter,
    setFilter,
    usdTwd,
    drilldownCache,
    fetchDrilldowns,
  } = useStrategyPerformance();

  const rows = data?.rangeStats ?? [];
  const allStrategyNames = rows.map(r => r.strategy);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">
          策略績效
        </h1>
        <p className="text-[#8A8F98] mt-1">
          {data?.rangeLabel ? `${data.rangeLabel} · ` : ''}各策略總損益、R:R、PF、MaxDD 對照
        </p>
      </div>

      {/* Filter Bar */}
      <FilterBar
        filter={filter}
        setFilter={setFilter}
        allStrategyNames={allStrategyNames}
      />

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          載入失敗：{error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-white/[0.04] animate-pulse" />
        </div>
      )}

      {/* Content */}
      {!loading && !error && rows.length > 0 && (
        <>
          {/* KPI Cards */}
          <KpiCards
            rows={rows}
            enabledStrategies={filter.enabledStrategies}
            unit={filter.unit}
            usdTwd={usdTwd}
          />

          {/* Strategy Table */}
          <StrategyTable
            rows={rows}
            enabledStrategies={filter.enabledStrategies}
            unit={filter.unit}
            usdTwd={usdTwd}
          />

          {/* Equity Curves */}
          <StrategyEquityCurves
            rows={rows}
            enabledStrategies={filter.enabledStrategies}
            drilldownCache={drilldownCache}
            fetchDrilldowns={fetchDrilldowns}
            unit={filter.unit}
            usdTwd={usdTwd}
          />

          {/* R:R Scatter */}
          <StrategyRRScatter
            rows={rows}
            enabledStrategies={filter.enabledStrategies}
            drilldownCache={drilldownCache}
            fetchDrilldowns={fetchDrilldowns}
          />

          {/* Time Heatmap */}
          <StrategyTimeHeatmap
            rows={rows}
            enabledStrategies={filter.enabledStrategies}
            drilldownCache={drilldownCache}
            fetchDrilldowns={fetchDrilldowns}
          />

          {/* PnL Distribution */}
          <StrategyPnLDistribution
            rows={rows}
            enabledStrategies={filter.enabledStrategies}
            drilldownCache={drilldownCache}
            fetchDrilldowns={fetchDrilldowns}
            unit={filter.unit}
            usdTwd={usdTwd}
          />
        </>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="flex items-center justify-center h-40 text-[#8A8F98]">
          暫無策略績效資料
        </div>
      )}
    </div>
  );
}
