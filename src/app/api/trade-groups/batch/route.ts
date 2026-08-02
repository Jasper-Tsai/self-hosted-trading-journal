/**
 * POST /api/trade-groups/batch
 *
 * Atomic multi-trade create: inserts N trades sharing a single trade_group_id
 * then rebuilds the group once inside one transaction.
 *
 * Body: { trades: TradeData[] }  (shared_group_id is server-generated; client value ignored)
 *
 * Returns: { success: true, ids: string[], group_id: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { trades } from '@/lib/db/schema';
import { randomUUID } from 'crypto';
import { rebuildTradeGroup } from '@/lib/actions/trade-group-sync';

const VALID_SIDES = new Set(['LONG', 'SHORT']);
const VALID_SYMBOLS = new Set(['MNQ', 'NQ', 'SIL']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface TradeData {
  date: string;
  symbol?: string;
  side: string;
  entry_time: string;
  entry_price: number;
  exit_time?: string | null;
  exit_price?: number | null;
  qty: number;
  fuel_top?: number | null;
  fuel_bottom?: number | null;
  fuel?: number | null;
  sl_price?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  broker?: string | null;
  fee?: number | null;
  notes?: string | null;
  strategy?: string | null;
  external_trade_ids?: string | null;
}

function isPositiveFinite(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v > 0;
}

/** Optional numeric field: if present must be finite and >= 0 */
function isNonNegativeFinite(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function isValidTime(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return false;
  const year = +m[1], month = +m[2], day = +m[3];
  const hour = +m[4], minute = +m[5], second = m[6] ? +m[6] : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return false;
  const dt = new Date(year, month - 1, day, hour, minute, second);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day
      && dt.getHours() === hour && dt.getMinutes() === minute && dt.getSeconds() === second;
}

function validateBatchTrades(tradeList: TradeData[]): string | null {
  if (tradeList.length === 0) return 'trades Cannot be empty';

  const first = tradeList[0];
  const refSymbol = first.symbol ?? 'MNQ';
  const refSide = first.side;
  const refDate = first.date;
  const refBroker = first.broker ?? '';

  for (let i = 0; i < tradeList.length; i++) {
    const t = tradeList[i];
    const idx = i + 1;

    if (!VALID_SIDES.has(t.side)) return `No. ${idx} trades: side must be LONG or SHORT`;
    const sym = t.symbol ?? 'MNQ';
    if (!VALID_SYMBOLS.has(sym)) return `No. ${idx} trades: symbol must be MNQ, NQ or SIL`;
    if (!t.broker || typeof t.broker !== 'string' || t.broker.trim() === '')
      return `No. ${idx} trades: broker Cannot be empty`;
    if (!isPositiveFinite(t.entry_price)) return `No. ${idx} trades: entry_price Must be a positive number`;
    if (t.exit_price != null && !isPositiveFinite(t.exit_price))
      return `No. ${idx} trades: exit_price Must be a positive number`;
    if (!Number.isInteger(t.qty) || t.qty <= 0) return `No. ${idx} trades: qty Must be a positive integer`;
    if (!DATE_RE.test(t.date)) return `No. ${idx} trades: date The format must be YYYY-MM-DD`;

    // Datetime fields
    if (!isValidTime(t.entry_time)) return `No. ${idx} trades: entry_time Invalid format`;
    if (t.exit_time != null && !isValidTime(t.exit_time))
      return `No. ${idx} trades: exit_time Invalid format`;

    // Optional numeric fields: if present must be finite >= 0
    for (const [field, val] of [
      ['fee', t.fee],
      ['fuel_top', t.fuel_top],
      ['fuel_bottom', t.fuel_bottom],
      ['fuel', t.fuel],
      ['sl_price', t.sl_price],
      ['tp1', t.tp1],
      ['tp2', t.tp2],
      ['tp3', t.tp3],
    ] as [string, unknown][]) {
      if (val != null && !isNonNegativeFinite(val))
        return `No. ${idx} trades: ${field} If there is a value, it must be a non-negative finite number`;
    }

    // String length limits
    if (t.notes != null && t.notes.length > 2000)
      return `No. ${idx} trades: notes not to exceed 2000 Character`;
    if (t.strategy != null && t.strategy.length > 100)
      return `No. ${idx} trades: strategy not to exceed 100 Character`;

    // All trades must share the same symbol, side, date, broker
    if (sym !== refSymbol) return `No. ${idx} trades: symbol and No. 1 pen inconsistent`;
    if (t.side !== refSide) return `No. ${idx} trades: side and No. 1 pen inconsistent`;
    if (t.date !== refDate) return `No. ${idx} trades: date and No. 1 pen inconsistent`;
    if ((t.broker ?? '') !== refBroker) return `No. ${idx} trades: broker and No. 1 pen inconsistent`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') return NextResponse.json({ error: 'No write permission' }, { status: 403 });

    const body = await req.json();
    const { trades: tradeList } = body as { trades: TradeData[] };

    if (!Array.isArray(tradeList)) {
      return NextResponse.json({ error: 'trades field must be an Array' }, { status: 400 });
    }

    const validationError = validateBatchTrades(tradeList);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const first = tradeList[0];
    const sym = first.symbol ?? 'MNQ';
    const date = first.date;
    // Server-generated group id — client-supplied shared_group_id is intentionally ignored
    const shared_group_id = `MANUAL_${sym}_${date}_${randomUUID().replace(/-/g, '')}`;

    const ids: string[] = [];

    db.transaction((tx) => {
      for (const data of tradeList) {
        const id = randomUUID();
        const now = new Date().toISOString();
        tx.insert(trades).values({
          id,
          date: data.date,
          symbol: data.symbol ?? 'MNQ',
          side: data.side,
          entry_time: data.entry_time,
          entry_price: data.entry_price,
          exit_time: data.exit_time ?? null,
          exit_price: data.exit_price ?? null,
          qty: data.qty,
          fuel_top: data.fuel_top ?? null,
          fuel_bottom: data.fuel_bottom ?? null,
          fuel: data.fuel ?? null,
          sl_price: data.sl_price ?? null,
          tp1: data.tp1 ?? null,
          tp2: data.tp2 ?? null,
          tp3: data.tp3 ?? null,
          broker: data.broker ?? 'Manual',
          fee: data.fee ?? null,
          notes: data.notes ?? null,
          strategy: data.strategy || null,
          external_trade_ids: data.external_trade_ids ?? null,
          trade_group_id: shared_group_id,
          created_at: now,
          updated_at: now,
        }).run();
        ids.push(id);
      }

      // Rebuild the group once after all trades are inserted
      rebuildTradeGroup(tx, shared_group_id);
    });

    return NextResponse.json({ success: true, ids, group_id: shared_group_id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
