export interface StrategyPerformanceRow {
  strategy: string;
  color: string;
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;          // 0~100, one decimal
  totalPnLPoints: number;
  totalPnLUsd: number;
  avgWinPoints: number;
  avgLossPoints: number;
  avgWinUsd: number;
  avgLossUsd: number;
  profitFactor: number | null;   // null represent lossSampleCount=0
  lossSampleCount: number;
  expectancyUsd: number;
  avgRR: number | null;          // null represent rrSampleCount=0
  rrSampleCount: number;
  rrTotal: number;               // The strategy group total, as the sample coverage denominator
  maxWinStreak: number;
  maxLossStreak: number;
  maxDrawdownUsd: number;        // Positive value (negative absolute value), 0 It means no retracement
}

export interface StrategyPerformanceResponse {
  allTimeStats: StrategyPerformanceRow[];
  rangeStats: StrategyPerformanceRow[];
  rangeLabel: string;            // For example "close 90 sky" / "2026-01-01 → 2026-05-07" / "all"
}

export interface StrategyTradeGroup {
  id: string;
  date: string;                  // YYYY-MM-DD
  entry_time: string;
  exit_time: string | null;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  exit_price: number | null;
  qty: number;
  sl_price: number | null;
  pnl_points: number | null;
  pnl_usd: number | null;
  rr: number | null;             // actual R:R, null=none sl_price
  notes: string | null;
}

export interface StrategyMonthlyAgg {
  month: string;                 // YYYY-MM
  trades: number;
  pnlUsd: number;
  pnlPoints: number;
  winRate: number;
}

export interface StrategyDrilldownResponse {
  strategy: string;
  color: string;
  summary: StrategyPerformanceRow;
  groups: StrategyTradeGroup[];
  monthly: StrategyMonthlyAgg[];
}
