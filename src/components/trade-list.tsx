'use client';

import { useCallback, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { Trade, Strategy } from '@/types';
import { getTradesByDate } from '@/lib/actions/trades';
import { apiDelete, apiGet, apiPatch } from '@/lib/api-client';
import {
  formatDateTime,
  getPnLColor,
  getFeeByBroker,
} from '@/lib/utils';
import { getProductConfig } from '@/lib/products';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────

interface GroupedTrade {
  groupKey: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  date: string;
  trades: Trade[];

  // Aggregated
  totalQty: number;
  entryTimeFirst: string;
  entryTimeLast: string;
  entryPriceMin: number;
  entryPriceMax: number;
  entryPriceAvg: number; // VWAP

  exitTimeFirst: string | null;
  exitTimeLast: string | null;
  exitPriceMin: number | null;
  exitPriceMax: number | null;
  exitPriceAvg: number | null; // VWAP

  totalPnlPoints: number;
  totalFee: number;
  totalPnlAmount: number;

  // From first trade (group-level plan fields)
  slPrice: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  fuelTop: number | null;
  fuelBottom: number | null;
  fuel: number | null;
  strategy: string | null;
  notes: string | null;
  broker: string | null;
}

// ─── Props ────────────────────────────────────────────────────

interface TradeListProps {
  date: string;
  onEdit?: (trade: Trade) => void;
  onRefresh?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────

function groupTrades(trades: Trade[]): GroupedTrade[] {
  const groupMap = new Map<string, Trade[]>();

  for (const trade of trades) {
    const key = trade.trade_group_id ?? trade.id ?? `${trade.date}_${trade.entry_time}`;
    const bucket = groupMap.get(key);
    if (bucket) {
      bucket.push(trade);
    } else {
      groupMap.set(key, [trade]);
    }
  }

  const groups: GroupedTrade[] = [];

  for (const [groupKey, groupTrades] of groupMap) {
    const first = groupTrades[0];
    const symbol = first.symbol ?? 'MNQ';
    const side = first.side;
    const broker = first.broker ?? 'Manual';

    // Sort trades by entry_time ascending within group
    const sorted = [...groupTrades].sort((a, b) =>
      a.entry_time.localeCompare(b.entry_time)
    );

    // VWAP entry
    let entryQtySum = 0;
    let entryVwapSum = 0;
    let entryPriceMin = Infinity;
    let entryPriceMax = -Infinity;
    const entryTimes: string[] = [];

    for (const t of sorted) {
      const qty = t.qty;
      entryQtySum += qty;
      entryVwapSum += t.entry_price * qty;
      if (t.entry_price < entryPriceMin) entryPriceMin = t.entry_price;
      if (t.entry_price > entryPriceMax) entryPriceMax = t.entry_price;
      entryTimes.push(t.entry_time);
    }
    const entryPriceAvg = entryQtySum > 0 ? entryVwapSum / entryQtySum : 0;

    // VWAP exit (only closed trades)
    const closedTrades = sorted.filter(t => t.exit_price != null && t.exit_time != null);
    let exitQtySum = 0;
    let exitVwapSum = 0;
    let exitPriceMin: number | null = null;
    let exitPriceMax: number | null = null;
    const exitTimes: string[] = [];

    for (const t of closedTrades) {
      const qty = t.qty;
      const price = t.exit_price!;
      exitQtySum += qty;
      exitVwapSum += price * qty;
      if (exitPriceMin === null || price < exitPriceMin) exitPriceMin = price;
      if (exitPriceMax === null || price > exitPriceMax) exitPriceMax = price;
      exitTimes.push(t.exit_time!);
    }
    const exitPriceAvg = exitQtySum > 0 ? exitVwapSum / exitQtySum : null;

    // PnL
    const pointValue = getProductConfig(symbol).pointValue;
    let totalPnlPoints = 0;
    let totalFee = 0;

    for (const t of sorted) {
      if (t.exit_price != null) {
        const pts = side === 'LONG'
          ? (t.exit_price - t.entry_price) * t.qty
          : (t.entry_price - t.exit_price) * t.qty;
        totalPnlPoints += pts;
      }
      const brokerForTrade = t.broker ?? broker;
      const fee = brokerForTrade === 'Manual'
        ? getFeeByBroker(brokerForTrade, t.symbol) * t.qty
        : (t.fee ?? (getFeeByBroker(brokerForTrade, t.symbol) * t.qty));
      totalFee += fee;
    }

    const totalPnlAmount = Math.round((totalPnlPoints * pointValue - totalFee) * 100) / 100;

    groups.push({
      groupKey,
      symbol,
      side,
      date: first.date,
      trades: sorted,
      totalQty: entryQtySum,
      entryTimeFirst: entryTimes[0] ?? '',
      entryTimeLast: entryTimes[entryTimes.length - 1] ?? '',
      entryPriceMin,
      entryPriceMax,
      entryPriceAvg,
      exitTimeFirst: exitTimes.length > 0 ? exitTimes[0] : null,
      exitTimeLast: exitTimes.length > 0 ? exitTimes[exitTimes.length - 1] : null,
      exitPriceMin,
      exitPriceMax,
      exitPriceAvg,
      totalPnlPoints: Math.round(totalPnlPoints * 100) / 100,
      totalFee: Math.round(totalFee * 100) / 100,
      totalPnlAmount,
      slPrice: first.sl_price ?? null,
      tp1: first.tp1 ?? null,
      tp2: first.tp2 ?? null,
      tp3: first.tp3 ?? null,
      fuelTop: first.fuel_top ?? null,
      fuelBottom: first.fuel_bottom ?? null,
      fuel: first.fuel ?? null,
      strategy: first.strategy ?? null,
      notes: first.notes ?? null,
      broker,
    });
  }

  // Sort groups: date desc, then entry_time desc
  groups.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return b.entryTimeFirst.localeCompare(a.entryTimeFirst);
  });

  return groups;
}

// ─── Sub-components ───────────────────────────────────────────

function RMultipleBadge({ group }: { group: GroupedTrade }) {
  if (!group.slPrice || group.exitPriceAvg === null) return null;
  const riskPts = group.side === 'LONG'
    ? Math.abs(group.entryPriceAvg - group.slPrice)
    : Math.abs(group.slPrice - group.entryPriceAvg);
  if (riskPts <= 0) return null;
  const rewardPts = Math.abs(group.totalPnlPoints / group.totalQty);
  const r = Math.round((rewardPts / riskPts) * 100) / 100;
  return (
    <span className="text-xs text-muted-foreground">
      {r >= 0 ? '+' : ''}{r}R
    </span>
  );
}

interface DrillDownProps {
  group: GroupedTrade;
  onEdit: (trade: Trade) => void;
}

function DrillDown({ group, onEdit }: DrillDownProps) {
  return (
    <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3 text-xs">
      {/* Entry fills */}
      <div>
        <div className="text-muted-foreground mb-1 font-medium">進場 ({group.trades.length} 筆)：</div>
        <div className="space-y-1 pl-2">
          {group.trades.map((t) => (
            <div key={`entry-${t.id}`} className="flex items-center gap-3 text-foreground/80">
              <span className="tabular-nums">{formatDateTime(t.entry_time)}</span>
              <span className="tabular-nums font-medium">{t.entry_price.toLocaleString()}</span>
              <span>{t.qty} 口</span>
              <Button
                size="sm"
                variant="outline"
                className="h-5 px-2 text-xs py-0"
                onClick={() => onEdit(t)}
              >
                編輯
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Exit fills */}
      {group.trades.some(t => t.exit_price != null) && (
        <div>
          <div className="text-muted-foreground mb-1 font-medium">
            出場 ({group.trades.filter(t => t.exit_price != null).length} 筆)：
          </div>
          <div className="space-y-1 pl-2">
            {group.trades
              .filter(t => t.exit_price != null && t.exit_time != null)
              .sort((a, b) => (a.exit_time ?? '').localeCompare(b.exit_time ?? ''))
              .map((t) => (
                <div key={`exit-${t.id}`} className="flex items-center gap-3 text-foreground/80">
                  <span className="tabular-nums">{formatDateTime(t.exit_time!)}</span>
                  <span className="tabular-nums font-medium">{t.exit_price!.toLocaleString()}</span>
                  <span>{t.qty} 口</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface GroupCardProps {
  group: GroupedTrade;
  onEdit: (trade: Trade) => void;
  onDeleteGroup: (group: GroupedTrade) => void;
  isOwner: boolean;
  strategies: Strategy[];
  onStrategyChange: (groupKey: string, strategy: string | null) => void;
  onNotesChange: (groupKey: string, notes: string | null) => void;
}

function GroupCard({ group, onEdit, onDeleteGroup, isOwner, strategies, onStrategyChange, onNotesChange }: GroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [strategyUpdating, setStrategyUpdating] = useState(false);
  // 備注編輯狀態：追蹤本地草稿（localNotes），供 onBlur 時比較是否有變動
  const [localNotes, setLocalNotes] = useState(group.notes ?? '');

  // M2：group.notes prop 更新後（fetchTrades 重抓）同步草稿，避免 stale draft
  useEffect(() => {
    setLocalNotes(group.notes ?? '');
  }, [group.notes]);
  const isMulti = group.trades.length > 1;
  const isClosed = group.exitPriceAvg !== null;
  const pnlColor = getPnLColor(group.totalPnlAmount);

  const entryLabel = group.entryPriceMin === group.entryPriceMax
    ? group.entryPriceAvg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : `${group.entryPriceMin.toLocaleString()} ~ ${group.entryPriceMax.toLocaleString()} (avg ${group.entryPriceAvg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;

  const exitLabel = !isClosed
    ? '未平倉'
    : group.exitPriceMin === group.exitPriceMax
      ? group.exitPriceAvg!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : `${group.exitPriceMin!.toLocaleString()} ~ ${group.exitPriceMax!.toLocaleString()} (avg ${group.exitPriceAvg!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;

  const hasTP = group.tp1 || group.tp2 || group.tp3;
  const tpLabel = [group.tp1, group.tp2, group.tp3]
    .filter(Boolean)
    .join(' / ');

  const timeRange = group.entryTimeFirst === group.entryTimeLast
    ? formatDateTime(group.entryTimeFirst).split(' ')[1] ?? formatDateTime(group.entryTimeFirst)
    : `${formatDateTime(group.entryTimeFirst).split(' ')[1] ?? formatDateTime(group.entryTimeFirst)} ~ ${formatDateTime(group.entryTimeLast).split(' ')[1] ?? formatDateTime(group.entryTimeLast)}`;

  return (
    <div className="border border-white/[0.06] rounded-2xl p-4 space-y-3 bg-gradient-to-b from-white/[0.04] to-white/[0.01] transition-all duration-200 hover:border-white/[0.10] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_4px_20px_rgba(0,0,0,0.3)]">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Symbol badge */}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
            group.symbol === 'NQ'
              ? 'bg-orange-900/20 text-orange-400 border-orange-500/30'
              : group.symbol === 'SIL'
                ? 'bg-slate-900/20 text-slate-400 border-slate-500/30'
                : 'bg-blue-900/20 text-blue-400 border-blue-500/30'
          }`}>
            {group.symbol}
          </span>
          {/* Side badge */}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
            group.side === 'LONG'
              ? 'bg-green-900/20 text-green-400 border-green-500/30'
              : 'bg-red-900/20 text-red-400 border-red-500/30'
          }`}>
            {group.side}
          </span>
          {/* Time + qty */}
          <span className="text-sm text-muted-foreground">
            {timeRange} &nbsp;·&nbsp; {group.totalQty} 口
          </span>
          {/* Strategy */}
          {isOwner ? (
            <select
              disabled={strategyUpdating}
              value={group.strategy ?? ''}
              onChange={async (e) => {
                const newStrategy = e.target.value === '' ? null : e.target.value;
                setStrategyUpdating(true);
                try {
                  await apiPatch(`/api/trade-groups/${group.groupKey}`, { strategy: newStrategy });
                  onStrategyChange(group.groupKey, newStrategy);
                  toast.success('策略已更新');
                } catch (err) {
                  toast.error(`更新失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
                } finally {
                  setStrategyUpdating(false);
                }
              }}
              className="text-xs rounded-full px-2 py-0.5 border border-indigo-500/30 bg-indigo-900/20 text-indigo-400 cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            >
              <option value="">無策略</option>
              {strategies.map(s => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
              {/* 若現有策略不在 enabled 清單（已停用），仍補回 */}
              {group.strategy && !strategies.find(s => s.name === group.strategy) && (
                <option value={group.strategy}>{group.strategy} (已停用)</option>
              )}
            </select>
          ) : (
            group.strategy && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-900/20 text-indigo-400 border border-indigo-500/30">
                {group.strategy}
              </span>
            )
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!isMulti && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs"
              onClick={() => onEdit(group.trades[0])}
            >
              編輯
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            className="h-7 px-3 text-xs"
            onClick={() => onDeleteGroup(group)}
          >
            刪除
          </Button>
        </div>
      </div>

      {/* Price info row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">進場</div>
          <div className="font-medium tabular-nums">{entryLabel}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">出場</div>
          <div className="font-medium tabular-nums">{exitLabel}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">盈虧</div>
          {isClosed ? (
            <div className="space-y-0.5">
              <div className={`font-medium tabular-nums ${pnlColor}`}>
                {group.totalPnlAmount.toLocaleString(undefined, { style: 'currency', currency: 'USD', signDisplay: 'always' })}
              </div>
              <div className={`text-xs tabular-nums ${pnlColor}`}>
                {group.totalPnlPoints >= 0 ? '+' : ''}{group.totalPnlPoints} pt
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">—</div>
          )}
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">手續費</div>
          <div className="font-medium tabular-nums">${group.totalFee.toFixed(2)}</div>
          {isClosed && <RMultipleBadge group={group} />}
        </div>
      </div>

      {/* Plan row */}
      {(group.slPrice || hasTP) && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {group.slPrice && (
            <span>
              <span className="text-red-400/80">SL</span> {group.slPrice.toLocaleString()}
            </span>
          )}
          {hasTP && (
            <span>
              <span className="text-green-400/80">TP</span> {tpLabel}
            </span>
          )}
        </div>
      )}

      {/* Fuel zone */}
      {(group.fuelTop || group.fuelBottom) && (
        <div className="text-xs text-muted-foreground">
          <span>燃料區: {group.fuelBottom} — {group.fuelTop}</span>
          {group.fuel && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-white/[0.05] font-medium text-foreground/70">
              {group.fuel} pt
            </span>
          )}
        </div>
      )}

      {/* Notes */}
      {isOwner ? (
        // Owner：可編輯 textarea，失焦時若內容有變動才 PATCH（SPEC §4.2）
        <div className="border-t border-white/[0.04] pt-2">
          <textarea
            className="w-full text-xs text-muted-foreground bg-transparent resize-none placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/10 rounded px-1 py-0.5"
            placeholder="新增備注…"
            rows={2}
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={async () => {
              // 正規化：空字串視同 null，跟原值比較
              const originalNotes = group.notes ?? '';
              if (localNotes === originalNotes) return;
              const newNotes = localNotes.trim() !== '' ? localNotes.trim() : null;
              try {
                await apiPatch(`/api/trade-groups/${group.groupKey}`, { notes: newNotes });
                // M3：PATCH 成功後同步本地 trades state（比照 strategy 的 handleStrategyChange）
                onNotesChange(group.groupKey, newNotes);
                toast.success('備注已更新');
              } catch (err) {
                toast.error(`備注更新失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
                // 更新失敗時還原草稿
                setLocalNotes(originalNotes);
              }
            }}
          />
        </div>
      ) : (
        // Viewer：唯讀顯示（有 notes 才顯示）
        group.notes && (
          <div className="text-xs text-muted-foreground border-t border-white/[0.04] pt-2">
            {group.notes}
          </div>
        )
      )}

      {/* Drill-down toggle */}
      <div className="pt-1">
        {isMulti ? (
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors duration-200"
          >
            <span
              className="inline-block transition-transform duration-200 ease-out"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              ▼
            </span>
            {expanded ? '收合細部' : `展開 ${group.trades.length} 筆細部`}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground/50 select-none">僅 1 筆</span>
        )}
      </div>

      {/* Drill-down content */}
      <div
        className="overflow-hidden transition-all duration-250 ease-out"
        style={{
          maxHeight: expanded ? '600px' : '0px',
          opacity: expanded ? 1 : 0,
          transition: 'max-height 250ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease-out',
        }}
      >
        {expanded && (
          <DrillDown group={group} onEdit={onEdit} />
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export function TradeList({ date, onEdit, onRefresh }: TradeListProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const { isOwner } = useAuth();

  const fetchTrades = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getTradesByDate(date);
      setTrades(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  useEffect(() => {
    apiGet<Strategy[]>('/api/strategies?enabled=1')
      .then(rows => setStrategies(rows))
      .catch(() => setStrategies([]));
  }, []);

  const handleStrategyChange = (groupKey: string, strategy: string | null) => {
    setTrades(prev =>
      prev.map(t =>
        (t.trade_group_id ?? t.id) === groupKey
          ? { ...t, strategy: strategy ?? undefined }
          : t
      )
    );
  };

  // M3：備注 PATCH 成功後同步本地 trades state（比照 handleStrategyChange）
  const handleNotesChange = (groupKey: string, notes: string | null) => {
    setTrades(prev =>
      prev.map(t =>
        (t.trade_group_id ?? t.id) === groupKey
          ? { ...t, notes: notes ?? undefined }
          : t
      )
    );
  };

  const handleDeleteGroup = async (group: GroupedTrade) => {
    const count = group.trades.length;
    const confirmMsg = count > 1
      ? `確定要刪除此群組的 ${count} 筆交易紀錄嗎？`
      : '確定要刪除此交易紀錄嗎？';
    if (!confirm(confirmMsg)) return;

    try {
      await apiDelete(`/api/trade-groups/${group.groupKey}`);

      // Remove deleted trades from local state
      const deletedIds = new Set(group.trades.map(t => t.id).filter(Boolean));
      setTrades(prev => prev.filter(t => !deletedIds.has(t.id)));

      onRefresh?.();
      toast.success(count > 1 ? `已刪除 ${count} 筆交易紀錄` : '交易記錄已成功刪除');
    } catch (err) {
      toast.error(`刪除失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <Loading size="lg" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center space-y-2">
            <p className="text-destructive">載入失敗: {error}</p>
            <Button variant="outline" onClick={fetchTrades}>
              重新載入
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const groups = groupTrades(trades);

  return (
    <Card>
      <CardHeader>
        <CardTitle>今日交易清單</CardTitle>
        <CardDescription>
          {groups.length} 筆交易紀錄（{trades.length} 個 fills）
        </CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            今日尚未有交易紀錄
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <GroupCard
                key={group.groupKey}
                group={group}
                onEdit={onEdit ?? (() => {})}
                onDeleteGroup={handleDeleteGroup}
                isOwner={isOwner}
                strategies={strategies}
                onStrategyChange={handleStrategyChange}
                onNotesChange={handleNotesChange}
              />
            ))}
          </div>
        )}

        {/* Refresh Button */}
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <Button variant="outline" onClick={fetchTrades}>
            重新載入
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
