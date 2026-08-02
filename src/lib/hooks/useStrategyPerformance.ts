'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StrategyPerformanceResponse, StrategyDrilldownResponse } from '@/types/strategy-performance';
import { useExchangeRate } from '@/lib/useExchangeRate';
import { apiGet } from '@/lib/api-client';

export type PnLUnit = 'points' | 'usd' | 'twd';

export interface StrategyFilter {
  days: string;            // 'mtd' | '30' | '90' | '180' | 'ytd' | 'all' | 'custom'
  from: string;
  to: string;
  symbols: string;         // CSV
  sides: string;           // CSV
  brokers: string;         // CSV
  unit: PnLUnit;
  enabledStrategies: string; // CSV — empty = all
}

const DEFAULT_FILTER: StrategyFilter = {
  days: 'mtd',
  from: '',
  to: '',
  symbols: '',
  sides: '',
  brokers: '',
  unit: 'usd',
  enabledStrategies: '',
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildQueryString(filter: StrategyFilter): string {
  const params = new URLSearchParams();

  if (filter.days === 'custom') {
    if (filter.from) params.set('from', filter.from);
    if (filter.to)   params.set('to', filter.to);
  } else if (filter.days === 'mtd') {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    params.set('from', formatLocalDate(monthStart));
    params.set('to', formatLocalDate(today));
  } else if (filter.days === 'ytd') {
    const today = new Date();
    const year = today.getFullYear();
    params.set('from', `${year}-01-01`);
    params.set('to', formatLocalDate(today));
  } else if (filter.days !== 'all') {
    params.set('days', filter.days);
  } else {
    params.set('days', 'all');
  }

  if (filter.symbols) params.set('symbols', filter.symbols);
  if (filter.sides)   params.set('sides', filter.sides);
  if (filter.brokers) params.set('brokers', filter.brokers);

  return params.toString();
}

export interface UseStrategyPerformanceResult {
  data: StrategyPerformanceResponse | null;
  loading: boolean;
  error: string | null;
  filter: StrategyFilter;
  setFilter: (partial: Partial<StrategyFilter>) => void;
  usdTwd: number;
  // drilldown cache: strategy name → data
  drilldownCache: Map<string, StrategyDrilldownResponse>;
  fetchDrilldowns: (names: string[]) => Promise<void>;
  drilldownLoading: boolean;
}

export function useStrategyPerformance(): UseStrategyPerformanceResult {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { usdTwd } = useExchangeRate();

  // Derive filter from URL — wrapped in useMemo so the object reference is stable across renders
  const filter: StrategyFilter = useMemo(() => ({
    days: searchParams.get('days') ?? DEFAULT_FILTER.days,
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
    symbols: searchParams.get('symbols') ?? '',
    sides: searchParams.get('sides') ?? '',
    brokers: searchParams.get('brokers') ?? '',
    unit: (searchParams.get('unit') as PnLUnit) ?? DEFAULT_FILTER.unit,
    enabledStrategies: searchParams.get('enabledStrategies') ?? DEFAULT_FILTER.enabledStrategies,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [searchParams.toString()]);

  const setFilter = useCallback((partial: Partial<StrategyFilter>) => {
    const merged = { ...filter, ...partial };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v as string);
    }
    router.replace(`/strategy-performance?${params.toString()}`, { scroll: false });
  }, [filter, router]);

  // Main data fetch
  const [data, setData] = useState<StrategyPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const qs = buildQueryString(filter);
    apiGet<StrategyPerformanceResponse>(`/api/stats/strategy${qs ? `?${qs}` : ''}`)
      .then(json => {
        if (cancelled) return;
        setData(json);
      })
      .catch(e => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filter.days, filter.from, filter.to,
    filter.symbols, filter.sides, filter.brokers,
  ]);

  // Drilldown cache
  const [drilldownCache, setDrilldownCache] = useState<Map<string, StrategyDrilldownResponse>>(new Map());
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const fetchingRef = useRef<Set<string>>(new Set());

  const fetchDrilldowns = useCallback(async (names: string[]) => {
    const qs = buildQueryString(filter);
    const toFetch = names.filter(n => !drilldownCache.has(n) && !fetchingRef.current.has(n));
    if (toFetch.length === 0) return;

    toFetch.forEach(n => fetchingRef.current.add(n));
    setDrilldownLoading(true);

    const results = await Promise.allSettled(
      toFetch.map(async name => {
        const encoded = name === 'none' ? '__none__' : encodeURIComponent(name);
        const url = `/api/stats/strategy/${encoded}${qs ? `?${qs}` : ''}`;
        const data = await apiGet<StrategyDrilldownResponse>(url);
        return { name, data };
      })
    );

    setDrilldownCache(prev => {
      const next = new Map(prev);
      for (const r of results) {
        if (r.status === 'fulfilled') {
          next.set(r.value.name, r.value.data);
        }
      }
      return next;
    });

    toFetch.forEach(n => fetchingRef.current.delete(n));
    setDrilldownLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.days, filter.from, filter.to, filter.symbols, filter.sides, filter.brokers, drilldownCache]);

  // Invalidate drilldown cache when filter changes
  useEffect(() => {
    setDrilldownCache(new Map());
    fetchingRef.current.clear();
  }, [filter.days, filter.from, filter.to, filter.symbols, filter.sides, filter.brokers]);

  return {
    data,
    loading,
    error,
    filter,
    setFilter,
    usdTwd,
    drilldownCache,
    fetchDrilldowns,
    drilldownLoading,
  };
}
