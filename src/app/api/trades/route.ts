import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { trades } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { rebuildTradeGroup } from '@/lib/actions/trade-group-sync';
import { selectTradesWithGroupAttrs } from '@/lib/db/trades-read';

export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);
    const allTrades = await selectTradesWithGroupAttrs().orderBy(desc(trades.entry_time));
    return NextResponse.json(allTrades);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') return NextResponse.json({ error: '無寫入權限' }, { status: 403 });

    const data = await req.json();
    const now = new Date().toISOString();
    const id = randomUUID();
    // trade_group_id: caller may supply one (multi-exit batch) or we fall back to the trade's own id
    const groupId: string = data.trade_group_id ?? id;

    db.transaction((tx) => {
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
        trade_group_id: groupId,
        created_at: now,
        updated_at: now,
      }).run();
      rebuildTradeGroup(tx, groupId);
    });

    return NextResponse.json({ success: true, id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
