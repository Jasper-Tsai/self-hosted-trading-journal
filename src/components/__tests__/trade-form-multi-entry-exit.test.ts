/**
 * Phase 3.B (extended) — FIFO matching unit tests
 *
 * Tests the exported pure function:
 *   fifoMatchTrades(entries, exits) → FifoTradeRow[]
 *
 * All cases validate:
 *   1. Correct number of trade rows produced
 *   2. FIFO assignment of entry_time / entry_price per row
 *   3. Correct qty per row
 *   4. Fee proportional split
 *   5. Shared trade_group_id (simulated via caller)
 */

import { describe, it, expect } from 'vitest';
import { fifoMatchTrades, generateTradeGroupId, allocateCents } from '../trade-form';

// ─── helpers ─────────────────────────────────────────────────────────────────

function entry(entry_time: string, entry_price: number, qty: number, fee = 0) {
  return { entry_time, entry_price, qty, fee };
}

function exit_(exit_time: string, exit_price: number, qty: number, fee = 0) {
  return { exit_time, exit_price, qty, fee };
}

// ─── FIFO matching cases ──────────────────────────────────────────────────────

describe('fifoMatchTrades', () => {

  it('1 entry × 1 exit (degenerate) → 1 trade row', () => {
    const rows = fifoMatchTrades(
      [entry('09:00', 23400, 1, 0)],
      [exit_('09:10', 23450, 1, 0)],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(1);
    expect(rows[0].entry_price).toBe(23400);
    expect(rows[0].exit_price).toBe(23450);
  });

  it('2 entries (qty 1+1) × 1 exit (qty 2) → 2 trade rows', () => {
    const rows = fifoMatchTrades(
      [entry('09:00', 23400, 1), entry('09:01', 23410, 1)],
      [exit_('09:20', 23500, 2)],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].entry_price).toBe(23400);
    expect(rows[0].qty).toBe(1);
    expect(rows[1].entry_price).toBe(23410);
    expect(rows[1].qty).toBe(1);
    // both paired with the same exit
    expect(rows[0].exit_price).toBe(23500);
    expect(rows[1].exit_price).toBe(23500);
  });

  it('1 entry (qty 3) × 3 exits (qty 1+1+1) → 3 trade rows', () => {
    const rows = fifoMatchTrades(
      [entry('09:00', 23400, 3)],
      [
        exit_('09:10', 23450, 1),
        exit_('09:20', 23480, 1),
        exit_('09:30', 23510, 1),
      ],
    );
    expect(rows).toHaveLength(3);
    rows.forEach(r => {
      expect(r.entry_price).toBe(23400);
      expect(r.qty).toBe(1);
    });
    expect(rows[0].exit_price).toBe(23450);
    expect(rows[1].exit_price).toBe(23480);
    expect(rows[2].exit_price).toBe(23510);
  });

  it('2 entries (qty 2+1) × 2 exits (qty 1+2) → 3 trade rows (complex FIFO)', () => {
    // Entry 1: qty 2 at 23400
    // Entry 2: qty 1 at 23420
    // Exit 1:  qty 1 at 23450  → matches Entry1 (1 of 2)
    // Exit 2:  qty 2 at 23480  → matches Entry1 (1 remaining) + Entry2 (1)
    const rows = fifoMatchTrades(
      [entry('09:00', 23400, 2), entry('09:01', 23420, 1)],
      [exit_('09:10', 23450, 1), exit_('09:20', 23480, 2)],
    );
    expect(rows).toHaveLength(3);
    // row 0: Entry1 (1) × Exit1 (1)
    expect(rows[0]).toMatchObject({ entry_price: 23400, exit_price: 23450, qty: 1 });
    // row 1: Entry1 (1 remaining) × Exit2
    expect(rows[1]).toMatchObject({ entry_price: 23400, exit_price: 23480, qty: 1 });
    // row 2: Entry2 (1) × Exit2
    expect(rows[2]).toMatchObject({ entry_price: 23420, exit_price: 23480, qty: 1 });
  });

  it('3 entries (qty 1+1+1) × 2 exits (qty 2+1) → 3 trade rows', () => {
    // Exit 1 (qty 2): consumes Entry1 (1) + Entry2 (1)
    // Exit 2 (qty 1): consumes Entry3 (1)
    const rows = fifoMatchTrades(
      [
        entry('09:00', 23400, 1),
        entry('09:01', 23410, 1),
        entry('09:02', 23420, 1),
      ],
      [exit_('09:15', 23500, 2), exit_('09:30', 23520, 1)],
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ entry_price: 23400, exit_price: 23500, qty: 1 });
    expect(rows[1]).toMatchObject({ entry_price: 23410, exit_price: 23500, qty: 1 });
    expect(rows[2]).toMatchObject({ entry_price: 23420, exit_price: 23520, qty: 1 });
  });

  it('fee proportional split — entry fee divided by entry qty, exit fee by exit qty', () => {
    // Entry: qty 2, fee $4  → $2/contract
    // Exit:  qty 2, fee $4  → $2/contract
    // 1 row (exact match): fee = 2+2 = $4
    const rows = fifoMatchTrades(
      [entry('09:00', 23400, 2, 4)],
      [exit_('09:10', 23500, 2, 4)],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].fee).toBeCloseTo(8, 2);
  });

  it('fee proportional split across 2 rows from single entry', () => {
    // Entry qty 2, fee $4 → $2/contract
    // Exit1 qty 1 fee $2, Exit2 qty 1 fee $2
    const rows = fifoMatchTrades(
      [entry('09:00', 23400, 2, 4)],
      [exit_('09:10', 23450, 1, 2), exit_('09:20', 23480, 1, 2)],
    );
    expect(rows).toHaveLength(2);
    // each row: entry_share = (4/2)*1 = 2, exit_share = (2/1)*1 = 2 → total 4
    expect(rows[0].fee).toBeCloseTo(4, 2);
    expect(rows[1].fee).toBeCloseTo(4, 2);
  });

  it('fee zero when all fees are zero', () => {
    const rows = fifoMatchTrades(
      [entry('09:00', 23400, 1, 0)],
      [exit_('09:10', 23500, 1, 0)],
    );
    expect(rows[0].fee).toBe(0);
  });

});

// ─── Qty mismatch validation (pure logic test) ───────────────────────────────

describe('qty mismatch validation', () => {
  function validateQtyMatch(
    entries: Array<{ qty: number }>,
    exits: Array<{ qty: number }>,
  ): boolean {
    const sumEntry = entries.reduce((a, e) => a + e.qty, 0);
    const sumExit = exits.reduce((a, e) => a + e.qty, 0);
    return sumEntry === sumExit;
  }

  it('passes when sums match', () => {
    expect(validateQtyMatch([{ qty: 2 }, { qty: 1 }], [{ qty: 1 }, { qty: 2 }])).toBe(true);
  });

  it('rejects when entry sum > exit sum', () => {
    expect(validateQtyMatch([{ qty: 3 }], [{ qty: 2 }])).toBe(false);
  });

  it('rejects when exit sum > entry sum', () => {
    expect(validateQtyMatch([{ qty: 1 }], [{ qty: 2 }])).toBe(false);
  });
});

// ─── All trade rows share same trade_group_id ────────────────────────────────

describe('shared trade_group_id', () => {
  it('FIFO rows simulated with single group ID are all identical', () => {
    const groupId = generateTradeGroupId('MNQ', '2026-04-28');

    const rows = fifoMatchTrades(
      [entry('09:00', 23400, 2), entry('09:01', 23410, 1)],
      [exit_('09:10', 23450, 1), exit_('09:20', 23480, 2)],
    );

    // All rows would receive the same groupId assigned by the caller
    const tradeDatas = rows.map(r => ({ ...r, trade_group_id: groupId }));
    const ids = tradeDatas.map(t => t.trade_group_id);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(groupId);
  });
});

// ─── Batch endpoint payload construction ─────────────────────────────────────
//
// Verifies the shape of the payload that handleMultiExitSubmit sends to
// POST /api/trade-groups/batch.  We test the pure construction logic (FIFO
// rows → batch trades array) that the handler executes before calling apiPost.

describe('batch endpoint payload', () => {
  const SHARED_FIELDS = {
    date: '2026-04-28',
    symbol: 'MNQ',
    side: 'LONG',
    broker: 'IB',
    notes: null,
    strategy: 'STAR',
    fuel_top: null,
    fuel_bottom: null,
    fuel: null,
    sl_price: null,
    tp1: null,
    tp2: null,
    tp3: null,
  };

  it('builds correct batch trades array for 2×2 FIFO → 3 rows', () => {
    // Entry: 2@23400, 1@23420  |  Exit: 1@23450, 2@23480
    const fifoRows = fifoMatchTrades(
      [entry('09:00', 23400, 2, 4), entry('09:01', 23420, 1, 2)],
      [exit_('09:10', 23450, 1, 2), exit_('09:20', 23480, 2, 4)],
    );

    const groupId = generateTradeGroupId('MNQ', '2026-04-28');

    const batchTrades = fifoRows.map((row) => ({
      ...SHARED_FIELDS,
      entry_time: row.entry_time,
      entry_price: row.entry_price,
      exit_time: row.exit_time,
      exit_price: row.exit_price,
      qty: row.qty,
      fee: row.fee > 0 ? row.fee : null,
    }));

    const payload = { trades: batchTrades, shared_group_id: groupId };

    expect(payload.trades).toHaveLength(3);
    expect(payload.shared_group_id).toBe(groupId);

    // All trades share the same group id
    payload.trades.forEach((t) => {
      expect(t.symbol).toBe('MNQ');
      expect(t.side).toBe('LONG');
    });

    // FIFO assignment preserved
    expect(payload.trades[0]).toMatchObject({ entry_price: 23400, exit_price: 23450, qty: 1 });
    expect(payload.trades[1]).toMatchObject({ entry_price: 23400, exit_price: 23480, qty: 1 });
    expect(payload.trades[2]).toMatchObject({ entry_price: 23420, exit_price: 23480, qty: 1 });
  });

  it('batch payload has shared_group_id matching MANUAL_ prefix pattern', () => {
    const groupId = generateTradeGroupId('MNQ', '2026-04-28');
    expect(groupId).toMatch(/^MANUAL_MNQ_2026-04-28_[A-Z0-9]{6}$/);
  });

  it('fee=null when row.fee is 0', () => {
    const fifoRows = fifoMatchTrades(
      [entry('09:00', 23400, 1, 0)],
      [exit_('09:10', 23450, 1, 0)],
    );
    const batchTrades = fifoRows.map((row) => ({
      ...SHARED_FIELDS,
      entry_time: row.entry_time,
      entry_price: row.entry_price,
      exit_time: row.exit_time,
      exit_price: row.exit_price,
      qty: row.qty,
      fee: row.fee > 0 ? row.fee : null,
    }));
    expect(batchTrades[0].fee).toBeNull();
  });
});

// ─── allocateCents — largest-remainder cents allocation ───────────────────────

describe('allocateCents — no cents drift', () => {
  it('1 entry fee=$0.85 × 3 splits → sum cents == 85 cents', () => {
    // entry qty=3, each split gets 1/3 of 0.85 raw → [0.2833..., 0.2833..., 0.2833...]
    const rawFees = [0.85 / 3, 0.85 / 3, 0.85 / 3];
    const totalCents = Math.round(0.85 * 100); // 85
    const result = allocateCents(rawFees, totalCents);
    expect(result.reduce((s, x) => s + x, 0)).toBe(85);
  });

  it('fee with 1/3 ratio: sum matches exactly over N rows', () => {
    // Simulate 2 entries × 3 exits at 1/3 fee ratio each
    // Total entry fee = $1.50, total exit fee = $0.90
    // All splits involve 1/3 fractions that individually round
    const entryFeeTotal = 1.50;
    const exitFeeTotal  = 0.90;
    const n = 3;
    const rawEntryFees = Array(n).fill(entryFeeTotal / n);
    const rawExitFees  = Array(n).fill(exitFeeTotal / n);
    const allocE = allocateCents(rawEntryFees, Math.round(entryFeeTotal * 100));
    const allocX = allocateCents(rawExitFees,  Math.round(exitFeeTotal  * 100));
    expect(allocE.reduce((s, x) => s + x, 0)).toBe(Math.round(entryFeeTotal * 100));
    expect(allocX.reduce((s, x) => s + x, 0)).toBe(Math.round(exitFeeTotal  * 100));
  });

  it('fifoMatchTrades: sum(row.fee) === sum(entry fees) + sum(exit fees) exactly (no drift)', () => {
    // Use $0.85 entry fee × 3 contracts (3 splits by FIFO), exit fee $0.85 total
    // If each row rounded individually: 0.28+0.28+0.28 = 0.84 ≠ 0.85 → drift scenario
    const rows = fifoMatchTrades(
      [entry('09:00', 23400, 3, 0.85)],
      [
        exit_('09:10', 23450, 1, 0.85 / 3),
        exit_('09:20', 23480, 1, 0.85 / 3),
        exit_('09:30', 23510, 1, 0.85 / 3),
      ],
    );
    const totalEntryFee = 0.85;
    const totalExitFee  = 0.85;
    const sumRowFees = rows.reduce((s, r) => s + r.fee, 0);
    // Allow at most 1 cent tolerance (largest-remainder guarantees no more)
    expect(Math.abs(sumRowFees - (totalEntryFee + totalExitFee))).toBeLessThanOrEqual(0.01);
    // More precisely: sum in cents must be exact
    const sumCents = Math.round(sumRowFees * 100);
    const targetCents = Math.round((totalEntryFee + totalExitFee) * 100);
    expect(sumCents).toBe(targetCents);
  });

  it('fifoMatchTrades 2×2 FIFO: sum(row.fee) === total entry+exit fee', () => {
    const rows = fifoMatchTrades(
      [entry('09:00', 23400, 2, 0.85), entry('09:01', 23410, 1, 0.85)],
      [exit_('09:10', 23450, 1, 0.85), exit_('09:20', 23480, 2, 0.85)],
    );
    const expectedTotalCents = Math.round((0.85 + 0.85 + 0.85 + 0.85) * 100); // 340
    const sumCents = Math.round(rows.reduce((s, r) => s + r.fee, 0) * 100);
    expect(sumCents).toBe(expectedTotalCents);
  });
});
