/**
 * Trade Grouping Algorithm — Hybrid B
 * Pure function: external broker fills → trade_groups + trade_legs structures
 * Phase 1.A — no DB dependency, fully unit-testable
 *
 * Algorithm overview (plan §4.1):
 *   Step 1: group fills by externalOrderId → "orders"
 *   Step 2: position tracking per order → entry / exit / reversal
 *   Step 3: same-direction add-to-position → 3s/5pt cluster or new group
 *   Step 4: aggregate group fields (VWAP, min/max, is_closed, fee_total)
 */

// ─── Point values (hardcoded per spec) ──────────────────────────────────────

const POINT_VALUE: Record<string, number> = {
  MNQ: 2,
  NQ: 20,
  SIL: 10,
};

// ─── Public types ────────────────────────────────────────────────────────────

export interface RawFill {
  externalTradeId: string;
  externalOrderId: string;
  symbol: 'MNQ' | 'NQ' | 'SIL';
  side: 'BUY' | 'SELL';
  fillTime: string;       // ISO datetime e.g. '2026-04-23T17:43:00'
  fillPrice: number;
  qty: number;            // always positive
  fee: number;            // always positive
}

export interface ComputedLeg {
  id: string;
  tradeGroupId: string;
  legType: 'entry' | 'exit';
  fillTime: string;
  fillPrice: number;
  qty: number;
  fee: number;
  externalTradeId: string;
  externalOrderId: string;
  matchedEntryLegId: string | null;
  pnlPoints: number | null;
  pnlAmount: number | null;
}

export interface ComputedGroup {
  id: string;
  date: string;           // substr(0,10) of first entry leg's fillTime
  symbol: 'MNQ' | 'NQ' | 'SIL';
  side: 'LONG' | 'SHORT';
  entryTimeFirst: string;
  entryTimeLast: string;
  entryPriceMin: number;
  entryPriceMax: number;
  entryPriceAvg: number;  // VWAP
  totalQty: number;
  exitTimeFirst: string | null;
  exitTimeLast: string | null;
  exitPriceMin: number | null;
  exitPriceMax: number | null;
  exitPriceAvg: number | null;  // VWAP
  totalExitQty: number | null;
  isClosed: boolean;
  feeTotal: number;
}

export interface GroupingResult {
  groups: ComputedGroup[];
  legs: ComputedLeg[];
}

export interface GroupingOptions {
  clusterTimeWindowSec?: number;   // default 3
  clusterPriceWindowPt?: number;   // default 5
  idGenerator?: () => string;      // default crypto.randomUUID()
}

// ─── Internal types ──────────────────────────────────────────────────────────

interface Order {
  orderId: string;
  fills: RawFill[];
  firstFillTime: string;    // ISO, min of fills
  firstFillPrice: number;   // FIFO (first fill's price)
  totalQty: number;         // sum of fill.qty
  side: 'BUY' | 'SELL';
  totalFee: number;         // sum of fill.fee
}

interface GroupState {
  id: string;
  symbol: 'MNQ' | 'NQ' | 'SIL';
  side: 'LONG' | 'SHORT';
  anchorOrder: Order;       // first entry order — anchor for step 3 cluster
  // FIFO queue for exit matching
  entryQueue: Array<{ legId: string; fillPrice: number; remainingQty: number }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fillTimeToSeconds(iso: string): number {
  // Parse ISO datetime string to milliseconds-since-epoch via Date
  // Handles both 'YYYY-MM-DDTHH:MM:SS' and 'YYYY-MM-DDTHH:MM' forms
  return new Date(iso).getTime() / 1000;
}

function vwap(items: Array<{ qty: number; fillPrice: number }>): number {
  const totalQty = items.reduce((s, x) => s + x.qty, 0);
  if (totalQty === 0) return 0;
  return items.reduce((s, x) => s + x.qty * x.fillPrice, 0) / totalQty;
}

/**
 * Distribute effectiveQty across fills proportionally using the largest-remainder
 * method, guaranteeing sum(result) === effectiveQty with no qty lost to rounding.
 * Exported for backward-compat tests (Case 9).
 */
export function distributeQty(fills: RawFill[], effectiveQty: number, totalOrderQty: number): number[] {
  if (effectiveQty === totalOrderQty) return fills.map(f => f.qty);
  const exact = fills.map(f => f.qty * effectiveQty / totalOrderQty);
  const floors = exact.map(e => Math.floor(e));
  const remaining = effectiveQty - floors.reduce((s, x) => s + x, 0);
  const remainderIndices = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remaining && k < remainderIndices.length; k++) {
    result[remainderIndices[k].i] += 1;
  }
  return result;
}

/**
 * Consume wantQty from a shared mutable fillRemaining array using largest-remainder.
 * Mutates fillRemaining in-place (subtracts consumed amounts).
 * totalRemaining must equal sum(fillRemaining) before the call.
 * Returns the per-fill amounts consumed.
 */
function consumeFromFills(fillRemaining: number[], totalRemaining: number, wantQty?: number): number[] {
  const target = wantQty ?? totalRemaining;
  if (target === totalRemaining) {
    // consume everything: snapshot current remaining and zero out
    const out = [...fillRemaining];
    for (let i = 0; i < fillRemaining.length; i++) fillRemaining[i] = 0;
    return out;
  }
  // largest-remainder against fillRemaining (not original fill.qty)
  const exact = fillRemaining.map(r => r * target / totalRemaining);
  const floors = exact.map(e => Math.floor(e));
  const leftover = target - floors.reduce((s, x) => s + x, 0);
  const idxByFrac = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < leftover && k < idxByFrac.length; k++) {
    result[idxByFrac[k].i] += 1;
  }
  // subtract consumed from fillRemaining
  for (let i = 0; i < result.length; i++) fillRemaining[i] -= result[i];
  return result;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function groupFills(fills: RawFill[], opts?: GroupingOptions): GroupingResult {
  const timeWindow = opts?.clusterTimeWindowSec ?? 3;
  const priceWindow = opts?.clusterPriceWindowPt ?? 5;
  const newId = opts?.idGenerator ?? (() => crypto.randomUUID());

  // ── Step 1: group fills by externalOrderId → orders ──────────────────────────

  const orderMap = new Map<string, RawFill[]>();
  for (const fill of fills) {
    if (!orderMap.has(fill.externalOrderId)) orderMap.set(fill.externalOrderId, []);
    orderMap.get(fill.externalOrderId)!.push(fill);
  }

  const orders: Order[] = [];
  for (const [orderId, orderFills] of orderMap) {
    // Sort fills within order by fillTime then externalTradeId (stable)
    orderFills.sort((a, b) => a.fillTime.localeCompare(b.fillTime) || a.externalTradeId.localeCompare(b.externalTradeId));
    orders.push({
      orderId,
      fills: orderFills,
      firstFillTime: orderFills[0].fillTime,
      firstFillPrice: orderFills[0].fillPrice,
      totalQty: orderFills.reduce((s, f) => s + f.qty, 0),
      side: orderFills[0].side,
      totalFee: orderFills.reduce((s, f) => s + f.fee, 0),
    });
  }

  // Sort orders by firstFillTime, then orderId as tiebreaker
  orders.sort((a, b) => a.firstFillTime.localeCompare(b.firstFillTime) || a.orderId.localeCompare(b.orderId));

  // ── Step 2 + 3: position tracking + cluster ───────────────────────────────

  const allGroups: GroupState[] = [];
  const allLegs: ComputedLeg[] = [];

  let position = 0;
  // FIFO queue of all currently open groups (entries without matching exits).
  // openGroups[0] is the oldest (exits consume from head); openGroups[last] is the
  // newest anchor used for cluster-window checks when adding to position.
  const openGroups: GroupState[] = [];

  // Helper: create a new group state
  function newGroup(order: Order): GroupState {
    const side: 'LONG' | 'SHORT' = order.side === 'BUY' ? 'LONG' : 'SHORT';
    const gs: GroupState = {
      id: newId(),
      symbol: order.fills[0].symbol,
      side,
      anchorOrder: order,
      entryQueue: [],
    };
    allGroups.push(gs);
    return gs;
  }

  // Helper: attach fills of an order as entry legs to a group.
  // fillRemaining is the per-fill shared mutable state for this order; wantQty is how
  // much of this order belongs to this group (undefined = consume all remaining).
  function attachAsEntry(gs: GroupState, order: Order, fillRemaining: number[], wantQty?: number): void {
    const totalRemaining = fillRemaining.reduce((s, x) => s + x, 0);
    const fillQtys = consumeFromFills(fillRemaining, totalRemaining, wantQty);
    for (let i = 0; i < order.fills.length; i++) {
      const fill = order.fills[i];
      const fillQty = fillQtys[i];
      if (fillQty === 0) continue;
      const fillFee = fill.fee * (fillQty / fill.qty);
      const legId = newId();
      const leg: ComputedLeg = {
        id: legId,
        tradeGroupId: gs.id,
        legType: 'entry',
        fillTime: fill.fillTime,
        fillPrice: fill.fillPrice,
        qty: fillQty,
        fee: fillFee,
        externalTradeId: fill.externalTradeId,
        externalOrderId: fill.externalOrderId,
        matchedEntryLegId: null,
        pnlPoints: null,
        pnlAmount: null,
      };
      allLegs.push(leg);
      gs.entryQueue.push({ legId, fillPrice: fill.fillPrice, remainingQty: fillQty });
    }
  }

  // Helper: attach fills of an order as exit legs to a group, with FIFO match.
  // fillRemaining is the per-fill shared mutable state for this order; wantQty is how
  // much of this order belongs to this group (undefined = consume all remaining).
  function attachAsExit(gs: GroupState, order: Order, fillRemaining: number[], wantQty?: number): void {
    const totalRemaining = fillRemaining.reduce((s, x) => s + x, 0);
    const pv = POINT_VALUE[gs.symbol] ?? 2;
    const directionMultiplier = gs.side === 'LONG' ? 1 : -1;
    const fillQtys = consumeFromFills(fillRemaining, totalRemaining, wantQty);

    for (let i = 0; i < order.fills.length; i++) {
      const fill = order.fills[i];
      const fillQty = fillQtys[i];
      if (fillQty === 0) continue;
      const fillFee = fill.fee * (fillQty / fill.qty);

      // FIFO match against entry queue
      let remainingExitQty = fillQty;
      let matchedEntryLegId: string | null = null;
      let totalPnlPoints = 0;

      while (remainingExitQty > 0 && gs.entryQueue.length > 0) {
        const head = gs.entryQueue[0];
        const matchQty = Math.min(head.remainingQty, remainingExitQty);
        const pts = (fill.fillPrice - head.fillPrice) * directionMultiplier;
        totalPnlPoints += pts * matchQty;
        if (matchedEntryLegId === null) matchedEntryLegId = head.legId;
        head.remainingQty -= matchQty;
        remainingExitQty -= matchQty;
        if (head.remainingQty === 0) gs.entryQueue.shift();
      }

      const avgPnlPoints = fillQty > 0 ? totalPnlPoints / fillQty : null;
      const pnlAmount = avgPnlPoints != null ? avgPnlPoints * fillQty * pv : null;

      allLegs.push({
        id: newId(),
        tradeGroupId: gs.id,
        legType: 'exit',
        fillTime: fill.fillTime,
        fillPrice: fill.fillPrice,
        qty: fillQty,
        fee: fillFee,
        externalTradeId: fill.externalTradeId,
        externalOrderId: fill.externalOrderId,
        matchedEntryLegId,
        pnlPoints: avgPnlPoints,
        pnlAmount,
      });
    }
  }

  for (const order of orders) {
    const delta = order.totalQty * (order.side === 'BUY' ? 1 : -1);
    const prevPosition = position;
    position += delta;

    // Per-order shared mutable remaining state: each fill starts with its full qty.
    // All attach calls for this order consume from this same array, preventing
    // multi-group attribution from over-claiming the same fill multiple times.
    const fillRemaining = order.fills.map(f => f.qty);

    if (prevPosition === 0) {
      // From flat → open new group
      const gs = newGroup(order);
      openGroups.push(gs);
      attachAsEntry(gs, order, fillRemaining);
    } else if (Math.sign(prevPosition) !== Math.sign(position) && position !== 0) {
      // Reversal: FIFO-close all open groups with abs(prevPosition) qty total,
      // then open a new group for the new direction.
      let remainClose = Math.abs(prevPosition);
      while (remainClose > 0 && openGroups.length > 0) {
        const head = openGroups[0];
        const headEntryQty = head.entryQueue.reduce((s, e) => s + e.remainingQty, 0);
        if (headEntryQty <= remainClose) {
          // close entire head group
          attachAsExit(head, order, fillRemaining, headEntryQty);
          openGroups.shift();
          remainClose -= headEntryQty;
        } else {
          // partial close of head group
          attachAsExit(head, order, fillRemaining, remainClose);
          remainClose = 0;
        }
      }
      const gs = newGroup(order);
      openGroups.push(gs);
      attachAsEntry(gs, order, fillRemaining, Math.abs(position));
    } else if (Math.sign(prevPosition) === Math.sign(position) && Math.abs(position) > Math.abs(prevPosition)) {
      // Adding to position → step 3 cluster check against newest open group (anchor)
      const anchor = openGroups.length > 0 ? openGroups[openGroups.length - 1] : null;
      if (anchor) {
        const timeDiff = fillTimeToSeconds(order.firstFillTime) - fillTimeToSeconds(anchor.anchorOrder.firstFillTime);
        const priceDiff = Math.abs(order.firstFillPrice - anchor.anchorOrder.firstFillPrice);
        if (timeDiff <= timeWindow && priceDiff <= priceWindow) {
          // Same group (add-to-position within cluster window)
          attachAsEntry(anchor, order, fillRemaining);
        } else {
          // Too far → treat as new group, push to queue
          const gs = newGroup(order);
          openGroups.push(gs);
          attachAsEntry(gs, order, fillRemaining);
        }
      }
    } else {
      // Reducing position → FIFO exit from oldest open group(s)
      let remainExit = order.totalQty;
      while (remainExit > 0 && openGroups.length > 0) {
        const head = openGroups[0];
        const headEntryQty = head.entryQueue.reduce((s, e) => s + e.remainingQty, 0);
        if (headEntryQty <= remainExit) {
          // fully closes the head group
          attachAsExit(head, order, fillRemaining, headEntryQty);
          openGroups.shift();
          remainExit -= headEntryQty;
        } else {
          // partial exit on head group
          attachAsExit(head, order, fillRemaining, remainExit);
          remainExit = 0;
        }
      }
      if (position === 0) {
        // ensure queue is cleared on full flat
        openGroups.length = 0;
      }
    }
  }

  // ── Step 4: aggregate group fields ───────────────────────────────────────

  const groups: ComputedGroup[] = allGroups.map((gs) => {
    const groupLegs = allLegs.filter(l => l.tradeGroupId === gs.id);
    const entryLegs = groupLegs.filter(l => l.legType === 'entry');
    const exitLegs = groupLegs.filter(l => l.legType === 'exit');

    // entry aggregates
    entryLegs.sort((a, b) => a.fillTime.localeCompare(b.fillTime));
    const entryPriceMin = Math.min(...entryLegs.map(l => l.fillPrice));
    const entryPriceMax = Math.max(...entryLegs.map(l => l.fillPrice));
    const entryPriceAvg = vwap(entryLegs);
    const totalQty = entryLegs.reduce((s, l) => s + l.qty, 0);
    const entryTimeFirst = entryLegs[0]?.fillTime ?? '';
    const entryTimeLast = entryLegs[entryLegs.length - 1]?.fillTime ?? '';

    // exit aggregates
    let exitTimeFirst: string | null = null;
    let exitTimeLast: string | null = null;
    let exitPriceMin: number | null = null;
    let exitPriceMax: number | null = null;
    let exitPriceAvg: number | null = null;
    let totalExitQty: number | null = null;

    if (exitLegs.length > 0) {
      exitLegs.sort((a, b) => a.fillTime.localeCompare(b.fillTime));
      exitTimeFirst = exitLegs[0].fillTime;
      exitTimeLast = exitLegs[exitLegs.length - 1].fillTime;
      exitPriceMin = Math.min(...exitLegs.map(l => l.fillPrice));
      exitPriceMax = Math.max(...exitLegs.map(l => l.fillPrice));
      exitPriceAvg = vwap(exitLegs);
      totalExitQty = exitLegs.reduce((s, l) => s + l.qty, 0);
    }

    const isClosed = totalExitQty != null && totalQty === totalExitQty;
    const feeTotal = groupLegs.reduce((s, l) => s + l.fee, 0);

    return {
      id: gs.id,
      date: entryTimeFirst.substring(0, 10),
      symbol: gs.symbol,
      side: gs.side,
      entryTimeFirst,
      entryTimeLast,
      entryPriceMin,
      entryPriceMax,
      entryPriceAvg,
      totalQty,
      exitTimeFirst,
      exitTimeLast,
      exitPriceMin,
      exitPriceMax,
      exitPriceAvg,
      totalExitQty,
      isClosed,
      feeTotal,
    };
  });

  return { groups, legs: allLegs };
}
