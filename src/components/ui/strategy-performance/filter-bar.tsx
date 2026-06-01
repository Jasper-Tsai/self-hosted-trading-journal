'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StrategyFilter, PnLUnit, UseStrategyPerformanceResult } from '@/lib/hooks/useStrategyPerformance';
import { apiGet } from '@/lib/api-client';

interface FilterBarProps {
  filter: StrategyFilter;
  setFilter: UseStrategyPerformanceResult['setFilter'];
  allStrategyNames: string[];
}

const RANGE_OPTIONS = [
  { value: 'mtd', label: 'MTD' },
  { value: '30', label: '30天' },
  { value: '90', label: '90天' },
  { value: '180', label: '180天' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: '全部' },
  { value: 'custom', label: '自訂' },
] as const;

const SIDE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'LONG', label: 'Long' },
  { value: 'SHORT', label: 'Short' },
] as const;

const UNIT_OPTIONS: { value: PnLUnit; label: string }[] = [
  { value: 'points', label: '點數' },
  { value: 'usd', label: 'USD' },
  { value: 'twd', label: 'TWD' },
];

interface ChipGroupProps {
  items: string[];
  selected: string[];   // empty = all selected
  onToggle: (item: string) => void;
  colorMap?: Map<string, string>;
}

function ChipGroup({ items, selected, onToggle, colorMap }: ChipGroupProps) {
  const allSelected = selected.length === 0;
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => {
          // clicking "全選" clears the selection (= all)
          if (!allSelected) onToggle('__ALL__');
        }}
        className={cn(
          'px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200',
          allSelected
            ? 'bg-[#5E6AD2]/20 border border-[#5E6AD2]/50 text-[#8E9CF5]'
            : 'bg-white/[0.04] border border-white/[0.08] text-[#8A8F98] hover:border-white/[0.15]'
        )}
      >
        全選
      </button>
      {items.map(item => {
        const isActive = allSelected || selected.includes(item);
        const color = colorMap?.get(item);
        return (
          <button
            key={item}
            onClick={() => onToggle(item)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 border',
              isActive
                ? 'text-white'
                : 'bg-white/[0.02] text-[#8A8F98] hover:border-white/[0.15]'
            )}
            style={isActive && color ? {
              backgroundColor: `${color}22`,
              borderColor: `${color}66`,
              color: color,
            } : isActive ? {
              backgroundColor: 'rgba(94,106,210,0.15)',
              borderColor: 'rgba(94,106,210,0.4)',
            } : {
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

export function FilterBar({ filter, setFilter, allStrategyNames }: FilterBarProps) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [brokerNames, setBrokerNames] = useState<string[]>([]);

  useEffect(() => {
    apiGet<{ symbol: string }[]>('/api/products')
      .then(rows => {
        if (Array.isArray(rows)) setSymbols(rows.map(r => r.symbol));
      })
      .catch(() => {});
    apiGet<{ name: string }[]>('/api/brokers')
      .then(rows => {
        if (Array.isArray(rows)) setBrokerNames(rows.map(r => r.name));
      })
      .catch(() => {});
  }, []);

  const selectedSymbols = filter.symbols ? filter.symbols.split(',') : [];
  const selectedBrokers = filter.brokers ? filter.brokers.split(',') : [];
  const selectedStrategies = filter.enabledStrategies ? filter.enabledStrategies.split(',') : [];

  function toggleChip(
    current: string[],
    item: string,
    allItems: string[],
    key: keyof StrategyFilter
  ) {
    if (item === '__ALL__') {
      setFilter({ [key]: '' });
      return;
    }
    let next: string[];
    if (current.length === 0) {
      // all selected → deselect all except this one
      next = allItems.filter(i => i !== item);
    } else if (current.includes(item)) {
      next = current.filter(i => i !== item);
    } else {
      next = [...current, item];
    }
    // if all items selected, store as empty (= all)
    if (next.length === allItems.length) next = [];
    setFilter({ [key]: next.join(',') });
  }

  const isCustom = filter.days === 'custom';

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4 space-y-4">
      {/* Row 1: Range + Unit */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Range */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[#8A8F98] shrink-0">區間</span>
          <div className="flex gap-1 flex-wrap">
            {RANGE_OPTIONS.map(opt => (
              <Button
                key={opt.value}
                variant={filter.days === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter({ days: opt.value })}
                className="h-7 px-2.5 text-xs"
              >
                {opt.label}
              </Button>
            ))}
          </div>
          {isCustom && (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="date"
                value={filter.from}
                onChange={e => setFilter({ from: e.target.value })}
                className="h-7 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[#EDEDEF] text-xs px-2 focus:outline-none focus:border-[#5E6AD2]/50"
              />
              <span className="text-[#8A8F98] text-xs">~</span>
              <input
                type="date"
                value={filter.to}
                onChange={e => setFilter({ to: e.target.value })}
                className="h-7 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[#EDEDEF] text-xs px-2 focus:outline-none focus:border-[#5E6AD2]/50"
              />
            </div>
          )}
        </div>

        {/* Unit */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-[#8A8F98]">單位</span>
          <div className="flex gap-1">
            {UNIT_OPTIONS.map(opt => (
              <Button
                key={opt.value}
                variant={filter.unit === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter({ unit: opt.value })}
                className="h-7 px-2.5 text-xs"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Strategy chips */}
      {allStrategyNames.length > 0 && (
        <div className="flex items-start gap-3 flex-wrap">
          <span className="text-xs text-[#8A8F98] shrink-0 pt-1">策略</span>
          <ChipGroup
            items={allStrategyNames}
            selected={selectedStrategies}
            onToggle={(item) => toggleChip(selectedStrategies, item, allStrategyNames, 'enabledStrategies')}
          />
        </div>
      )}

      {/* Row 3: Symbol + Direction + Broker */}
      <div className="flex flex-wrap gap-4">
        {/* Symbol */}
        {symbols.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-xs text-[#8A8F98] shrink-0 pt-1">商品</span>
            <ChipGroup
              items={symbols}
              selected={selectedSymbols}
              onToggle={(item) => toggleChip(selectedSymbols, item, symbols, 'symbols')}
            />
          </div>
        )}

        {/* Side */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8A8F98]">方向</span>
          <div className="flex gap-1">
            {SIDE_OPTIONS.map(opt => (
              <Button
                key={opt.value}
                variant={filter.sides === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter({ sides: opt.value })}
                className="h-7 px-2.5 text-xs"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Broker */}
        {brokerNames.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-xs text-[#8A8F98] shrink-0 pt-1">券商</span>
            <ChipGroup
              items={brokerNames}
              selected={selectedBrokers}
              onToggle={(item) => toggleChip(selectedBrokers, item, brokerNames, 'brokers')}
            />
          </div>
        )}
      </div>
    </div>
  );
}
