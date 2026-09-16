import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { prop_firm_payouts } from '@/lib/db/schema';
import { nullIfBlank, payoutSchema } from '@/lib/journal-record-contracts';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await verifyRequest(req); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const parsed = payoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payout' }, { status: 400 });
  const { id } = await params;
  const result = await db.update(prop_firm_payouts).set({ ...parsed.data, notes: nullIfBlank(parsed.data.notes), updated_at: new Date().toISOString() }).where(eq(prop_firm_payouts.id, id));
  return result.changes ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await verifyRequest(req); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const { id } = await params;
  const result = await db.delete(prop_firm_payouts).where(eq(prop_firm_payouts.id, id));
  return result.changes ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
