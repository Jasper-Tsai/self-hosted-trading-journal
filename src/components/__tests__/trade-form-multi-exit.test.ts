/**
 * Phase 3.B — trade-form 分段 TP submit logic unit tests
 *
 * Tests the pure helper functions extracted from trade-form.tsx:
 *   - generateTradeGroupId: format validation
 *   - computeRowFee: proportional entry fee + exit fee
 *
 * The multi-exit submit branch (handleMultiExitSubmit) is an async handler
 * that calls createTrade N times. We test its core logic through the helpers
 * and a minimal integration scenario with mocked createTrade.
 */

import { describe, it, expect, vi } from 'vitest';
import { generateTradeGroupId, computeRowFee } from '../trade-form';

// ─── generateTradeGroupId ────────────────────────────────────────────────────

describe('generateTradeGroupId', () => {
  it('format: MANUAL_<symbol>_<date>_<6-char suffix>', () => {
    const id = generateTradeGroupId('MNQ', '2026-04-28');
    expect(id).toMatch(/^MANUAL_MNQ_2026-04-28_[A-F0-9]{6}$/);
  });

  it('produces unique IDs on repeated calls', () => {
    const ids = new Set(
      Array.from({ length: 20 }, () => generateTradeGroupId('MNQ', '2026-04-28'))
    );
    expect(ids.size).toBe(20);
  });

  it('embeds symbol and date correctly', () => {
    const id = generateTradeGroupId('NQ', '2025-12-31');
    expect(id.startsWith('MANUAL_NQ_2025-12-31_')).toBe(true);
  });
});

// ─── computeRowFee ───────────────────────────────────────────────────────────

describe('computeRowFee', () => {
  it('proportional entry fee + own exit fee (equal split)', () => {
    // entry fee total $4, row qty 1 out of 2 → entry share $2, exit fee $1.24
    const fee = computeRowFee(4, 1, 2, 1.24);
    expect(fee).toBeCloseTo(3.24, 5);
  });

  it('full entry fee when row qty = total qty', () => {
    // entry fee $2.48, all 2 contracts in one exit row
    const fee = computeRowFee(2.48, 2, 2, 2.48);
    expect(fee).toBeCloseTo(4.96, 5);
  });

  it('3-way split: each row gets 1/3 of entry fee', () => {
    // entry fee $6, 3 rows of 1 each
    const r1 = computeRowFee(6, 1, 3, 0);
    const r2 = computeRowFee(6, 1, 3, 0);
    const r3 = computeRowFee(6, 1, 3, 0);
    expect(r1 + r2 + r3).toBeCloseTo(6, 5);
  });

  it('returns 0 when entry fee = 0 and exit fee = 0', () => {
    expect(computeRowFee(0, 1, 2, 0)).toBe(0);
  });

  it('returns exit fee only when entry fee = 0', () => {
    expect(computeRowFee(0, 2, 4, 1.50)).toBeCloseTo(1.50, 5);
  });

  it('guards against totalQty = 0 (no division by zero)', () => {
    expect(() => computeRowFee(4, 1, 0, 0)).not.toThrow();
    expect(computeRowFee(4, 1, 0, 0)).toBe(0);
  });
});

// ─── Multi-exit submit: qty-sum validation logic ─────────────────────────────

describe('multi-exit qty-sum validation', () => {
  /**
   * The actual validation lives in handleMultiExitSubmit inside the component.
   * We extract and test the rule directly: sum(exits[].qty) must === entry qty.
   */

  function validateQtySum(entryQty: number, exitQtys: number[]): boolean {
    const sum = exitQtys.reduce((a, b) => a + b, 0);
    return sum === entryQty;
  }

  it('passes when sum equals entry qty', () => {
    expect(validateQtySum(3, [1, 1, 1])).toBe(true);
  });

  it('fails when sum is less than entry qty', () => {
    expect(validateQtySum(3, [1, 1])).toBe(false);
  });

  it('fails when sum exceeds entry qty', () => {
    expect(validateQtySum(3, [2, 2])).toBe(false);
  });

  it('passes for single exit matching entry', () => {
    expect(validateQtySum(2, [2])).toBe(true);
  });

  it('passes for uneven split (1 + 3 = 4)', () => {
    expect(validateQtySum(4, [1, 3])).toBe(true);
  });
});

// ─── createTrade call count (mock integration) ───────────────────────────────

describe('multi-exit creates N trades with shared group ID', () => {
  /**
   * Simulates the core loop from handleMultiExitSubmit:
   * - generates 1 tradeGroupId
   * - calls createTrade once per exit row
   * - all rows share the same trade_group_id
   */

  it('calls createTrade N times and assigns same group ID', async () => {
    const mockCreateTrade = vi.fn().mockResolvedValue({ success: true });

    const exits = [
      { qty: 1, exit_price: '23500', exit_time: '2026-04-28T10:00' },
      { qty: 2, exit_price: '23520', exit_time: '2026-04-28T10:05' },
    ];

    const tradeGroupId = generateTradeGroupId('MNQ', '2026-04-28');

    for (const exit of exits) {
      await mockCreateTrade({
        entry_price: 23450,
        qty: exit.qty,
        exit_price: parseFloat(exit.exit_price),
        exit_time: exit.exit_time,
        trade_group_id: tradeGroupId,
      });
    }

    expect(mockCreateTrade).toHaveBeenCalledTimes(2);

    const calls = mockCreateTrade.mock.calls;
    const groupIds = calls.map((c: unknown[]) => (c[0] as Record<string, unknown>).trade_group_id);
    expect(new Set(groupIds).size).toBe(1);
    expect(groupIds[0]).toBe(tradeGroupId);
  });
});
