'use client';

import { useState, useEffect } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Strategy } from '@/types';
import { STRATEGY_COLOR_PALETTE } from '@/lib/strategy-colors';

interface StrategyFormModalProps {
  strategy?: Strategy | null;
  onClose: () => void;
  onSave: (data: Partial<Strategy>) => Promise<void>;
}

export function StrategyFormModal({ strategy, onClose, onSave }: StrategyFormModalProps) {
  const isEdit = !!strategy;
  const [name, setName] = useState(strategy?.name ?? '');
  const [color, setColor] = useState(strategy?.color ?? '#5E6AD2');
  const [sortOrder, setSortOrder] = useState(strategy?.sort_order ?? 0);
  const [isDefault, setIsDefault] = useState(strategy?.is_default ?? false);
  const [enabled, setEnabled] = useState(strategy?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (strategy) {
      setName(strategy.name);
      setColor(strategy.color);
      setSortOrder(strategy.sort_order);
      setIsDefault(strategy.is_default);
      setEnabled(strategy.enabled);
    }
  }, [strategy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('策略名稱不得為空');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        color,
        sort_order: sortOrder,
        is_default: isDefault,
        ...(isEdit ? { enabled } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0F1117] border border-white/[0.08] rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-5 text-[#EDEDEF]">
          {isEdit ? '編輯策略' : '新增策略'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="strategy-name">策略名稱</Label>
            <Input
              id="strategy-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例：STAR"
              disabled={saving}
            />
          </div>

          <div>
            <Label>顏色</Label>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {STRATEGY_COLOR_PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full border-2 transition-all duration-150 flex-shrink-0"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? '#fff' : 'transparent',
                    boxShadow: color === c ? `0 0 0 2px ${c}55` : 'none',
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="sort-order">排序</Label>
            <Input
              id="sort-order"
              type="number"
              value={sortOrder}
              onChange={e => setSortOrder(parseInt(e.target.value, 10) || 0)}
              disabled={saving}
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="is-default"
              type="checkbox"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              disabled={saving}
              className="w-4 h-4 rounded accent-[#5E6AD2]"
            />
            <Label htmlFor="is-default" className="cursor-pointer">
              設為預設策略
              {isDefault && (
                <span className="ml-2 text-xs text-[#F59E0B]">（會取消其他策略的預設）</span>
              )}
            </Label>
          </div>

          {isEdit && (
            <div className="flex items-center gap-3">
              <input
                id="enabled"
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                disabled={saving}
                className="w-4 h-4 rounded accent-[#5E6AD2]"
              />
              <Label htmlFor="enabled" className="cursor-pointer">啟用策略</Label>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? '儲存中...' : '儲存'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              取消
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
