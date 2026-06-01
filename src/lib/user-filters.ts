import { Trade } from '@/types';

/**
 * 檢查交易是否符合 Viewer 可見條件
 */
export function isTradeVisibleToViewer(trade: Trade): boolean {
    void trade;
    return true;
}

/**
 * 過濾交易清單（給 Viewer 使用）
 */
export function filterTradesForViewer(trades: Trade[]): Trade[] {
    return trades.filter(isTradeVisibleToViewer);
}

/**
 * 取得 Viewer 可見資料的最早日期（已移除日期限制，回傳極早日期）
 */
export function getViewerStartDate(): string {
    return '2000-01-01';
}

/**
 * 取得 Viewer 可見的商品清單
 */
export function getViewerAllowedSymbols(): readonly string[] {
    return ['MNQ', 'NQ', 'SIL'];
}
