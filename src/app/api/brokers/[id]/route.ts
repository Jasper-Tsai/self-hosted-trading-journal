import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { brokers, broker_fees, trades } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// PATCH /api/brokers/[id] — Update brokerage (Contains fees)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') {
      return NextResponse.json({ error: 'No write permission' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const now = new Date().toISOString();

    // Confirm the existence of the brokerage
    const [existing] = await db.select().from(brokers).where(eq(brokers.id, id));
    if (!existing) {
      return NextResponse.json({ error: 'Brokerage not found' }, { status: 404 });
    }

    // Update basic information of brokerage firm
    const updateData: Record<string, unknown> = { updated_at: now };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;

    try {
      await db.update(brokers).set(updateData).where(eq(brokers.id, id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        return NextResponse.json({ error: 'The brokerage name already exists' }, { status: 409 });
      }
      throw err;
    }

    // renew fees (If provided)
    if (body.fees && typeof body.fees === 'object') {
      for (const [symbol, fee] of Object.entries(body.fees)) {
        if (typeof fee !== 'number') continue;
        if (fee < 0) {
          // A negative value is regarded as deleting the pen
          await db
            .delete(broker_fees)
            .where(and(eq(broker_fees.broker_id, id), eq(broker_fees.symbol, symbol)));
        } else {
          // upsert: Delete first then insert
          await db
            .delete(broker_fees)
            .where(and(eq(broker_fees.broker_id, id), eq(broker_fees.symbol, symbol)));
          await db.insert(broker_fees).values({
            broker_id: id,
            symbol,
            fee_per_contract: fee,
            created_at: now,
            updated_at: now,
          });
        }
      }
    }

    const [updated] = await db.select().from(brokers).where(eq(brokers.id, id));
    const feeRows = await db
      .select()
      .from(broker_fees)
      .where(eq(broker_fees.broker_id, id));
    const feesMap: Record<string, number> = {};
    for (const f of feeRows) feesMap[f.symbol] = f.fee_per_contract;

    return NextResponse.json({ ...updated, fees: feesMap });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'No write permission') return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === 'Not logged in' || msg === 'No permission') return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/brokers/[id] — Delete broker (If so trades Point to this brokerage name then block)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') {
      return NextResponse.json({ error: 'No write permission' }, { status: 403 });
    }

    const { id } = await params;

    // Confirm the existence of the brokerage
    const [existing] = await db.select().from(brokers).where(eq(brokers.id, id));
    if (!existing) {
      return NextResponse.json({ error: 'Brokerage not found' }, { status: 404 });
    }

    // Check if there is trades Use this broker name
    const usedTrades = await db
      .select({ id: trades.id })
      .from(trades)
      .where(eq(trades.broker, existing.name))
      .limit(1);

    if (usedTrades.length > 0) {
      return NextResponse.json(
        { error: `cannot be deleted: Already have trades using a broker${existing.name}, Please modify the relevant transactions first` },
        { status: 409 }
      );
    }

    // delete fees Delete again broker
    await db.delete(broker_fees).where(eq(broker_fees.broker_id, id));
    await db.delete(brokers).where(eq(brokers.id, id));

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'No write permission') return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === 'Not logged in' || msg === 'No permission') return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
