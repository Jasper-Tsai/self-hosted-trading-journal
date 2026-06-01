import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api-client';
import { Trade } from '@/types';

// ─── Read ────────────────────────────────────────────────────

export async function getTrades(): Promise<Trade[]> {
  return apiGet<Trade[]>('/api/trades');
}

export async function getTradesByDate(date: string): Promise<Trade[]> {
  return apiGet<Trade[]>(`/api/trades/by-date?date=${encodeURIComponent(date)}`);
}

export async function getTradesInRange(startDate: string, endDate: string): Promise<Trade[]> {
  return apiGet<Trade[]>(`/api/trades/range?start=${startDate}&end=${endDate}`);
}

// ─── Write ───────────────────────────────────────────────────

export async function createTrade(data: Omit<Trade, 'id' | 'created_at' | 'updated_at'>) {
  try {
    const result = await apiPost<{ success: boolean; id: string; error?: string }>('/api/trades', {
      ...data,
      symbol: data.symbol || 'MNQ',
      broker: data.broker || 'Manual',
    });
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '無法創建交易記錄' };
  }
}

export async function updateTrade(id: string, data: Partial<Trade>) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, created_at, updated_at, ...updateData } = data;
    await apiPut(`/api/trades/${id}`, updateData);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '無法更新交易記錄' };
  }
}

export async function deleteTrade(id: string) {
  try {
    await apiDelete(`/api/trades/${id}`);
    return { success: true };
  } catch {
    return { success: false, error: '刪除交易記錄失敗' };
  }
}

// ─── Stats ───────────────────────────────────────────────────

export async function getDashboardStats(date: string, isViewerMode: boolean = false) {
  void isViewerMode;
  const data = await apiGet<{
    totalPnL: number; totalPnLAmount: number; tradeCount: number;
    avgPnL: number; maxHoldTime: number; trades: Trade[];
  }>(`/api/stats/dashboard?date=${encodeURIComponent(date)}`);
  // isViewerMode 篩選已在 API 側完成
  return data;
}

export interface DrawdownPoint {
  date: string;
  drawdownPct: number;
  drawdownAmt: number;
}

export interface AllTimeStats {
  maxDrawdownPct: number;
  maxDrawdownAmt: number;
  maxDrawdownDate: string;
  maxDrawdownRecoveryDate: string | null;
  maxDrawdownDays: number;
  currentDrawdownPct: number;
  currentDrawdownAmt: number;
  isInDrawdown: boolean;
  peakDate: string;
  peakAmount: number;
}

export interface RegressionPoint {
  date: string;
  value: number;
  valuePts: number;
}

export interface RollingPoint {
  date: string;
  winRate: number | null;
  profitFactor: number | null;
}

export async function getEquityCurve(days: number | 'all' = 30, isViewerMode: boolean = false) {
  void isViewerMode;
  return apiGet<{
    equityData: unknown[];
    startCumulativePnL: number;
    startCumulativeAmount: number;
    drawdownCurve: DrawdownPoint[];
    allTimeStats: AllTimeStats;
    regressionLine: RegressionPoint[];
    regressionUpper: RegressionPoint[];
    regressionLower: RegressionPoint[];
    rollingCurve: RollingPoint[];
    overallWinRate: number;
  }>(`/api/stats/equity?days=${days}`);
}

export async function getCalendarHeatmap(isViewerMode: boolean = false) {
  void isViewerMode;
  return apiGet<{
    heatmapData: unknown[]; strategyStats: unknown[]; yearlyWinRateStats: unknown[];
  }>('/api/stats/heatmap');
}

export async function getTimePatterns(days: number = 30, isViewerMode: boolean = false) {
  void isViewerMode;
  return apiGet<{ timePatterns: unknown[] }>(`/api/stats/time-patterns?days=${days}`);
}

export async function getBestWorstTrades(days: number = 30, limit: number = 10, isViewerMode: boolean = false) {
  void isViewerMode;
  return apiGet<{ bestTrades: unknown[]; worstTrades: unknown[] }>(
    `/api/stats/best-worst?days=${days}&limit=${limit}`
  );
}

export interface DailyPnL {
  date: string;
  points: number;
  amount: number;
  totalTrades: number;
  wins: number;
  winRate: number;
  strategicTrades: number;
  strategicWins: number;
  strategicWinRate: number;
}

export async function getMonthlyPnL(year: number, month: number, isViewerMode: boolean = false) {
  void isViewerMode;
  return apiGet<{ dailyPnL: DailyPnL[]; monthlyTotal: number }>(
    `/api/stats/monthly?year=${year}&month=${month}`
  );
}

export interface WeeklySummary {
  weekStart: string; weekEnd: string;
  totalPoints: number; totalAmount: number;
  totalTrades: number; wins: number; winRate: number; tradingDays: number;
}

export async function getWeeklySummaries(year: number, month: number, isViewerMode: boolean = false): Promise<Record<string, WeeklySummary>> {
  void isViewerMode;
  return apiGet(`/api/stats/weekly?year=${year}&month=${month}`);
}
