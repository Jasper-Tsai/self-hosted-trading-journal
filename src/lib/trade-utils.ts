/**
 * Shared trading calculator, for API routes use
 */
import { getPointValue, getFeeByBroker } from '@/lib/utils';
import { Trade, Symbol } from '@/types';

export function getActualFee(trade: Partial<Trade>): number {
  const broker = trade.broker || 'Manual';
  if (broker === 'Manual') {
    return getFeeByBroker(broker, trade.symbol as Symbol) * (trade.qty || 1);
  }
  if (trade.fee !== null && trade.fee !== undefined) return trade.fee;
  return getFeeByBroker(broker, trade.symbol as Symbol) * (trade.qty || 1);
}

export function calcTradePnL(trade: Partial<Trade>): number | null {
  if (!trade.exit_price) return null;
  return trade.side === 'LONG'
    ? (trade.exit_price - (trade.entry_price ?? 0)) * (trade.qty ?? 1)
    : ((trade.entry_price ?? 0) - trade.exit_price) * (trade.qty ?? 1);
}

export function calcTradeAmount(trade: Partial<Trade>): number | null {
  const pnl = calcTradePnL(trade);
  if (pnl === null) return null;
  return (pnl * getPointValue(trade.symbol as Symbol)) - getActualFee(trade);
}

export function formatChicagoDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}
