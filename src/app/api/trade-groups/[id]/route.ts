import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { getTradeGroupWithLegs } from '@/lib/actions/trade-groups';
import { db } from '@/lib/db';
import { trades, trade_groups } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { rebuildTradeGroup } from '@/lib/actions/trade-group-sync';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyRequest(req);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }

  const { id } = await params;
  const result = await getTradeGroupWithLegs(id);
  if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') return NextResponse.json({ error: 'No write permission' }, { status: 403 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }

  const { id } = await params;

  let statusCode = 200;

  try {
    db.transaction((tx) => {
      // Check both namespaces for the id
      const groupRows = tx.select({ id: trade_groups.id })
        .from(trade_groups)
        .where(eq(trade_groups.id, id))
        .limit(1)
        .all();

      const standaloneRows = tx.select({ id: trades.id })
        .from(trades)
        .where(and(eq(trades.id, id), isNull(trades.trade_group_id)))
        .limit(1)
        .all();

      // Ambiguous: id matches both a trade_group AND a standalone trade
      if (groupRows.length > 0 && standaloneRows.length > 0) {
        statusCode = 409;
        throw new Error('AMBIGUOUS_ID');
      }

      if (groupRows.length > 0) {
        // Has a trade_group row — delete all trades sharing this group id
        const tradeResult = tx.delete(trades).where(eq(trades.trade_group_id, id)).run();
        const groupResult = tx.delete(trade_groups).where(eq(trade_groups.id, id)).run();
        if ((tradeResult.changes ?? 0) === 0 && (groupResult.changes ?? 0) === 0) {
          statusCode = 404;
          throw new Error('NOT_FOUND');
        }
      } else {
        // Standalone trade (manual NULL group, groupKey = trade.id)
        const result = tx.delete(trades)
          .where(and(eq(trades.id, id), isNull(trades.trade_group_id)))
          .run();
        if ((result.changes ?? 0) === 0) {
          statusCode = 404;
          throw new Error('NOT_FOUND');
        }
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'AMBIGUOUS_ID') {
      return NextResponse.json({ error: 'ambiguous_id' }, { status: 409 });
    }
    if (msg === 'NOT_FOUND') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: statusCode || 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') return NextResponse.json({ error: 'No write permission' }, { status: 403 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }

  const { id } = await params;

  let body: { strategy?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // At least one of these must be provided key (use 'in' Determine whether it Exits, Rather than looking at whether the value truthy)
  const hasStrategy = 'strategy' in body;
  const hasNotes = 'notes' in body;
  if (!hasStrategy && !hasNotes) {
    return NextResponse.json({ error: 'Need to provide strategy or notes' }, { status: 400 });
  }

  // verify strategy field (If provided)
  let strategy: string | null | undefined;
  if (hasStrategy) {
    const rawStrategy = body.strategy;
    if (rawStrategy !== undefined && rawStrategy !== null && typeof rawStrategy !== 'string') {
      return NextResponse.json({ error: 'strategy Must be a string or null' }, { status: 400 });
    }
    if (typeof rawStrategy === 'string' && rawStrategy.length > 100) {
      return NextResponse.json({ error: 'strategy Maximum length 100 character' }, { status: 400 });
    }
    // The empty string is normalized to null
    strategy =
      typeof rawStrategy === 'string' && rawStrategy.trim() !== ''
        ? rawStrategy.trim()
        : null;
  }

  // verify notes field (If provided)
  let notes: string | null | undefined;
  if (hasNotes) {
    const rawNotes = body.notes;
    if (rawNotes !== undefined && rawNotes !== null && typeof rawNotes !== 'string') {
      return NextResponse.json({ error: 'notes Must be a string or null' }, { status: 400 });
    }
    if (typeof rawNotes === 'string' && rawNotes.length > 2000) {
      return NextResponse.json({ error: 'notes Maximum length 2000 character' }, { status: 400 });
    }
    // The empty string is normalized to null
    notes =
      typeof rawNotes === 'string' && rawNotes.trim() !== ''
        ? rawNotes.trim()
        : null;
  }

  // dynamic group setObj: Update only body actually Exit in key, Avoid overwriting unprovided fields
  const buildSetObj = (now: string) => {
    const setObj: Record<string, unknown> = { updated_at: now };
    if (hasStrategy) setObj.strategy = strategy;
    if (hasNotes) setObj.notes = notes;
    return setObj;
  };

  try {
    let found = false;

    db.transaction((tx) => {
      const now = new Date().toISOString();
      const setObj = buildSetObj(now);

      // Try updating directly trade_groups
      const updateResult = tx
        .update(trade_groups)
        .set(setObj)
        .where(eq(trade_groups.id, id))
        .run();

      if ((updateResult.changes ?? 0) > 0) {
        found = true;
        return;
      }

      // group row does not exist (old information)— First rebuild Establish, Again UPDATE (same copy setObj)
      rebuildTradeGroup(tx, id);

      const retryResult = tx
        .update(trade_groups)
        .set(setObj)
        .where(eq(trade_groups.id, id))
        .run();

      if ((retryResult.changes ?? 0) > 0) {
        found = true;
      }
      // If still 0 rows means this id No correspondence at all trades, found maintain false
    });

    if (!found) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
