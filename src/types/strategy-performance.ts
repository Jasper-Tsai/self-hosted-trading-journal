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
  profitFactor: number | null;   // null 代表 lossSampleCount=0
  lossSampleCount: number;
  expectancyUsd: number;
  avgRR: number | null;          // null 代表 rrSampleCount=0
  rrSampleCount: number;
  rrTotal: number;               // 該策略 group 總數，作為樣本覆蓋率分母
  maxWinStreak: number;
  maxLossStreak: number;
  maxDrawdownUsd: number;        // 正值（負值絕對值），0 代表沒回撤
}

export interface StrategyPerformanceResponse {
  allTimeStats: StrategyPerformanceRow[];
  rangeStats: StrategyPerformanceRow[];
  rangeLabel: string;            // 例如 "近 90 天" / "2026-01-01 → 2026-05-07" / "全部"
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
  rr: number | null;             // 實際 R:R，null=無 sl_price
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
