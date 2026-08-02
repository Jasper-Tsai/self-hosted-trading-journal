import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { market_events } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// PUT /api/market-events/[id] — only owner Updatable
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') return NextResponse.json({ error: 'No permission' }, { status: 403 });

    const { id } = await params;
    const data = await req.json();
    const now = new Date().toISOString();

    await db
      .update(market_events)
      .set({
        title: data.title,
        description: data.description ?? null,
        start_date: data.start_date,
        end_date: data.end_date ?? null,
        severity: data.severity,
        updated_at: now,
      })
      .where(eq(market_events.id, id));

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

// DELETE /api/market-events/[id] — only owner Can be deleted
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') return NextResponse.json({ error: 'No permission' }, { status: 403 });

    const { id } = await params;
    await db.delete(market_events).where(eq(market_events.id, id));

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
