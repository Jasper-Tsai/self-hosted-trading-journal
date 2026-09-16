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
  symbol?: Symbol;         // Product type (MNQ/NQ), default MNQ
  side: TradeSide;
  entry_time: string;
  entry_price: number;
  exit_time?: string;
  exit_price?: number;
  qty: number;
  fuel_top?: number;
  fuel_bottom?: number;
  fuel?: number;           // fuel (upper bound-absolute value of lower bound)
  sl_price?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  broker?: Broker;
  fee?: number;
  notes?: string;          // Read only, Parse comments from the group you belong to (SPEC §4.2)
  strategy?: string;       // Read only, Parse the policy from the group it belongs to (SPEC §4.1)
  trade_group_id?: string; // Trading groups with the same opening event ID

  created_at?: string;
  updated_at?: string;
}

// Form Data Types
export interface TradeFormData {
  date: string;
  symbol?: Symbol;         // Product type (MNQ/NQ), default MNQ
  side: TradeSide;
  entry_time: string;
  entry_price: number;
  exit_time?: string;
  exit_price?: number;
  qty: number;
  fuel_top?: number;
  fuel_bottom?: number;
  fuel?: number;           // fuel (upper bound-absolute value of lower bound)
  sl_price?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  broker?: Broker;
  fee?: number;
  notes?: string;
  // Notice: strategy Moved to trade_groups Hierarchy, TradeFormData This field is no longer included
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

// Market Event (black swan / Major event markers)
export type EventSeverity = 'danger' | 'warning' | 'info';

export interface MarketEvent {
  id?: string;
  title: string;
  description?: string;
  start_date: string;
  end_date?: string | null;   // null = in progress
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

export interface DirectPnlTrade { id: string; date: string; symbol: string; side: TradeSide; entry_time: string; exit_time: string; qty: number; broker: string; gross_pnl_usd: number; fee: number; point_value_snapshot: number; strategy: string | null; notes: string | null; created_at: string; updated_at: string; }
export type PropFirmPhase = 'evaluation' | 'funded';
export type PropFirmExitReason = 'TP' | 'SL' | 'BE' | 'manual' | 'time' | 'other';
export interface PropFirmTrade { id: string; date: string; phase: PropFirmPhase; symbol: string; side: TradeSide; entry_time: string; exit_time: string; qty: number; pnl_points: number; pnl_usd: number; fee: number; strategy: string | null; exit_reason: PropFirmExitReason | null; notes: string | null; created_at: string; updated_at: string; }
export interface PropFirmPayout { id: string; date: string; amount_usd: number; notes: string | null; created_at: string; updated_at: string; }
export interface DailyReview { date: string; status: 'draft' | 'completed'; structure: string | null; scenario_a: string | null; scenario_b: string | null; scenario_c: string | null; rule_followed: boolean | null; error_tags: string[]; lesson: string | null; next_action: string | null; created_at: string; updated_at: string; }
