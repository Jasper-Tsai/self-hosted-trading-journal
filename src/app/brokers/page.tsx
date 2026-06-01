'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AccessDenied } from '@/components/access-denied';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import toast from 'react-hot-toast';

interface BrokerRecord {
  id: string;
  name: string;
  enabled: boolean;
  sort_order: number;
  fees: Record<string, number>;
}

async function apiDeleteReq(path: string): Promise<void> {
  await apiDelete(path);
}

// ─── BrokerFormModal ──────────────────────────────────────────

interface BrokerFormModalProps {
  broker: BrokerRecord | null;
  symbols: string[];
  onClose: () => void;
  onSave: () => void;
}

function BrokerFormModal({ broker, symbols, onClose, onSave }: BrokerFormModalProps) {
  const [name, setName] = useState(broker?.name ?? '');
  const [sortOrder, setSortOrder] = useState(String(broker?.sort_order ?? 0));
  const [fees, setFees] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const sym of symbols) {
      init[sym] = broker?.fees[sym] != null ? String(broker.fees[sym]) : '';
    }
    return init;
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('券商名稱不得為空');
      return;
    }

    const feesPayload: Record<string, number> = {};
    for (const [sym, val] of Object.entries(fees)) {
      const num = parseFloat(val);
      if (!isNaN(num) && num >= 0) feesPayload[sym] = num;
    }

    setSaving(true);
    try {
      if (broker) {
        await apiPatch(`/api/brokers/${encodeURIComponent(broker.id)}`, {
          name: name.trim(),
          sort_order: parseInt(sortOrder) || 0,
          fees: feesPayload,
        });
        toast.success('券商已更新');
      } else {
        await apiPost('/api/brokers', {
          name: name.trim(),
          sort_order: parseInt(sortOrder) || 0,
          fees: feesPayload,
        });
        toast.success('券商已新增');
      }
      onSave();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-[#0D0D0F] border border-white/[0.08] rounded-xl shadow-2xl">
        <div className="px-6 py-5 border-b border-white/[0.06]">
          <h2 className="text-lg font-semibold text-[#EDEDEF]">
            {broker ? '編輯券商' : '新增券商'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="broker-name">券商名稱</Label>
              <Input
                id="broker-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="例：IB"
                required
              />
            </div>
            <div>
              <Label htmlFor="broker-sort">排序</Label>
              <Input
                id="broker-sort"
                type="number"
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-[#8A8F98] mb-3">每口手續費 (USD)　空白 = 未設定</p>
            <div className="grid grid-cols-3 gap-3">
              {symbols.map(sym => (
                <div key={sym}>
                  <Label htmlFor={`fee-${sym}`}>{sym}</Label>
                  <Input
                    id={`fee-${sym}`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="—"
                    value={fees[sym]}
                    onChange={e => setFees(prev => ({ ...prev, [sym]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '儲存中...' : '儲存'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── BrokerManager (主元件) ───────────────────────────────────

export default function BrokersPage() {
  const { isOwner, loading: authLoading } = useAuth();
  const [brokers, setBrokers] = useState<BrokerRecord[]>([]);
  const [symbols, setSymbols] = useState<string[]>(['MNQ', 'NQ', 'SIL']);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BrokerRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<BrokerRecord | null>(null);

  const fetchSymbols = useCallback(async () => {
    try {
      const res = await fetch('/api/products?all=1');
      if (res.ok) {
        const rows: Array<{ symbol: string; enabled: boolean }> = await res.json();
        const syms = rows.filter(r => r.enabled).map(r => r.symbol);
        if (syms.length > 0) setSymbols(syms);
      }
    } catch {
      // 保持 fallback ['MNQ', 'NQ', 'SIL']
    }
  }, []);

  const fetchBrokers = useCallback(async () => {
    try {
      setLoading(true);
      // 呼叫不過濾 enabled 的版本（讓 owner 看全部）
      const res = await fetch('/api/brokers?all=1');
      if (!res.ok) throw new Error(await res.text());
      const rows: BrokerRecord[] = await res.json();
      setBrokers(rows);
    } catch {
      toast.error('載入券商失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOwner) {
      fetchSymbols();
      fetchBrokers();
    }
  }, [isOwner, fetchSymbols, fetchBrokers]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <span className="text-[#8A8F98]">載入中...</span>
      </div>
    );
  }

  if (!isOwner) return <AccessDenied />;

  const handleAdd = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const handleEdit = (b: BrokerRecord) => {
    setEditTarget(b);
    setModalOpen(true);
  };

  const handleToggleEnabled = async (b: BrokerRecord) => {
    try {
      await apiPatch(`/api/brokers/${encodeURIComponent(b.id)}`, { enabled: !b.enabled });
      toast.success(b.enabled ? `「${b.name}」已停用` : `「${b.name}」已啟用`);
      await fetchBrokers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失敗');
    }
  };

  const handleDelete = async (b: BrokerRecord) => {
    try {
      await apiDeleteReq(`/api/brokers/${encodeURIComponent(b.id)}`);
      toast.success(`「${b.name}」已刪除`);
      setDeleteConfirm(null);
      await fetchBrokers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '刪除失敗');
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">
            券商管理
          </h1>
          <p className="text-[#8A8F98] mt-1">
            管理券商清單及各商品的每口手續費
          </p>
        </div>
        <Button onClick={handleAdd}>新增券商</Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0D0D0F] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#8A8F98]">載入中...</div>
        ) : brokers.length === 0 ? (
          <div className="p-8 text-center text-[#8A8F98]">尚無券商，點選右上角「新增券商」</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-5 py-3 text-left font-medium text-[#8A8F98]">名稱</th>
                <th className="px-5 py-3 text-center font-medium text-[#8A8F98]">排序</th>
                <th className="px-5 py-3 text-center font-medium text-[#8A8F98]">狀態</th>
                {symbols.map(sym => (
                  <th key={sym} className="px-4 py-3 text-center font-medium text-[#8A8F98]">
                    {sym} 手續費
                  </th>
                ))}
                <th className="px-5 py-3 text-right font-medium text-[#8A8F98]">操作</th>
              </tr>
            </thead>
            <tbody>
              {brokers.map((b, idx) => (
                <tr
                  key={b.id}
                  className={`border-b border-white/[0.04] transition-colors duration-150 hover:bg-white/[0.02] ${
                    !b.enabled ? 'opacity-50' : ''
                  } ${idx === brokers.length - 1 ? 'border-b-0' : ''}`}
                >
                  <td className="px-5 py-4 font-medium text-[#EDEDEF]">{b.name}</td>
                  <td className="px-5 py-4 text-center text-[#8A8F98]">{b.sort_order}</td>
                  <td className="px-5 py-4 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        b.enabled
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-white/[0.04] text-[#8A8F98] border border-white/[0.08]'
                      }`}
                    >
                      {b.enabled ? '啟用' : '停用'}
                    </span>
                  </td>
                  {symbols.map(sym => (
                    <td key={sym} className="px-4 py-4 text-center font-mono text-[#EDEDEF]">
                      {b.fees[sym] != null ? `$${b.fees[sym].toFixed(2)}` : (
                        <span className="text-white/20">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(b)}
                        className="px-3 py-1 text-xs rounded-md bg-white/[0.06] hover:bg-white/[0.10] text-[#EDEDEF] transition-colors duration-150"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => handleToggleEnabled(b)}
                        className="px-3 py-1 text-xs rounded-md bg-white/[0.06] hover:bg-white/[0.10] text-[#8A8F98] transition-colors duration-150"
                      >
                        {b.enabled ? '停用' : '啟用'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(b)}
                        className="px-3 py-1 text-xs rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors duration-150"
                      >
                        刪除
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
        <BrokerFormModal
          broker={editTarget}
          symbols={symbols}
          onClose={() => setModalOpen(false)}
          onSave={fetchBrokers}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 bg-[#0D0D0F] border border-white/[0.08] rounded-xl shadow-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[#EDEDEF]">確認刪除</h2>
            <p className="text-[#8A8F98] text-sm">
              確定要刪除券商「<span className="text-white font-medium">{deleteConfirm.name}</span>」嗎？
              若已有交易紀錄使用此券商，將無法刪除。
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDelete(deleteConfirm)}
              >
                確認刪除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
