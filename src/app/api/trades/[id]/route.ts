import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { trades } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { rebuildTradeGroup } from '@/lib/actions/trade-group-sync';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') return NextResponse.json({ error: '無寫入權限' }, { status: 403 });

    const { id } = await params;
    const data = await req.json();
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = { updated_at: now };

    const fieldMap: Record<string, string> = {
      date: 'date', symbol: 'symbol', side: 'side',
      entry_time: 'entry_time', entry_price: 'entry_price',
      exit_time: 'exit_time', exit_price: 'exit_price',
      qty: 'qty', fuel_top: 'fuel_top', fuel_bottom: 'fuel_bottom',
      fuel: 'fuel', sl_price: 'sl_price',
      tp1: 'tp1', tp2: 'tp2', tp3: 'tp3',
      broker: 'broker', fee: 'fee',
      // ⚠️ notes 與 strategy 均已移至 trade_groups 層（SPEC §4.1 / §4.2）。
      // trades.notes / trades.strategy 僅作為建立時的種子，編輯既有交易不再更新。
      // 編輯備注走 PATCH /api/trade-groups/[id]；編輯策略同理。
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in data) updateData[col] = data[key] ?? null;
    }

    db.transaction((tx) => {
      // Read old trade to know which group(s) to rebuild
      const oldTrade = tx.select().from(trades).where(eq(trades.id, id)).get();

      tx.update(trades).set(updateData).where(eq(trades.id, id)).run();

      // Re-read to get the final group id (in case trade_group_id was updated)
      const updatedTrade = tx.select().from(trades).where(eq(trades.id, id)).get();

      if (oldTrade) {
        const oldGroupId = oldTrade.trade_group_id ?? oldTrade.id;
        const newGroupId = updatedTrade?.trade_group_id ?? id;

        rebuildTradeGroup(tx, newGroupId);
        // If trade moved to a different group, also rebuild the old group
        if (oldGroupId !== newGroupId) {
          rebuildTradeGroup(tx, oldGroupId);
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') return NextResponse.json({ error: '無寫入權限' }, { status: 403 });

    const { id } = await params;

    db.transaction((tx) => {
      const trade = tx.select().from(trades).where(eq(trades.id, id)).get();
      if (!trade) return;

      const groupId = trade.trade_group_id ?? trade.id;
      tx.delete(trades).where(eq(trades.id, id)).run();
      rebuildTradeGroup(tx, groupId);
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
