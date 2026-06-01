/**
 * Trade Grouping Algorithm — Unit Tests
 * Phase 1.A — 6 cases (case 7 手動 trade 待 Phase 3)
 *
 * Case 1: 純滑價（同 externalOrderId 多 fills）
 * Case 2: 分段 TP（不同 externalOrderId → 同 group，因為是 exits）
 * Case 3: 反轉強制斷（reversal → 2 groups）
 * Case 4: 平倉到 0 後再開（即使時間/價位近 → 2 groups）
 * Case 5: 跨午夜不切（同方向 entry 跨午夜 < 3s/1pt → 1 group）
 * Case 6: 3s/5pt 邊界（5 sub-cases）
 * Case 7: 手動 trade 獨立 group — 手動 trade group 由 form action 直接建立，
 *          不參與 groupFills() 演算法，待 Phase 3 trade-form integration tests 覆蓋。
 */

import { describe, it, expect } from 'vitest';
import { groupFills, distributeQty, RawFill } from '../trade-grouping';

// ─── Deterministic ID generator ──────────────────────────────────────────────

function makeIdGen() {
  let n = 0;
  return () => `id-${++n}`;
}

// ─── Fill factory ────────────────────────────────────────────────────────────

function fill(
  externalTradeId: string,
  externalOrderId: string,
  side: 'BUY' | 'SELL',
  fillTime: string,
  fillPrice: number,
  qty = 1,
  fee = 0.85,
): RawFill {
  return { externalTradeId, externalOrderId, symbol: 'MNQ', side, fillTime, fillPrice, qty, fee };
}

// ─── Case 1: 純滑價（同 externalOrderId 多 fills） ───────────────────────────────

describe('Case 1: 純滑價 — 同 externalOrderId 多 fills → 1 group, 4 legs', () => {
  /**
   * 1 entry order (O1) with 3 fills (slippage)
   * 1 exit order (O2) with 1 fill
   * Expected: 1 group, 4 legs (3 entry + 1 exit), is_closed=true
   */
  const fills: RawFill[] = [
    fill('T1', 'O1', 'BUY', '2026-04-23T09:15:23', 24350.0, 1),
    fill('T2', 'O1', 'BUY', '2026-04-23T09:15:24', 24352.5, 1),
    fill('T3', 'O1', 'BUY', '2026-04-23T09:15:25', 24355.0, 1),
    fill('T4', 'O2', 'SELL', '2026-04-23T09:18:00', 24400.0, 3),
  ];

  const result = groupFills(fills, { idGenerator: makeIdGen() });

  it('produces 1 group', () => {
    expect(result.groups).toHaveLength(1);
  });

  it('produces 4 legs', () => {
    expect(result.legs).toHaveLength(4);
  });

  it('group side is LONG', () => {
    expect(result.groups[0].side).toBe('LONG');
  });

  it('group is_closed = true', () => {
    expect(result.groups[0].isClosed).toBe(true);
  });

  it('entry legs all have externalOrderId=O1', () => {
    const entryLegs = result.legs.filter(l => l.legType === 'entry');
    expect(entryLegs).toHaveLength(3);
    expect(entryLegs.every(l => l.externalOrderId === 'O1')).toBe(true);
  });

  it('exit leg has externalOrderId=O2 and qty=3', () => {
    const exitLegs = result.legs.filter(l => l.legType === 'exit');
    expect(exitLegs).toHaveLength(1);
    expect(exitLegs[0].externalOrderId).toBe('O2');
    expect(exitLegs[0].qty).toBe(3);
  });

  it('group totalQty=3, totalExitQty=3', () => {
    expect(result.groups[0].totalQty).toBe(3);
    expect(result.groups[0].totalExitQty).toBe(3);
  });

  it('entry_price_avg is VWAP of (24350+24352.5+24355)/3', () => {
    const expected = (24350 + 24352.5 + 24355) / 3;
    expect(result.groups[0].entryPriceAvg).toBeCloseTo(expected, 5);
  });

  it('exit leg has pnl_points set (FIFO match)', () => {
    const exitLeg = result.legs.find(l => l.legType === 'exit');
    expect(exitLeg?.pnlPoints).not.toBeNull();
    expect(exitLeg?.matchedEntryLegId).not.toBeNull();
  });
});

// ─── Case 2: 分段 TP ──────────────────────────────────────────────────────────

describe('Case 2: 分段 TP — 3 separate exit orders → 1 group, is_closed=true', () => {
  /**
   * entry: O1, 1 fill, BUY 3 qty @ 24350
   * exit1: O2, SELL 1 qty @ 24380
   * exit2: O3, SELL 1 qty @ 24400
   * exit3: O4, SELL 1 qty @ 24420
   * Expected: 1 group, 4 legs, is_closed=true, total_qty=3, total_exit_qty=3
   */
  const fills: RawFill[] = [
    fill('T1', 'O1', 'BUY',  '2026-04-23T09:15:23', 24350.0, 3),
    fill('T2', 'O2', 'SELL', '2026-04-23T09:18:00', 24380.0, 1),
    fill('T3', 'O3', 'SELL', '2026-04-23T09:25:00', 24400.0, 1),
    fill('T4', 'O4', 'SELL', '2026-04-23T09:35:00', 24420.0, 1),
  ];

  const result = groupFills(fills, { idGenerator: makeIdGen() });

  it('produces 1 group', () => {
    expect(result.groups).toHaveLength(1);
  });

  it('produces 4 legs', () => {
    expect(result.legs).toHaveLength(4);
  });

  it('is_closed=true', () => {
    expect(result.groups[0].isClosed).toBe(true);
  });

  it('total_qty=3, total_exit_qty=3', () => {
    expect(result.groups[0].totalQty).toBe(3);
    expect(result.groups[0].totalExitQty).toBe(3);
  });

  it('exit_price_avg is VWAP of 3 exits', () => {
    const expected = (24380 + 24400 + 24420) / 3;
    expect(result.groups[0].exitPriceAvg).toBeCloseTo(expected, 5);
  });
});

// ─── Case 3: 反轉強制斷 ───────────────────────────────────────────────────────

describe('Case 3: 反轉強制斷 — reversal → 2 groups', () => {
  /**
   * O1: BUY 1 @ 24350 09:15:00 → LONG group g1
   * O2: SELL 2 @ 24351 09:15:01 → close 1 from g1, open SHORT 1 for g2
   * Expected:
   *   g1: LONG, 1 entry leg (O1 qty=1), 1 exit leg (O2 qty=1)
   *   g2: SHORT, 1 entry leg (O2 qty=1, fee proportional)
   */
  const fills: RawFill[] = [
    fill('T1', 'O1', 'BUY',  '2026-04-23T09:15:00', 24350.0, 1, 0.85),
    fill('T2', 'O2', 'SELL', '2026-04-23T09:15:01', 24351.0, 2, 1.70),
  ];

  const result = groupFills(fills, { idGenerator: makeIdGen() });

  it('produces 2 groups', () => {
    expect(result.groups).toHaveLength(2);
  });

  it('g1 side=LONG', () => {
    expect(result.groups[0].side).toBe('LONG');
  });

  it('g2 side=SHORT', () => {
    expect(result.groups[1].side).toBe('SHORT');
  });

  it('g1 has 1 entry leg (O1) and 1 exit leg (O2)', () => {
    const g1Id = result.groups[0].id;
    const g1Legs = result.legs.filter(l => l.tradeGroupId === g1Id);
    expect(g1Legs.filter(l => l.legType === 'entry')).toHaveLength(1);
    expect(g1Legs.filter(l => l.legType === 'exit')).toHaveLength(1);
  });

  it('g2 has 1 entry leg (O2 partial qty=1)', () => {
    const g2Id = result.groups[1].id;
    const g2Legs = result.legs.filter(l => l.tradeGroupId === g2Id);
    expect(g2Legs.filter(l => l.legType === 'entry')).toHaveLength(1);
    const entryLeg = g2Legs.find(l => l.legType === 'entry')!;
    expect(entryLeg.externalOrderId).toBe('O2');
    expect(entryLeg.qty).toBe(1);
  });

  it('g2 entry leg fee is proportional (half of O2 fee)', () => {
    const g2Id = result.groups[1].id;
    const entryLeg = result.legs.find(l => l.tradeGroupId === g2Id && l.legType === 'entry')!;
    expect(entryLeg.fee).toBeCloseTo(0.85, 5);  // 1.70 * (1/2)
  });

  it('g1 total_qty=1, g2 total_qty=1', () => {
    expect(result.groups[0].totalQty).toBe(1);
    expect(result.groups[1].totalQty).toBe(1);
  });
});

// ─── Case 4: 平倉到 0 後再開 ──────────────────────────────────────────────────

describe('Case 4: 平倉到 0 後再開 → 2 groups (even if < 3s/2pt)', () => {
  /**
   * O1: BUY 1 @ 24350 09:15:00
   * O2: SELL 1 @ 24351 09:15:01 → closes to flat
   * O3: BUY 1 @ 24352 09:15:02 → new group (even though < 3s/5pt)
   * Expected: 2 groups
   */
  const fills: RawFill[] = [
    fill('T1', 'O1', 'BUY',  '2026-04-23T09:15:00', 24350.0, 1),
    fill('T2', 'O2', 'SELL', '2026-04-23T09:15:01', 24351.0, 1),
    fill('T3', 'O3', 'BUY',  '2026-04-23T09:15:02', 24352.0, 1),
  ];

  const result = groupFills(fills, { idGenerator: makeIdGen() });

  it('produces 2 groups', () => {
    expect(result.groups).toHaveLength(2);
  });

  it('g1 side=LONG, is_closed=true', () => {
    expect(result.groups[0].side).toBe('LONG');
    expect(result.groups[0].isClosed).toBe(true);
  });

  it('g2 side=LONG, is_closed=false', () => {
    expect(result.groups[1].side).toBe('LONG');
    expect(result.groups[1].isClosed).toBe(false);
  });

  it('g1 has 1 entry + 1 exit', () => {
    const g1Id = result.groups[0].id;
    const g1Legs = result.legs.filter(l => l.tradeGroupId === g1Id);
    expect(g1Legs).toHaveLength(2);
  });

  it('g2 has only 1 entry (no exit yet)', () => {
    const g2Id = result.groups[1].id;
    const g2Legs = result.legs.filter(l => l.tradeGroupId === g2Id);
    expect(g2Legs).toHaveLength(1);
    expect(g2Legs[0].legType).toBe('entry');
  });
});

// ─── Case 5: 跨午夜不切 ───────────────────────────────────────────────────────

describe('Case 5: 跨午夜不切 — same-direction entries across midnight → 1 group', () => {
  /**
   * O1: BUY 1 @ 24350 2026-04-27T23:59:58
   * O2: BUY 1 @ 24351 2026-04-28T00:00:01  (3s later, 1pt diff → cluster)
   * O3: SELL 2 @ 24400 2026-04-28T00:10:00
   * Expected:
   *   1 group
   *   date = '2026-04-27' (from first entry, anchor's fillTime.substring(0,10))
   */
  const fills: RawFill[] = [
    fill('T1', 'O1', 'BUY',  '2026-04-27T23:59:58', 24350.0, 1),
    fill('T2', 'O2', 'BUY',  '2026-04-28T00:00:01', 24351.0, 1),
    fill('T3', 'O3', 'SELL', '2026-04-28T00:10:00', 24400.0, 2),
  ];

  const result = groupFills(fills, { idGenerator: makeIdGen() });

  it('produces 1 group', () => {
    expect(result.groups).toHaveLength(1);
  });

  it('date = 2026-04-27 (from anchor entry)', () => {
    expect(result.groups[0].date).toBe('2026-04-27');
  });

  it('total_qty=2, is_closed=true', () => {
    expect(result.groups[0].totalQty).toBe(2);
    expect(result.groups[0].isClosed).toBe(true);
  });

  it('produces 3 legs (2 entry + 1 exit)', () => {
    expect(result.legs).toHaveLength(3);
    expect(result.legs.filter(l => l.legType === 'entry')).toHaveLength(2);
    expect(result.legs.filter(l => l.legType === 'exit')).toHaveLength(1);
  });
});

// ─── Case 6: 3s/5pt 邊界 ─────────────────────────────────────────────────────

describe('Case 6: 3s/5pt 邊界', () => {
  /**
   * Baseline: O1 entry BUY 1 @ 24350.000 at T+0
   * After O1's group, try O2 entry BUY 1 at various time/price offsets.
   * Both O1 and O2 are entries (adding to position from flat), so O2 only
   * clusters with O1 when within the window.
   *
   * Note: O1 always starts position from 0 (flat → new group).
   * O2 adds to position → goes through cluster check.
   * No exit is provided so groups remain open.
   */

  const anchor = '2026-04-23T09:15:00';
  const anchorPrice = 24350.0;

  function makeCase(label: string, o2Time: string, o2Price: number, expectedGroups: number) {
    it(label, () => {
      const testFills: RawFill[] = [
        fill('T1', 'O1', 'BUY', anchor, anchorPrice, 1),
        fill('T2', 'O2', 'BUY', o2Time, o2Price, 1),
      ];
      const result = groupFills(testFills, { idGenerator: makeIdGen() });
      expect(result.groups).toHaveLength(expectedGroups);
    });
  }

  // 6a: timeDiff=3.0s, priceDiff=5.0pt → inclusive → same group (1 group)
  makeCase(
    '6a: +3.0s / +5.0pt (both inclusive) → 1 group',
    '2026-04-23T09:15:03',
    24355.0,
    1,
  );

  // 6b: timeDiff=3.001s → >3.0 → new group
  // Note: ISO strings are second-precision; we simulate sub-second via a 4-second string
  // Since fill times are second-resolution ISO strings, 3.001s is indistinguishable
  // from 4s at this resolution. Use 4s to test ">3.0":
  makeCase(
    '6b: +4s (>3.0s) / +5.0pt → 2 groups',
    '2026-04-23T09:15:04',
    24355.0,
    2,
  );

  // 6c: timeDiff=3.0s, priceDiff=5.001pt → >5.0 → new group
  makeCase(
    '6c: +3.0s / +5.001pt → 2 groups',
    '2026-04-23T09:15:03',
    24355.001,
    2,
  );

  // 6d: timeDiff=3.0s, priceDiff=4.999pt → inclusive → same group
  makeCase(
    '6d: +3.0s / +4.999pt → 1 group',
    '2026-04-23T09:15:03',
    24354.999,
    1,
  );

  // 6e: timeDiff=0s, priceDiff=0 → trivially same group
  makeCase(
    '6e: +0s / +0pt → 1 group',
    '2026-04-23T09:15:00',
    24350.0,
    1,
  );
});

// ─── Case 8: SIL pointValue 正確套用 ─────────────────────────────────────────

describe('Case 8: SIL pointValue = 10 (not 5000)', () => {
  /**
   * 1 entry SIL BUY 1 @ 30 (O1)
   * 1 exit  SIL SELL 1 @ 35 (O2)
   * pnlPoints = 35 - 30 = 5
   * pnlAmount = 5 * 1 * 10 = 50  (NOT 5 * 1 * 5000 = 25000)
   */
  function silFill(
    externalTradeId: string,
    externalOrderId: string,
    side: 'BUY' | 'SELL',
    fillTime: string,
    fillPrice: number,
    qty = 1,
    fee = 0.85,
  ): RawFill {
    return { externalTradeId, externalOrderId, symbol: 'SIL', side, fillTime, fillPrice, qty, fee };
  }

  const fills: RawFill[] = [
    silFill('T1', 'O1', 'BUY',  '2026-04-23T09:15:00', 30, 1),
    silFill('T2', 'O2', 'SELL', '2026-04-23T09:20:00', 35, 1),
  ];

  const result = groupFills(fills, { idGenerator: makeIdGen() });
  const exitLeg = result.legs.find(l => l.legType === 'exit')!;

  it('exit leg pnlPoints = 5', () => {
    expect(exitLeg.pnlPoints).toBeCloseTo(5, 5);
  });

  it('exit leg pnlAmount = 50 (pointValue=10, not 5000)', () => {
    expect(exitLeg.pnlAmount).toBeCloseTo(50, 5);
  });
});

// ─── Case 9: distributeQty largest-remainder ──────────────────────────────────

describe('Case 9: distributeQty largest-remainder', () => {
  function makeFills(qtys: number[]): RawFill[] {
    return qtys.map((qty, i) => ({
      externalTradeId: `T${i}`,
      externalOrderId: 'O1',
      symbol: 'MNQ' as const,
      side: 'BUY' as const,
      fillTime: '2026-04-23T09:15:00',
      fillPrice: 24350,
      qty,
      fee: 0.85,
    }));
  }

  it('overrideQty=1 across fills [1,1,1] → sum=1 (no qty lost)', () => {
    const result = distributeQty(makeFills([1, 1, 1]), 1, 3);
    expect(result.reduce((s, x) => s + x, 0)).toBe(1);
  });

  it('overrideQty=4 across fills [2,2,1] → sum=4', () => {
    const result = distributeQty(makeFills([2, 2, 1]), 4, 5);
    expect(result.reduce((s, x) => s + x, 0)).toBe(4);
  });

  it('overrideQty===totalOrderQty → returns original qtys unchanged', () => {
    const fills = makeFills([2, 1]);
    expect(distributeQty(fills, 3, 3)).toEqual([2, 1]);
  });

  it('overrideQty=1 across fills [1,1,1] → exactly one fill gets qty=1, others 0', () => {
    const result = distributeQty(makeFills([1, 1, 1]), 1, 3);
    expect(result.filter(x => x === 1)).toHaveLength(1);
    expect(result.filter(x => x === 0)).toHaveLength(2);
  });
});

// ─── Case 10: openGroups — 多 same-direction open groups ─────────────────────

describe('Case 10: openGroups — Codex repro: BUY 1, BUY 1 outside cluster, SELL 2', () => {
  /**
   * Codex repro:
   * O1: BUY 1 @ 24350  t=0
   * O2: BUY 1 @ 24350  t=+10s  (>3s → outside cluster → new group)
   * O3: SELL 2 @ 24400 t=+60s  (exit both groups FIFO)
   * Expected: 2 groups, each totalQty=1 + totalExitQty=1, both isClosed
   */
  const fills: RawFill[] = [
    fill('T1', 'O1', 'BUY',  '2026-04-23T09:15:00', 24350.0, 1),
    fill('T2', 'O2', 'BUY',  '2026-04-23T09:15:10', 24350.0, 1),  // +10s outside window
    fill('T3', 'O3', 'SELL', '2026-04-23T09:16:00', 24400.0, 2),
  ];

  const result = groupFills(fills, { idGenerator: makeIdGen() });

  it('produces 2 groups', () => {
    expect(result.groups).toHaveLength(2);
  });

  it('both groups totalQty=1', () => {
    expect(result.groups[0].totalQty).toBe(1);
    expect(result.groups[1].totalQty).toBe(1);
  });

  it('both groups totalExitQty=1', () => {
    expect(result.groups[0].totalExitQty).toBe(1);
    expect(result.groups[1].totalExitQty).toBe(1);
  });

  it('both groups isClosed=true', () => {
    expect(result.groups[0].isClosed).toBe(true);
    expect(result.groups[1].isClosed).toBe(true);
  });
});

describe('Case 10b: 3 outside-cluster entries SELL 3 → 3 groups each closed', () => {
  /**
   * O1: BUY 1 t=0
   * O2: BUY 1 t=+10s outside
   * O3: BUY 1 t=+20s outside
   * O4: SELL 3 t=+60s → FIFO closes all 3
   */
  const fills: RawFill[] = [
    fill('T1', 'O1', 'BUY',  '2026-04-23T09:15:00', 24350.0, 1),
    fill('T2', 'O2', 'BUY',  '2026-04-23T09:15:10', 24350.0, 1),
    fill('T3', 'O3', 'BUY',  '2026-04-23T09:15:20', 24350.0, 1),
    fill('T4', 'O4', 'SELL', '2026-04-23T09:16:00', 24400.0, 3),
  ];

  const result = groupFills(fills, { idGenerator: makeIdGen() });

  it('produces 3 groups', () => {
    expect(result.groups).toHaveLength(3);
  });

  it('all groups isClosed=true', () => {
    result.groups.forEach(g => expect(g.isClosed).toBe(true));
  });

  it('all groups totalQty=1 totalExitQty=1', () => {
    result.groups.forEach(g => {
      expect(g.totalQty).toBe(1);
      expect(g.totalExitQty).toBe(1);
    });
  });
});

describe('Case 10c: BUY 2, BUY 1 outside, SELL 2 → group1 closed, group2 still open', () => {
  /**
   * O1: BUY 2 t=0      → group1 totalQty=2
   * O2: BUY 1 t=+10s   → group2 totalQty=1 (outside cluster)
   * O3: SELL 2 t=+60s  → FIFO: close all of group1 (qty=2), nothing left for group2
   * Expected: group1 closed (totalExitQty=2), group2 open (totalExitQty=null or 0)
   */
  const fills: RawFill[] = [
    fill('T1', 'O1', 'BUY',  '2026-04-23T09:15:00', 24350.0, 2),
    fill('T2', 'O2', 'BUY',  '2026-04-23T09:15:10', 24350.0, 1),
    fill('T3', 'O3', 'SELL', '2026-04-23T09:16:00', 24400.0, 2),
  ];

  const result = groupFills(fills, { idGenerator: makeIdGen() });

  it('produces 2 groups', () => {
    expect(result.groups).toHaveLength(2);
  });

  it('group1 isClosed=true totalExitQty=2', () => {
    expect(result.groups[0].isClosed).toBe(true);
    expect(result.groups[0].totalExitQty).toBe(2);
  });

  it('group2 isClosed=false', () => {
    expect(result.groups[1].isClosed).toBe(false);
  });
});

describe('Case 10d: BUY 1, BUY 1 outside, SELL 1 → group1 closed, group2 still open', () => {
  /**
   * O1: BUY 1 t=0      → group1
   * O2: BUY 1 t=+10s   → group2 (outside cluster)
   * O3: SELL 1 t=+60s  → FIFO: closes group1 only
   * Expected: group1 isClosed, group2 open
   */
  const fills: RawFill[] = [
    fill('T1', 'O1', 'BUY',  '2026-04-23T09:15:00', 24350.0, 1),
    fill('T2', 'O2', 'BUY',  '2026-04-23T09:15:10', 24350.0, 1),
    fill('T3', 'O3', 'SELL', '2026-04-23T09:16:00', 24400.0, 1),
  ];

  const result = groupFills(fills, { idGenerator: makeIdGen() });

  it('produces 2 groups', () => {
    expect(result.groups).toHaveLength(2);
  });

  it('group1 isClosed=true', () => {
    expect(result.groups[0].isClosed).toBe(true);
  });

  it('group2 isClosed=false', () => {
    expect(result.groups[1].isClosed).toBe(false);
  });
});

// ─── Case 11A: per-fill qty conservation — SELL 1 order 跨 3 groups ──────────

describe('Case 11A: per-fill qty conservation — SELL 3 (fills [2,1]) closes 3 groups', () => {
  /**
   * 3 BUY orders each qty=1, outside cluster → 3 separate groups
   * 1 SELL order qty=3 with 2 fills: fill0 qty=2 (T_S1), fill1 qty=1 (T_S2)
   * Each attachAsExit call must consume from shared fillRemaining, not re-use fill0.
   *
   * Expected:
   * - 3 exit legs, sum(legs.qty) === 3
   * - T_S1 (fill0) appears in exactly 2 exit legs (total qty 2)
   * - T_S2 (fill1) appears in exactly 1 exit leg  (total qty 1)
   */
  const fills: RawFill[] = [
    fill('B1', 'O1', 'BUY',  '2026-04-23T09:15:00', 24350.0, 1),
    fill('B2', 'O2', 'BUY',  '2026-04-23T09:15:10', 24350.0, 1),
    fill('B3', 'O3', 'BUY',  '2026-04-23T09:15:20', 24350.0, 1),
    // SELL order with 2 fills
    fill('T_S1', 'O4', 'SELL', '2026-04-23T09:20:00', 24400.0, 2),
    fill('T_S2', 'O4', 'SELL', '2026-04-23T09:20:00', 24400.0, 1),
  ];

  const result = groupFills(fills, { idGenerator: makeIdGen() });
  const exitLegs = result.legs.filter(l => l.legType === 'exit');

  it('produces 3 groups', () => {
    expect(result.groups).toHaveLength(3);
  });

  it('produces 3 exit legs', () => {
    expect(exitLegs).toHaveLength(3);
  });

  it('sum of exit leg qtys === 3 (no qty lost or duplicated)', () => {
    const total = exitLegs.reduce((s, l) => s + l.qty, 0);
    expect(total).toBe(3);
  });

  it('T_S1 exit legs total qty === 2 (fill0 consumed exactly once)', () => {
    const ts1Legs = exitLegs.filter(l => l.externalTradeId === 'T_S1');
    const ts1Total = ts1Legs.reduce((s, l) => s + l.qty, 0);
    expect(ts1Total).toBe(2);
  });

  it('T_S2 exit legs total qty === 1 (fill1 consumed exactly once)', () => {
    const ts2Legs = exitLegs.filter(l => l.externalTradeId === 'T_S2');
    const ts2Total = ts2Legs.reduce((s, l) => s + l.qty, 0);
    expect(ts2Total).toBe(1);
  });

  it('both tradeIds appear in exit legs (neither tradeId is orphaned)', () => {
    const tradeIds = new Set(exitLegs.map(l => l.externalTradeId));
    expect(tradeIds.has('T_S1')).toBe(true);
    expect(tradeIds.has('T_S2')).toBe(true);
  });

  it('all 3 groups isClosed=true', () => {
    result.groups.forEach(g => expect(g.isClosed).toBe(true));
  });
});

// ─── Case 11B: reversal + multi-group per-fill conservation ──────────────────

describe('Case 11B: reversal per-fill conservation — SELL 3 (fills [2,1]) closes 2 LONG + opens 1 SHORT', () => {
  /**
   * 2 BUY orders each qty=1, outside cluster → 2 separate LONG groups
   * 1 SELL order qty=3 with 2 fills: fill0 qty=2 (T_S1), fill1 qty=1 (T_S2)
   * prevPosition=+2, newPosition=-1 → reversal
   *   - close group1 qty=1 from shared fillRemaining
   *   - close group2 qty=1 from shared fillRemaining
   *   - open SHORT group qty=1 from remaining fillRemaining
   *
   * Expected:
   * - 3 groups (2 LONG closed + 1 SHORT open)
   * - 2 LONG exit legs (qty 1+1=2) + 1 SHORT entry leg (qty 1)
   * - sum of all qty attributed to SELL order fills === 3
   * - both T_S1 and T_S2 appear (no fill orphaned)
   */
  const fills: RawFill[] = [
    fill('B1', 'O1', 'BUY',  '2026-04-23T09:15:00', 24350.0, 1),
    fill('B2', 'O2', 'BUY',  '2026-04-23T09:15:10', 24350.0, 1),
    // SELL reversal order with 2 fills
    fill('T_S1', 'O3', 'SELL', '2026-04-23T09:20:00', 24400.0, 2),
    fill('T_S2', 'O3', 'SELL', '2026-04-23T09:20:00', 24400.0, 1),
  ];

  const result = groupFills(fills, { idGenerator: makeIdGen() });
  const sellLegs = result.legs.filter(l => l.externalOrderId === 'O3');

  it('produces 3 groups', () => {
    expect(result.groups).toHaveLength(3);
  });

  it('groups[0] and [1] are LONG and isClosed', () => {
    expect(result.groups[0].side).toBe('LONG');
    expect(result.groups[0].isClosed).toBe(true);
    expect(result.groups[1].side).toBe('LONG');
    expect(result.groups[1].isClosed).toBe(true);
  });

  it('groups[2] is SHORT and open (reversal new group)', () => {
    expect(result.groups[2].side).toBe('SHORT');
    expect(result.groups[2].isClosed).toBe(false);
  });

  it('sum of all SELL order leg qtys === 3 (no duplication)', () => {
    const total = sellLegs.reduce((s, l) => s + l.qty, 0);
    expect(total).toBe(3);
  });

  it('both T_S1 and T_S2 appear in SELL order legs (no fill orphaned)', () => {
    const tradeIds = new Set(sellLegs.map(l => l.externalTradeId));
    expect(tradeIds.has('T_S1')).toBe(true);
    expect(tradeIds.has('T_S2')).toBe(true);
  });

  it('SHORT group entry leg qty === 1', () => {
    const shortGroupId = result.groups[2].id;
    const shortEntry = result.legs.find(l => l.tradeGroupId === shortGroupId && l.legType === 'entry');
    expect(shortEntry?.qty).toBe(1);
  });
});

// ─── Case 7: 手動 trade 獨立 group ────────────────────────────────────────────

/**
 * Case 7: 手動 trade 獨立 group（D6）
 *
 * 手動 trade group 由 form action 直接建立（createTradeGroup()），
 * 不參與 groupFills() 演算法。D6 的規則是「永遠獨立 group」，
 * 但這個行為在 trade-form.tsx + server action 層面實作，
 * 不在 groupFills() 的職責範圍內。
 *
 * 將在 Phase 3 trade-form integration tests 中完整覆蓋。
 */
describe('Case 7: 手動 trade 獨立 group (placeholder)', () => {
  it.skip('manual trade groups built directly by form action, not by groupFills() — covered separately in trade-form integration tests Phase 3', () => {
    // Intentionally skipped: manual trades bypass groupFills() entirely.
    // D6 rule enforced at the form action layer.
  });
});
