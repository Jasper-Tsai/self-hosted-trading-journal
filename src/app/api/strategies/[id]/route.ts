import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { strategies } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyRequest(req);
    const { id } = await params;
    const [row] = await db
      .select()
      .from(strategies)
      .where(eq(strategies.id, parseInt(id, 10)));
    if (!row) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}

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
    const idNum = parseInt(id, 10);
    const body = await req.json();
    const now = new Date().toISOString();

    // If set to default, Clear other pens first is_default
    if (body.is_default === true) {
      await db
        .update(strategies)
        .set({ is_default: false, updated_at: now })
        .where(eq(strategies.is_default, true));
    }

    const updateData: Record<string, unknown> = { updated_at: now };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;
    if (body.is_default !== undefined) updateData.is_default = body.is_default;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;

    try {
      const [updated] = await db
        .update(strategies)
        .set(updateData)
        .where(eq(strategies.id, idNum))
        .returning();

      if (!updated) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
      return NextResponse.json(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        return NextResponse.json({ error: 'Strategy name already exists' }, { status: 409 });
      }
      throw err;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'No write permission') return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === 'Not logged in' || msg === 'No permission') return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

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
    const now = new Date().toISOString();
    const [updated] = await db
      .update(strategies)
      .set({ enabled: false, updated_at: now })
      .where(eq(strategies.id, parseInt(id, 10)))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'No write permission') return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === 'Not logged in' || msg === 'No permission') return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
