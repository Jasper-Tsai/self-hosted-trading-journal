/**
 * Win-rate classification rules for trade groups.
 *
 * draw (breakeven)threshold: Average point profit and loss per trade |pnl_points / qty| ≤ 5
 * winning rate denominator: Just count wins + losses, breakeven completely excluded (Neither the numerator nor the denominator)
 *
 * See details SPEC.md §2.5.2 / §2.5.3.
 */

export const BREAKEVEN_POINTS_PER_CONTRACT = 5;

export type TradeOutcome = 'win' | 'loss' | 'breakeven';

export function classifyByPointsPerContract(
  pnlPoints: number,
  qty: number,
): TradeOutcome {
  if (!Number.isFinite(pnlPoints) || !Number.isFinite(qty) || qty <= 0) {
    return 'breakeven';
  }
  const perContract = pnlPoints / qty;
  if (Math.abs(perContract) <= BREAKEVEN_POINTS_PER_CONTRACT) return 'breakeven';
  return perContract > 0 ? 'win' : 'loss';
}

export function isBreakevenByPoints(pnlPoints: number, qty: number): boolean {
  return classifyByPointsPerContract(pnlPoints, qty) === 'breakeven';
}

export function computeWinRate(wins: number, losses: number): number {
  const denom = wins + losses;
  return denom > 0 ? (wins / denom) * 100 : 0;
}
