'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AccessDenied } from '@/components/access-denied';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import toast from 'react-hot-toast';

interface ProductRecord {
  symbol: string;
  name: string;
  name_zh: string;
  tick_size: number;
  point_value: number;
  price_step: number;
  owner_only: boolean;
  enabled: boolean;
  sort_order: number;
}

async function apiDeleteReq(path: string): Promise<void> {
  await apiDelete(path);
}

// ─── ProductFormModal ─────────────────────────────────────────

interface ProductFormModalProps {
  product: ProductRecord | null;
  onClose: () => void;
  onSave: () => void;
}

const EMPTY_FORM = {
  symbol: '',
  name: '',
  name_zh: '',
  tick_size: '0.25',
  point_value: '2',
  price_step: '0.25',
  owner_only: false,
  enabled: true,
  sort_order: '0',
};

function ProductFormModal({ product, onClose, onSave }: ProductFormModalProps) {
  const [form, setForm] = useState(() =>
    product
      ? {
          symbol: product.symbol,
          name: product.name,
          name_zh: product.name_zh,
          tick_size: String(product.tick_size),
          point_value: String(product.point_value),
          price_step: String(product.price_step),
          owner_only: product.owner_only,
          enabled: product.enabled,
          sort_order: String(product.sort_order),
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);

  const set = (field: string, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.symbol.trim() || !form.name.trim() || !form.name_zh.trim()) {
      toast.error('Product code and name cannot be empty');
      return;
    }
    const payload = {
      symbol: form.symbol.trim().toUpperCase(),
      name: form.name.trim(),
      name_zh: form.name_zh.trim(),
      tick_size: parseFloat(form.tick_size) || 0.25,
      point_value: parseFloat(form.point_value) || 1,
      price_step: parseFloat(form.price_step) || 0.25,
      owner_only: form.owner_only,
      enabled: form.enabled,
      sort_order: parseInt(form.sort_order) || 0,
    };

    setSaving(true);
    try {
      if (product) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { symbol: _sym, ...updatePayload } = payload;
        await apiPatch(`/api/products/${encodeURIComponent(product.symbol)}`, updatePayload);
        toast.success('Product has been updated');
      } else {
        await apiPost('/api/products', payload);
        toast.success('Product has been added');
      }
      onSave();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Operation failed';
      // API What is returned is JSON String, try to parse
      try {
        const parsed = JSON.parse(msg);
        toast.error(parsed.error ?? msg);
      } catch {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-[#0D0D0F] border border-white/[0.08] rounded-xl shadow-2xl">
        <div className="px-6 py-5 border-b border-white/[0.06]">
          <h2 className="text-lg font-semibold text-[#EDEDEF]">
            {product ? 'Edit product' : 'Add new product'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* first column: symbol + sort_order */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="p-symbol">Product code</Label>
              <Input
                id="p-symbol"
                value={form.symbol}
                onChange={e => set('symbol', e.target.value)}
                placeholder="MNQ"
                disabled={!!product}
                required
              />
            </div>
            <div>
              <Label htmlFor="p-sort">sort</Label>
              <Input
                id="p-sort"
                type="number"
                value={form.sort_order}
                onChange={e => set('sort_order', e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {/* second column: alternate name + display name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="p-name-zh">Alternate name</Label>
              <Input
                id="p-name-zh"
                value={form.name_zh}
                onChange={e => set('name_zh', e.target.value)}
                placeholder="Miniature Nasdaq"
                required
              />
            </div>
            <div>
              <Label htmlFor="p-name">English name</Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Micro E-mini NASDAQ"
                required
              />
            </div>
          </div>

          {/* third column: tick_size + point_value + price_step */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="p-tick">Tick Size</Label>
              <Input
                id="p-tick"
                type="number"
                step="0.0001"
                min="0"
                value={form.tick_size}
                onChange={e => set('tick_size', e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="p-pv">Point Value ($)</Label>
              <Input
                id="p-pv"
                type="number"
                step="0.01"
                min="0"
                value={form.point_value}
                onChange={e => set('point_value', e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="p-step">Price Step</Label>
              <Input
                id="p-step"
                type="number"
                step="0.0001"
                min="0"
                value={form.price_step}
                onChange={e => set('price_step', e.target.value)}
                required
              />
            </div>
          </div>

          {/* fourth column: ownerOnly + enabled */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.owner_only}
                onChange={e => set('owner_only', e.target.checked)}
                className="w-4 h-4 accent-[#5E6AD2]"
              />
              <span className="text-sm text-[#8A8F98]">only Owner visible</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={e => set('enabled', e.target.checked)}
                className="w-4 h-4 accent-emerald-500"
              />
              <span className="text-sm text-[#8A8F98]">enable</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Storing...' : 'store'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── ProductsPage (main component)──────────────────────────────────────

export default function ProductsPage() {
  const { isOwner, loading: authLoading } = useAuth();
  const [productList, setProductList] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ProductRecord | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/products?all=1');
      if (!res.ok) throw new Error(await res.text());
      const rows: ProductRecord[] = await res.json();
      setProductList(rows);
    } catch {
      toast.error('Failed to load product');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOwner) fetchProducts();
  }, [isOwner, fetchProducts]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <span className="text-[#8A8F98]">loading...</span>
      </div>
    );
  }

  if (!isOwner) return <AccessDenied />;

  const handleAdd = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const handleEdit = (p: ProductRecord) => {
    setEditTarget(p);
    setModalOpen(true);
  };

  const handleToggleEnabled = async (p: ProductRecord) => {
    try {
      await apiPatch(`/api/products/${encodeURIComponent(p.symbol)}`, { enabled: !p.enabled });
      toast.success(p.enabled ? `${p.symbol}Deactivated` : `${p.symbol}Enabled`);
      await fetchProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operation failed');
    }
  };

  const handleDelete = async (p: ProductRecord) => {
    try {
      await apiDeleteReq(`/api/products/${encodeURIComponent(p.symbol)}`);
      toast.success(`${p.symbol}Deleted`);
      setDeleteConfirm(null);
      await fetchProducts();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      try {
        const parsed = JSON.parse(msg);
        toast.error(parsed.error ?? msg);
      } catch {
        toast.error(msg);
      }
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">
            Product Manager
          </h1>
          <p className="text-[#8A8F98] mt-1">
            Manage trading product list (MNQ, NQ, SIL, etc.)
          </p>
        </div>
        <Button onClick={handleAdd}>Add new product</Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0D0D0F] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#8A8F98]">loading...</div>
        ) : productList.length === 0 ? (
          <div className="p-8 text-center text-[#8A8F98]">No products yet, Click on the upper right cornerAdd new product</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-5 py-3 text-left font-medium text-[#8A8F98]">code name</th>
                <th className="px-5 py-3 text-left font-medium text-[#8A8F98]">Alternate name</th>
                <th className="px-5 py-3 text-left font-medium text-[#8A8F98]">English name</th>
                <th className="px-4 py-3 text-center font-medium text-[#8A8F98]">Tick</th>
                <th className="px-4 py-3 text-center font-medium text-[#8A8F98]">Point $</th>
                <th className="px-4 py-3 text-center font-medium text-[#8A8F98]">Step</th>
                <th className="px-4 py-3 text-center font-medium text-[#8A8F98]">sort</th>
                <th className="px-4 py-3 text-center font-medium text-[#8A8F98]">Owner Only</th>
                <th className="px-4 py-3 text-center font-medium text-[#8A8F98]">state</th>
                <th className="px-5 py-3 text-right font-medium text-[#8A8F98]">operate</th>
              </tr>
            </thead>
            <tbody>
              {productList.map((p, idx) => (
                <tr
                  key={p.symbol}
                  className={`border-b border-white/[0.04] transition-colors duration-150 hover:bg-white/[0.02] ${
                    !p.enabled ? 'opacity-50' : ''
                  } ${idx === productList.length - 1 ? 'border-b-0' : ''}`}
                >
                  <td className="px-5 py-4 font-mono font-semibold text-[#EDEDEF]">{p.symbol}</td>
                  <td className="px-5 py-4 text-[#EDEDEF]">{p.name_zh}</td>
                  <td className="px-5 py-4 text-[#8A8F98] text-xs">{p.name}</td>
                  <td className="px-4 py-4 text-center font-mono text-[#EDEDEF]">{p.tick_size}</td>
                  <td className="px-4 py-4 text-center font-mono text-[#EDEDEF]">${p.point_value}</td>
                  <td className="px-4 py-4 text-center font-mono text-[#EDEDEF]">{p.price_step}</td>
                  <td className="px-4 py-4 text-center text-[#8A8F98]">{p.sort_order}</td>
                  <td className="px-4 py-4 text-center">
                    {p.owner_only ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Owner
                      </span>
                    ) : (
                      <span className="text-white/20 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.enabled
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-white/[0.04] text-[#8A8F98] border border-white/[0.08]'
                      }`}
                    >
                      {p.enabled ? 'enable' : 'deactivate'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(p)}
                        className="px-3 py-1 text-xs rounded-md bg-white/[0.06] hover:bg-white/[0.10] text-[#EDEDEF] transition-colors duration-150"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => handleToggleEnabled(p)}
                        className="px-3 py-1 text-xs rounded-md bg-white/[0.06] hover:bg-white/[0.10] text-[#8A8F98] transition-colors duration-150"
                      >
                        {p.enabled ? 'deactivate' : 'enable'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(p)}
                        className="px-3 py-1 text-xs rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors duration-150"
                      >
                        delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {modalOpen && (
        <ProductFormModal
          product={editTarget}
          onClose={() => setModalOpen(false)}
          onSave={fetchProducts}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 bg-[#0D0D0F] border border-white/[0.08] rounded-xl shadow-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[#EDEDEF]">Confirm deletion</h2>
            <p className="text-[#8A8F98] text-sm">
              Confirm you want to delete the product<span className="text-white font-medium">{deleteConfirm.symbol}</span> ({deleteConfirm.name_zh})??
              Use this product if you already have trades or fee settings, will not be able to be deleted.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDelete(deleteConfirm)}
              >
                Confirm deletion
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
