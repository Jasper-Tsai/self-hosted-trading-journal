'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from './button';
import { StrategyFormModal } from './strategy-form-modal';
import { Strategy } from '@/types';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import toast from 'react-hot-toast';

export function StrategyManager() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Strategy | null>(null);

  const fetchStrategies = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await apiGet<Strategy[]>('/api/strategies');
      setStrategies(rows);
    } catch {
      toast.error('載入策略失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const handleAdd = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const handleEdit = (s: Strategy) => {
    setEditTarget(s);
    setModalOpen(true);
  };

  const handleSave = async (data: Partial<Strategy>) => {
    if (editTarget) {
      await apiPatch(`/api/strategies/${editTarget.id}`, data);
      toast.success('策略已更新');
    } else {
      await apiPost('/api/strategies', data);
      toast.success('策略已新增');
    }
    await fetchStrategies();
  };

  const handleDisable = async (s: Strategy) => {
    try {
      await apiDelete(`/api/strategies/${s.id}`);
      toast.success(`「${s.name}」已停用`);
      await fetchStrategies();
    } catch {
      toast.error('操作失敗');
    }
  };

  const handleEnable = async (s: Strategy) => {
    try {
      await apiPatch(`/api/strategies/${s.id}`, { enabled: true });
      toast.success(`「${s.name}」已啟用`);
      await fetchStrategies();
    } catch {
      toast.error('操作失敗');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleAdd}>新增策略</Button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">載入中...</div>
      ) : (
        <div className="border border-white/[0.06] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">排序</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">名稱</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">顏色</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">預設</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">狀態</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map(s => (
                <tr
                  key={s.id}
                  className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${!s.enabled ? 'opacity-50' : ''}`}
                >
                  <td className="py-3 px-4 text-muted-foreground">{s.sort_order}</td>
                  <td className="py-3 px-4">
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold"
                      style={{
                        backgroundColor: `${s.color}33`,
                        color: s.color,
                      }}
                    >
                      {s.name}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full inline-block"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-muted-foreground font-mono text-xs">{s.color}</span>
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {s.is_default ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#5E6AD2]/20 text-[#A5B4FC]">預設</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {s.enabled ? (
                      <span className="text-xs text-green-400">啟用</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">已停用</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(s)}>
                        編輯
                      </Button>
                      {s.enabled ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDisable(s)}
                          className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                        >
                          停用
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEnable(s)}
                          className="text-green-400 border-green-400/30 hover:bg-green-400/10"
                        >
                          啟用
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {strategies.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    尚無策略，點擊「新增策略」開始
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <StrategyFormModal
          strategy={editTarget}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
