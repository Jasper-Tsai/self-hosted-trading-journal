import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { updateProduct, deleteProduct, getProductBySymbol } from '@/lib/actions/products';

// PATCH /api/products/[symbol] — Update product (owner only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') {
      return NextResponse.json({ error: 'No write permission' }, { status: 403 });
    }

    const { symbol } = await params;
    const existing = await getProductBySymbol(symbol);
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const body = await req.json();
    const result = await updateProduct(symbol, body);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const updated = await getProductBySymbol(symbol);
    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'No write permission') return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === 'Not logged in' || msg === 'No permission') return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/products/[symbol] — Delete product (owner only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') {
      return NextResponse.json({ error: 'No write permission' }, { status: 403 });
    }

    const { symbol } = await params;
    const existing = await getProductBySymbol(symbol);
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const result = await deleteProduct(symbol);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'No write permission') return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === 'Not logged in' || msg === 'No permission') return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
