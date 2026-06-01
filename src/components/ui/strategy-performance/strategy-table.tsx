'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StrategyPerformanceRow } from '@/types/strategy-performance';
import { PnLUnit } from '@/lib/hooks/useStrategyPerformance';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StrategyTableProps {
  rows: StrategyPerformanceRow[];
  enabledStrategies: string;
  unit: PnLUnit;
  usdTwd: number;
}

type SortKey = keyof StrategyPerformanceRow;

function getWinRateColor(wr: number): string {
  if (wr >= 65) return 'text-green-400';
  if (wr >= 50) return 'text-yellow-400';
  return 'text-red-400';
}

function getPFColor(pf: number | null): string {
  if (pf === null) return 'text-[#8A8F98]';
  if (pf >= 2) return 'text-green-400';
  if (pf >= 1) return 'text-yellow-400';
  return 'text-red-400';
}

function fmtUsd(v: number): string {
  return `${v >= 0 ? '+' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPts(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
}

function fmtTwd(v: number, rate: number): string {
  const twd = Math.round(v * rate);
  return `${twd >= 0 ? '+' : '-'}NT$${Math.abs(twd).toLocaleString()}`;
}

// sortIcon and thCell are module-level helpers to avoid components-inside-render lint errors

function sortIcon(k: SortKey, sortKey: SortKey, sortDir: 'asc' | 'desc'): React.ReactNode {
  if (sortKey !== k) return <span className="ml-1 text-white/20">↕</span>;
  return <span className="ml-1 text-[#5E6AD2]">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

function thCell(
  k: SortKey,
  children: React.ReactNode,
  sortKey: SortKey,
  sortDir: 'asc' | 'desc',
  onSort: (k: SortKey) => void,
  right?: boolean
): React.ReactNode {
  return (
    <th
      key={k}
      className={cn(
        'px-3 py-2.5 text-xs font-medium text-[#8A8F98] cursor-pointer select-none whitespace-nowrap hover:text-[#EDEDEF] transition-colors',
        right ? 'text-right' : 'text-left'
      )}
      onClick={() => onSort(k)}
    >
      {children}
      {sortIcon(k, sortKey, sortDir)}
    </th>
  );
}

export function StrategyTable({ rows, enabledStrategies, unit, usdTwd }: StrategyTableProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('totalPnLUsd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const enabledSet = enabledStrategies
    ? new Set(enabledStrategies.split(',').filter(Boolean))
    : null;

  const filtered = enabledSet
    ? rows.filter(r => enabledSet.has(r.strategy))
    : rows;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">策略績效對照表</CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="sticky left-0 bg-[#050506] px-3 py-2.5 text-xs font-medium text-[#8A8F98] text-left whitespace-nowrap z-10">
                  策略
                </th>
                {thCell('trades', '筆數', sortKey, sortDir, handleSort, true)}
                <th className="px-3 py-2.5 text-xs font-medium text-[#8A8F98] text-right whitespace-nowrap">勝/敗/平</th>
                {thCell('winRate', '勝率', sortKey, sortDir, handleSort, true)}
                {thCell('totalPnLPoints', '總點數', sortKey, sortDir, handleSort, true)}
                {thCell('totalPnLUsd', '總USD', sortKey, sortDir, handleSort, true)}
                {thCell('avgWinPoints', '均獲利(pts)', sortKey, sortDir, handleSort, true)}
                {thCell('avgLossPoints', '均虧損(pts)', sortKey, sortDir, handleSort, true)}
                {thCell('avgRR', 'R:R', sortKey, sortDir, handleSort, true)}
                {thCell('profitFactor', 'PF', sortKey, sortDir, handleSort, true)}
                {thCell('expectancyUsd', 'EV/筆', sortKey, sortDir, handleSort, true)}
                {thCell('maxDrawdownUsd', 'MaxDD', sortKey, sortDir, handleSort, true)}
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => (
                <tr
                  key={row.strategy}
                  onClick={() => {
                    const encoded = row.strategy === '無' ? '__none__' : encodeURIComponent(row.strategy);
                    router.push(`/strategy-performance/${encoded}`);
                  }}
                  className="border-b border-white/[0.04] cursor-pointer hover:bg-white/[0.03] transition-colors duration-150"
                >
                  {/* Strategy chip - sticky */}
                  <td className="sticky left-0 bg-[#050506] px-3 py-2.5 whitespace-nowrap z-10">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border"
                      style={{
                        backgroundColor: `${row.color}22`,
                        borderColor: `${row.color}55`,
                        color: row.color,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      {row.strategy}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#EDEDEF] tabular-nums">{row.trades}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs text-[#8A8F98]">
                    <span className="text-green-400">{row.wins}</span>
                    <span className="mx-0.5">/</span>
                    <span className="text-red-400">{row.losses}</span>
                    <span className="mx-0.5">/</span>
                    <span>{row.breakeven}</span>
                  </td>
                  <td className={cn('px-3 py-2.5 text-right tabular-nums font-medium', getWinRateColor(row.winRate))}>
                    {row.winRate.toFixed(1)}%
                  </td>
                  <td className={cn('px-3 py-2.5 text-right tabular-nums', row.totalPnLPoints >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {fmtPts(row.totalPnLPoints)}
                  </td>
                  <td className={cn('px-3 py-2.5 text-right tabular-nums', row.totalPnLUsd >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {unit === 'twd' ? fmtTwd(row.totalPnLUsd, usdTwd) : fmtUsd(row.totalPnLUsd)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-green-400">
                    {fmtPts(row.avgWinPoints)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-400">
                    {fmtPts(row.avgLossPoints)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.avgRR === null ? (
                      <span className="text-[#8A8F98]">—</span>
                    ) : (
                      <span className="text-[#EDEDEF]">
                        {row.avgRR.toFixed(2)}
                        <span className="text-xs text-[#8A8F98] ml-1">{row.rrSampleCount}/{row.rrTotal}</span>
                      </span>
                    )}
                  </td>
                  <td className={cn('px-3 py-2.5 text-right tabular-nums font-medium', getPFColor(row.profitFactor))}>
                    {row.profitFactor === null ? 'N/A' : row.profitFactor.toFixed(2)}
                  </td>
                  <td className={cn('px-3 py-2.5 text-right tabular-nums', row.expectancyUsd >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {fmtUsd(row.expectancyUsd)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-400">
                    ${row.maxDrawdownUsd.toFixed(2)}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-[#8A8F98] text-sm">
                    暫無資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
