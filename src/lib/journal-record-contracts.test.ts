import { describe, expect, it } from 'vitest';
import { dailyReviewSchema, directPnlSchema, payoutSchema, propFirmTradeSchema } from '@/lib/journal-record-contracts';

const direct = { date: '2026-09-16', symbol: 'MNQ', side: 'LONG', entry_time: '2026-09-16T09:30', exit_time: '2026-09-16T10:00', qty: 1, broker: 'Manual', gross_pnl_usd: 10, fee: 1, point_value_snapshot: 2 };
const propTrade = { date: '2026-09-16', phase: 'evaluation', symbol: 'MNQ', side: 'SHORT', entry_time: '2026-09-16T09:30', exit_time: '2026-09-16T10:00', qty: 1, pnl_points: 5, pnl_usd: 10, fee: 0 };

describe('public journal record contracts', () => {
  it('accepts bounded manual P&L and prop-firm records', () => {
    expect(directPnlSchema.safeParse(direct).success).toBe(true);
    expect(propFirmTradeSchema.safeParse(propTrade).success).toBe(true);
    expect(payoutSchema.safeParse({ date: '2026-09-16', amount_usd: 1 }).success).toBe(true);
    expect(dailyReviewSchema.safeParse({ status: 'draft', rule_followed: null, error_tags: [] }).success).toBe(true);
  });

  it('rejects invalid chronology, enumerations, and non-positive payouts', () => {
    expect(directPnlSchema.safeParse({ ...direct, exit_time: '2026-09-16T09:00' }).success).toBe(false);
    expect(propFirmTradeSchema.safeParse({ ...propTrade, phase: 'live' }).success).toBe(false);
    expect(payoutSchema.safeParse({ date: '2026-09-16', amount_usd: 0 }).success).toBe(false);
  });
});
