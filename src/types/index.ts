// Symbol Options
export type Symbol = 'MNQ' | 'NQ' | 'SIL';

// Trade Direction
export type TradeSide = 'LONG' | 'SHORT';

// Broker names are runtime-configurable from the DB brokers table.
export type Broker = string;

// Trade Interface
export interface Trade {
  id?: string;
  date: string;
  symbol?: Symbol;         // 商品類型 (MNQ/NQ)，預設 MNQ
  side: TradeSide;
  entry_time: string;
  entry_price: number;
  exit_time?: string;
  exit_price?: number;
  qty: number;
  fuel_top?: number;
  fuel_bottom?: number;
  fuel?: number;           // 燃料（上界-下界的絕對值）
  sl_price?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  broker?: Broker;
  fee?: number;
  notes?: string;          // 唯讀，解析自所屬群組的備注（SPEC §4.2）
  strategy?: string;       // 唯讀，解析自所屬群組的策略（SPEC §4.1）
  trade_group_id?: string; // 同一開倉事件的交易群組 ID

  created_at?: string;
  updated_at?: string;
}

// Form Data Types
export interface TradeFormData {
  date: string;
  symbol?: Symbol;         // 商品類型 (MNQ/NQ)，預設 MNQ
  side: TradeSide;
  entry_time: string;
  entry_price: number;
  exit_time?: string;
  exit_price?: number;
  qty: number;
  fuel_top?: number;
  fuel_bottom?: number;
  fuel?: number;           // 燃料（上界-下界的絕對值）
  sl_price?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  broker?: Broker;
  fee?: number;
  notes?: string;
  // 注意：strategy 已移至 trade_groups 層級，TradeFormData 不再包含此欄位
}

// Dashboard Statistics
export interface DashboardStats {
  totalPnL: number;
  totalPnLAmount: number;
  tradeCount: number;
  avgPnL: number;
  maxHoldTime: number; // in minutes
  trades: Trade[];
}

// Chart Data Types
export interface ChartDataPoint {
  time: string;
  value: number;
}

export interface EquityData {
  date: string;
  equity: number;
  equityAmount: number;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}

// File Upload Response
export interface UploadResponse {
  files: string[];
}

// Trading Statistics
export interface TradingStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  bestTrade: number;
  worstTrade: number;
}

// Market Event (黑天鵝 / 重大事件標記)
export type EventSeverity = 'danger' | 'warning' | 'info';

export interface MarketEvent {
  id?: string;
  title: string;
  description?: string;
  start_date: string;
  end_date?: string | null;   // null = 進行中
  severity: EventSeverity;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

// Strategy
export type { Strategy } from './strategy';

// Calendar Heatmap Data
export interface HeatmapData {
  date: string;
  value: number; // PnL for the day
  count: number; // number of trades
}
