import { Trade } from '@/types';

/**
 * Check whether the transaction complies with Viewer visible conditions
 */
export function isTradeVisibleToViewer(trade: Trade): boolean {
    void trade;
    return true;
}

/**
 * Filter transaction list (Give Viewer use)
 */
export function filterTradesForViewer(trades: Trade[]): Trade[] {
    return trades.filter(isTradeVisibleToViewer);
}

/**
 * obtain Viewer The earliest date the data is visible (Date restriction removed, Return very early date)
 */
export function getViewerStartDate(): string {
    return '2000-01-01';
}

/**
 * obtain Viewer Visible product list
 */
export function getViewerAllowedSymbols(): readonly string[] {
    return ['MNQ', 'NQ', 'SIL'];
}
