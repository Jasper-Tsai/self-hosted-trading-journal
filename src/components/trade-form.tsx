'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { LoadingOverlay } from '@/components/ui/loading';
import { Trade, TradeSide, Broker, Symbol } from '@/types';
import { createTrade, updateTrade } from '@/lib/actions/trades';
import { apiGet, apiPost } from '@/lib/api-client';
import { calculatePnL, calculatePnLAmount, getCurrentTaipeiDateTime } from '@/lib/utils';
import type { Broker as BrokerRecord } from '@/lib/actions/brokers';
import { useAuth } from '@/contexts/AuthContext';
import { getProductConfig, updateProductCache } from '@/lib/products';
import toast from 'react-hot-toast';

// ─── Multi-entry / multi-exit types ─────────────────────────────────────────

export interface EntryRow {
  id: string;
  entry_time: string;
  entry_price: string;
  qty: string;
  fee: string;
}

interface ExitRow {
  id: string;
  exit_time: string;
  exit_price: string;
  qty: string;
  fee: string;
}

function makeEntryRow(defaultTime: string): EntryRow {
  return {
    id: crypto.randomUUID(),
    entry_time: defaultTime,
    entry_price: '',
    qty: '1',
    fee: '',
  };
}

function makeExitRow(defaultTime: string): ExitRow {
  return {
    id: crypto.randomUUID(),
    exit_time: defaultTime,
    exit_price: '',
    qty: '1',
    fee: '',
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate trade_group_id for manual multi-exit trades */
export function generateTradeGroupId(symbol: string, date: string): string {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `MANUAL_${symbol}_${date}_${suffix}`;
}

/** Compute per-row fee share: proportional entry fee + own exit fee */
export function computeRowFee(
  entryFeeTotal: number,
  rowQty: number,
  totalQty: number,
  rowExitFee: number,
): number {
  const entryShare = totalQty > 0 ? (entryFeeTotal * rowQty) / totalQty : 0;
  return entryShare + rowExitFee;
}

/** FIFO matching result row */
export interface FifoTradeRow {
  entry_time: string;
  entry_price: number;
  entry_fee_share: number;
  exit_time: string;
  exit_price: number;
  exit_fee_share: number;
  qty: number;
  fee: number;
}

/**
 * Largest-remainder cents allocation.
 * Given N raw (fractional) fee values, return integer-cents arrays that
 * sum exactly to totalCentsTarget (= Math.round(sum(rawFees) * 100)).
 * This guarantees sum(result) === totalCentsTarget with no drift.
 */
export function allocateCents(rawFees: number[], totalCentsTarget: number): number[] {
  const floors = rawFees.map(f => Math.floor(f * 100));
  const floorSum = floors.reduce((s, x) => s + x, 0);
  const remainder = totalCentsTarget - floorSum;
  const fracs = rawFees.map((f, i) => ({ i, frac: (f * 100) - Math.floor(f * 100) }));
  fracs.sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder && k < fracs.length; k++) {
    result[fracs[k].i] += 1;
  }
  return result;
}

/**
 * FIFO match N entry rows against M exit rows.
 * Returns an array of trade rows (len <= N+M-1).
 * Assumes sum(entry qty) === sum(exit qty) — caller must validate first.
 * Fee is allocated via largest-remainder so sum(row.fee) === sum(entry fees) + sum(exit fees)
 * with no cents drift.
 */
export function fifoMatchTrades(
  entries: Array<{ entry_time: string; entry_price: number; qty: number; fee: number }>,
  exits: Array<{ exit_time: string; exit_price: number; qty: number; fee: number }>,
): FifoTradeRow[] {
  // Mutable queues with remainQty
  const entryQueue = entries.map(e => ({ ...e, remainQty: e.qty }));

  // First pass: collect raw (unrounded) fee per row
  interface RawRow {
    entry_time: string;
    entry_price: number;
    exit_time: string;
    exit_price: number;
    qty: number;
    rawEntryFee: number;
    rawExitFee: number;
  }
  const rawRows: RawRow[] = [];

  let ei = 0;
  for (const exit of exits) {
    let remainExit = exit.qty;
    while (remainExit > 0 && ei < entryQueue.length) {
      const entry = entryQueue[ei];
      const matchedQty = Math.min(entry.remainQty, remainExit);
      const rawEntryFee = entry.qty > 0 ? (entry.fee / entry.qty) * matchedQty : 0;
      const rawExitFee = exit.qty > 0 ? (exit.fee / exit.qty) * matchedQty : 0;

      rawRows.push({
        entry_time: entry.entry_time,
        entry_price: entry.entry_price,
        exit_time: exit.exit_time,
        exit_price: exit.exit_price,
        qty: matchedQty,
        rawEntryFee,
        rawExitFee,
      });

      entry.remainQty -= matchedQty;
      remainExit -= matchedQty;
      if (entry.remainQty === 0) ei++;
    }
  }

  // Second pass: apply largest-remainder to entry fees and exit fees separately,
  // then sum for each row.  Targets are the exact integer-cent totals of each pool.
  const totalEntryCents = Math.round(entries.reduce((s, e) => s + e.fee, 0) * 100);
  const totalExitCents  = Math.round(exits.reduce((s, e) => s + e.fee, 0) * 100);

  const allocatedEntryFees = allocateCents(rawRows.map(r => r.rawEntryFee), totalEntryCents);
  const allocatedExitFees  = allocateCents(rawRows.map(r => r.rawExitFee),  totalExitCents);

  return rawRows.map((r, i) => {
    const entryFeeCents = allocatedEntryFees[i];
    const exitFeeCents  = allocatedExitFees[i];
    const fee = (entryFeeCents + exitFeeCents) / 100;
    return {
      entry_time: r.entry_time,
      entry_price: r.entry_price,
      entry_fee_share: entryFeeCents / 100,
      exit_time: r.exit_time,
      exit_price: r.exit_price,
      exit_fee_share: exitFeeCents / 100,
      qty: r.qty,
      fee,
    };
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

interface TradeFormProps {
  initialDate: string;
  trade?: Trade;
  onSubmit?: () => void;
}

export function TradeForm({ initialDate, trade, onSubmit }: TradeFormProps) {
  const [loading, setLoading] = useState(false);
  const [dbBrokers, setDbBrokers] = useState<BrokerRecord[]>([]);
  const { isOwner } = useAuth();

  // ─── Multi-entry / multi-exit state ─────────────────────────────────────
  const [isMultiExit, setIsMultiExit] = useState(false);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [exits, setExits] = useState<ExitRow[]>([]);

  useEffect(() => {
    apiGet<BrokerRecord[]>('/api/brokers')
      .then(rows => setDbBrokers(rows))
      .catch(() => setDbBrokers([]));
    // Update product cache, let getProductConfig can get the latest priceStep / pointValue
    apiGet<Array<{ symbol: string; name: string; name_zh: string; tick_size: number; point_value: number; price_step: number; owner_only: boolean }>>('/api/products')
      .then(rows => updateProductCache(rows))
      .catch(() => {/* Keep fallback cache */});
  }, []);

  // Get current product configuration (for dynamic step)

  // Get the current time as the default value for new transactions
  const getDefaultTime = () => getCurrentTaipeiDateTime();

  const [formData, setFormData] = useState({
    date: trade?.date || initialDate,
    symbol: trade?.symbol || 'MNQ',
    side: trade?.side || 'LONG',
    entry_time: trade?.entry_time || getDefaultTime(),
    entry_price: trade?.entry_price?.toString() || '',
    exit_time: trade?.exit_time || getDefaultTime(),
    exit_price: trade?.exit_price?.toString() || '',
    qty: trade?.qty?.toString() || '1',
    fuel_top: trade?.fuel_top?.toString() || '',
    fuel_bottom: trade?.fuel_bottom?.toString() || '',
    fuel: trade?.fuel?.toString() || '',
    sl_price: trade?.sl_price?.toString() || '',
    tp1: trade?.tp1?.toString() || '',
    tp2: trade?.tp2?.toString() || '',
    tp3: trade?.tp3?.toString() || '',
    broker: trade?.broker || 'Manual',
    fee: trade?.fee?.toString() || '',
    notes: trade?.notes || '',
  });

  // Update form data when trade prop changes
  useEffect(() => {
    if (trade) {
      setFormData({
        date: trade.date || initialDate,
        symbol: trade.symbol || 'MNQ',
        side: trade.side || 'LONG',
        entry_time: trade.entry_time || '',
        entry_price: trade.entry_price?.toString() || '',
        exit_time: trade.exit_time || '',
        exit_price: trade.exit_price?.toString() || '',
        qty: trade.qty?.toString() || '1',
        fuel_top: trade.fuel_top?.toString() || '',
        fuel_bottom: trade.fuel_bottom?.toString() || '',
        fuel: trade.fuel?.toString() || '',
        sl_price: trade.sl_price?.toString() || '',
        tp1: trade.tp1?.toString() || '',
        tp2: trade.tp2?.toString() || '',
        tp3: trade.tp3?.toString() || '',
        broker: trade.broker || 'IB',
        fee: trade.fee?.toString() || '',
        notes: trade.notes || '',
      });
      // Edit mode: always single mode
      setIsMultiExit(false);
    } else {
      // Reset form when no trade is selected - When adding a transaction, the current time is brought in by default
      const currentTime = getCurrentTaipeiDateTime();
      setFormData({
        date: initialDate,
        symbol: 'MNQ',
        side: 'LONG',
        entry_time: currentTime,
        entry_price: '',
        exit_time: currentTime,
        exit_price: '',
        qty: '1',
        fuel_top: '',
        fuel_bottom: '',
        fuel: '',
        sl_price: '',
        tp1: '',
        tp2: '',
        tp3: '',
        broker: 'Manual',
        fee: '',
        notes: '',
      });
    }
  }, [trade, initialDate]);

  // ─── Multi-entry / multi-exit toggle handler ────────────────────────────

  const handleToggleMultiExit = (checked: boolean) => {
    setIsMultiExit(checked);
    if (checked) {
      const currentTime = getCurrentTaipeiDateTime();
      setEntries([makeEntryRow(currentTime)]);
      setExits([makeExitRow(currentTime), makeExitRow(currentTime)]);
    } else {
      setEntries([]);
      setExits([]);
    }
  };

  // ─── Entry row handlers ──────────────────────────────────────────────────

  const handleEntryChange = (id: string, field: keyof EntryRow, value: string) => {
    setEntries(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handleAddEntry = () => {
    setEntries(prev => [...prev, makeEntryRow(getCurrentTaipeiDateTime())]);
  };

  const handleRemoveEntry = (id: string) => {
    setEntries(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(row => row.id !== id);
    });
  };

  // ─── Exit row handlers ───────────────────────────────────────────────────

  const handleExitChange = (id: string, field: keyof ExitRow, value: string) => {
    setExits(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handleAddExit = () => {
    setExits(prev => [...prev, makeExitRow(getCurrentTaipeiDateTime())]);
  };

  const handleRemoveExit = (id: string) => {
    setExits(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(row => row.id !== id);
    });
  };

  // ─── Auto-fee helper for exit rows ──────────────────────────────────────

  const getAutoExitFee = (qty: number): string => {
    const brokerRecord = dbBrokers.find(b => b.name === formData.broker);
    if (!brokerRecord) return '';
    const feePerContract = brokerRecord.fees[formData.symbol as Symbol] ?? 0;
    if (feePerContract <= 0) return '';
    return (feePerContract * qty).toFixed(2);
  };

  // ─── PnL calculators ────────────────────────────────────────────────────

  // Calculate P&L in real-time (single mode)
  const calculateCurrentPnL = () => {
    const entryPrice = parseFloat(formData.entry_price);
    const exitPrice = parseFloat(formData.exit_price);
    const qty = parseInt(formData.qty);
    const side = formData.side as TradeSide;

    if (!entryPrice || !exitPrice || !qty || !side) return null;

    const mockTrade: Partial<Trade> = {
      side,
      entry_price: entryPrice,
      exit_price: exitPrice,
      qty
    };

    return calculatePnL(mockTrade as Trade);
  };

  // Calculate total PnL across all entry/exit rows (multi mode) via FIFO
  const calculateMultiTotalPnL = (): number | null => {
    const side = formData.side as TradeSide;
    if (!side || entries.length === 0 || exits.length === 0) return null;

    let totalPnL = 0;
    let hasAny = false;

    // Use first valid entry price as approximation for each FIFO pair
    // Full FIFO is only used at submit; preview uses simplified per-exit calculation
    const firstEntryPrice = parseFloat(entries[0]?.entry_price);
    if (!firstEntryPrice) return null;

    for (const exit of exits) {
      const exitPrice = parseFloat(exit.exit_price);
      const qty = parseInt(exit.qty);
      if (!exitPrice || !qty) continue;
      const mock: Partial<Trade> = { side, entry_price: firstEntryPrice, exit_price: exitPrice, qty };
      totalPnL += calculatePnL(mock as Trade);
      hasAny = true;
    }

    return hasAny ? totalPnL : null;
  };

  // ─── Broker options ──────────────────────────────────────────────────────

  // Dynamic brokerage options: from DB read, If it has not been loaded yet, use static fallback
  const brokerOptions = dbBrokers.length > 0
    ? dbBrokers.map(b => ({ value: b.name, label: b.name }))
    : [
                { value: 'Manual', label: 'Manual' },
      ];

  const handleInputChange = (field: string, value: string | string[]) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        [field]: value
      };

      // Automatically calculate fuel when the upper or lower fuel zone boundary changes
      if (field === 'fuel_top' || field === 'fuel_bottom') {
        const fuelTop = field === 'fuel_top' ? parseFloat(value as string) : parseFloat(prev.fuel_top);
        const fuelBottom = field === 'fuel_bottom' ? parseFloat(value as string) : parseFloat(prev.fuel_bottom);

        if (!isNaN(fuelTop) && !isNaN(fuelBottom)) {
          updated.fuel = Math.abs(fuelTop - fuelBottom).toFixed(2);
        } else {
          updated.fuel = '';
        }
      }

      // Automatically calculate fees as a broker, When the product or quantity changes
      const symbol = (field === 'symbol' ? value as Symbol : prev.symbol) as Symbol;
      const broker = (field === 'broker' ? value as Broker : prev.broker) as Broker;
      const qty = field === 'qty' ? parseInt(value as string) : parseInt(prev.qty);

      if (broker && !isNaN(qty) && qty > 0 && (field === 'broker' || field === 'symbol' || field === 'qty')) {
        // from DB Brokerage firm fees map Inquiry fee
        const brokerRecord = dbBrokers.find(b => b.name === broker);
        if (brokerRecord) {
          const feePerContract = brokerRecord.fees[symbol] ?? 0;
          if (feePerContract > 0) {
            updated.fee = (feePerContract * qty).toFixed(2);
          } else if (field === 'broker') {
            updated.fee = '';
          }
        } else if (field === 'broker') {
          // Unknown broker (May not be loaded yet), Clear the fee and let users fill it in manually
          updated.fee = '';
        }
      }

      return updated;
    });
  };

  // ─── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ── Multi-exit submit branch ──────────────────────────────────────────
    if (isMultiExit && !trade) {
      return handleMultiExitSubmit();
    }

    // ── Single mode submit (original) ────────────────────────────────────

    // Validation
    if (!formData.side || !formData.entry_time || !formData.entry_price ||
      !formData.qty) {
      toast.error('Please fill in all required fields');
      return;
    }

    const entryPrice = parseFloat(formData.entry_price);
    const qty = parseInt(formData.qty);

    if (isNaN(entryPrice) || entryPrice <= 0 || isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid price and quantity');
      return;
    }

    setLoading(true);

    try {
      // Prepare trade data
      // Use null for empty optional fields
      // Using Record type to allow null values for field deletion
      const tradeData: Record<string, unknown> = {
        date: formData.date,
        symbol: formData.symbol as Symbol,
        side: formData.side as TradeSide,
        entry_time: formData.entry_time,
        entry_price: entryPrice,
        exit_time: formData.exit_time || null,
        exit_price: formData.exit_price ? parseFloat(formData.exit_price) : null,
        qty,
        fuel_top: formData.fuel_top ? parseFloat(formData.fuel_top) : null,
        fuel_bottom: formData.fuel_bottom ? parseFloat(formData.fuel_bottom) : null,
        fuel: formData.fuel ? parseFloat(formData.fuel) : null,
        sl_price: formData.sl_price ? parseFloat(formData.sl_price) : null,
        tp1: formData.tp1 ? parseFloat(formData.tp1) : null,
        tp2: formData.tp2 ? parseFloat(formData.tp2) : null,
        tp3: formData.tp3 ? parseFloat(formData.tp3) : null,
        broker: formData.broker as Broker,
        fee: formData.fee ? parseFloat(formData.fee) : null,
        notes: formData.notes || null,
      };

      if (trade?.id) {
        const result = await updateTrade(String(trade.id), tradeData as Partial<Trade>);
        if (!result.success) {
          throw new Error(result.error || 'Update failed');
        }
        toast.success('Trade updated');
      } else {
        const result = await createTrade(tradeData as Omit<Trade, 'id' | 'created_at' | 'updated_at'>);
        if (!result.success) {
          throw new Error(result.error || 'Creation failed');
        }
        toast.success('Trade created');
      }

      resetForm();
      onSubmit?.();

    } catch (error) {
      console.error('Save error:', error);
      const errorMessage = error instanceof Error ? error.message : 'unknown error';
      toast.error(`Save failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Multi-entry / multi-exit submit logic (FIFO) ───────────────────────

  const handleMultiExitSubmit = async () => {
    if (!formData.side) {
      toast.error('Please select the trading direction');
      return;
    }

    // Validate entries
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.entry_time || !entry.entry_price || !entry.qty) {
        toast.error(`Entry ${i + 1}: incomplete fields`);
        return;
      }
      const ep = parseFloat(entry.entry_price);
      const q = parseInt(entry.qty);
      if (isNaN(ep) || ep <= 0 || isNaN(q) || q <= 0) {
        toast.error(`Entry ${i + 1}: invalid values`);
        return;
      }
    }

    // Validate exits
    for (let i = 0; i < exits.length; i++) {
      const exit = exits[i];
      if (!exit.exit_time || !exit.exit_price || !exit.qty) {
        toast.error(`Exit ${i + 1}: incomplete fields`);
        return;
      }
      const ep = parseFloat(exit.exit_price);
      const q = parseInt(exit.qty);
      if (isNaN(ep) || ep <= 0 || isNaN(q) || q <= 0) {
        toast.error(`Exit ${i + 1}: invalid values`);
        return;
      }
    }

    // Validate qty sum: sum(entries) === sum(exits)
    const sumEntryQty = entries.reduce((acc, row) => acc + (parseInt(row.qty) || 0), 0);
    const sumExitQty = exits.reduce((acc, row) => acc + (parseInt(row.qty) || 0), 0);
    if (sumEntryQty !== sumExitQty) {
      toast.error(`Total entry contracts (${sumEntryQty}) Must be equal to total exit contracts (${sumExitQty})`);
      return;
    }

    // Resolve auto-fee for entry rows
    const entryNorm = entries.map(e => {
      const qty = parseInt(e.qty);
      const fee = e.fee
        ? parseFloat(e.fee)
        : parseFloat(getAutoExitFee(qty) || '0');
      return {
        entry_time: e.entry_time,
        entry_price: parseFloat(e.entry_price),
        qty,
        fee,
      };
    });

    // Resolve auto-fee for exit rows
    const exitNorm = exits.map(ex => {
      const qty = parseInt(ex.qty);
      const fee = ex.fee
        ? parseFloat(ex.fee)
        : parseFloat(getAutoExitFee(qty) || '0');
      return {
        exit_time: ex.exit_time,
        exit_price: parseFloat(ex.exit_price),
        qty,
        fee,
      };
    });

    const fifoRows = fifoMatchTrades(entryNorm, exitNorm);

    const sharedFields = {
      date: formData.date,
      symbol: formData.symbol as Symbol,
      side: formData.side as TradeSide,
      fuel_top: formData.fuel_top ? parseFloat(formData.fuel_top) : null,
      fuel_bottom: formData.fuel_bottom ? parseFloat(formData.fuel_bottom) : null,
      fuel: formData.fuel ? parseFloat(formData.fuel) : null,
      sl_price: formData.sl_price ? parseFloat(formData.sl_price) : null,
      tp1: formData.tp1 ? parseFloat(formData.tp1) : null,
      tp2: formData.tp2 ? parseFloat(formData.tp2) : null,
      tp3: formData.tp3 ? parseFloat(formData.tp3) : null,
      broker: formData.broker as Broker,
      notes: formData.notes || null,
    };

    const batchTrades = fifoRows.map((row) => ({
      ...sharedFields,
      entry_time: row.entry_time,
      entry_price: row.entry_price,
      exit_time: row.exit_time,
      exit_price: row.exit_price,
      qty: row.qty,
      fee: row.fee > 0 ? row.fee : null,
    }));

    setLoading(true);
    try {
      const result = await apiPost<{ success: boolean; ids: string[]; group_id: string; error?: string }>(
        '/api/trade-groups/batch',
        { trades: batchTrades },
      );
      if (!result.success) {
        throw new Error(result.error || 'Creation failed');
      }

      toast.success(`Matched ${entries.length} entries × ${exits.length} exits into ${fifoRows.length} trades`);
      resetForm();
      onSubmit?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown error';
      toast.error(`Save failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Reset ───────────────────────────────────────────────────────────────

  const resetForm = () => {
    const currentTime = getCurrentTaipeiDateTime();
    setFormData({
      date: initialDate,
      symbol: 'MNQ',
      side: 'LONG',
      entry_time: currentTime,
      entry_price: '',
      exit_time: currentTime,
      exit_price: '',
      qty: '1',
      fuel_top: '',
      fuel_bottom: '',
      fuel: '',
      sl_price: '',
      tp1: '',
      tp2: '',
      tp3: '',
      broker: 'Manual',
      fee: '',
      notes: '',
    });
    setIsMultiExit(false);
    setEntries([]);
    setExits([]);
  };

  const currentPnL = isMultiExit ? calculateMultiTotalPnL() : calculateCurrentPnL();

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <LoadingOverlay isLoading={loading}>
      <Card>
        <CardHeader>
          <CardTitle>{trade ? 'Edit trade' : 'Add trade'}</CardTitle>
          <CardDescription>
            Enter trade details. P&L is calculated automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── Partial take-profit toggle (new trades only) ── */}
            {!trade && (
              <div className="flex items-center gap-3 py-2 px-3 rounded-md border border-white/[0.06] bg-white/[0.02]">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isMultiExit}
                    onChange={(e) => handleToggleMultiExit(e.target.checked)}
                    className="w-4 h-4 rounded border-white/[0.20] bg-white/[0.05] accent-blue-500 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-[#EDEDEF]">Partial take-profit</span>
                </label>
                <span className="text-xs text-[#8A8F98]">Record multiple exits under one trade group.</span>
              </div>
            )}

            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="date">Trade date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleInputChange('date', e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Product</Label>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      className={`flex-1 py-2 px-3 rounded-md font-medium text-sm transition-all duration-200 ${formData.symbol === 'MNQ'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                        : 'bg-white/[0.05] hover:bg-white/[0.08] text-[#8A8F98] border border-white/[0.06]'
                        }`}
                      onClick={() => handleInputChange('symbol', 'MNQ')}
                    >
                      MNQ
                    </button>
                    <button
                      type="button"
                      className={`flex-1 py-2 px-3 rounded-md font-medium text-sm transition-all duration-200 ${formData.symbol === 'NQ'
                        ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-sm'
                        : 'bg-white/[0.05] hover:bg-white/[0.08] text-[#8A8F98] border border-white/[0.06]'
                        }`}
                      onClick={() => handleInputChange('symbol', 'NQ')}
                    >
                      NQ
                    </button>
                    {isOwner && (
                      <button
                        type="button"
                        className={`flex-1 py-2 px-3 rounded-md font-medium text-sm transition-all duration-200 ${formData.symbol === 'SIL'
                          ? 'bg-gray-700 hover:bg-gray-800 text-white shadow-sm'
                          : 'bg-white/[0.05] hover:bg-white/[0.08] text-[#8A8F98] border border-white/[0.06]'
                          }`}
                        onClick={() => handleInputChange('symbol', 'SIL')}
                      >
                        SIL
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Trading direction</Label>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      className={`flex-1 py-2 px-3 rounded-md font-medium text-sm transition-all duration-200 ${formData.side === 'LONG'
                        ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
                        : 'bg-white/[0.05] hover:bg-white/[0.08] text-[#8A8F98] border border-white/[0.06]'
                        }`}
                      onClick={() => handleInputChange('side', 'LONG')}
                    >
                      many
                    </button>
                    <button
                      type="button"
                      className={`flex-1 py-2 px-3 rounded-md font-medium text-sm transition-all duration-200 ${formData.side === 'SHORT'
                        ? 'bg-green-600 hover:bg-green-700 text-white shadow-sm'
                        : 'bg-white/[0.05] hover:bg-white/[0.08] text-[#8A8F98] border border-white/[0.06]'
                        }`}
                      onClick={() => handleInputChange('side', 'SHORT')}
                    >
                      null
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Entry Details — single mode */}
            {!isMultiExit && (
              <div className="space-y-4">
                <h4 className="text-lg font-medium">Entry information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <Label htmlFor="entry_time">Entry time</Label>
                    <Input
                      id="entry_time"
                      type="datetime-local"
                      value={formData.entry_time}
                      onChange={(e) => handleInputChange('entry_time', e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                    <Label htmlFor="entry_price">Entry price</Label>
                      <Input
                        id="entry_price"
                        type="number"
                        step={getProductConfig(formData.symbol).priceStep}
                        placeholder={formData.symbol === 'SIL' ? '11570.0' : '23500.00'}
                        value={formData.entry_price}
                        onChange={(e) => handleInputChange('entry_price', e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="qty">Contracts</Label>
                      <Input
                        id="qty"
                        type="number"
                        min="1"
                        placeholder="1"
                        value={formData.qty}
                        onChange={(e) => handleInputChange('qty', e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── N entries + M exits Advanced mode ── */}
            {isMultiExit ? (
              <div className="space-y-4">

                {/* ── Entry fills block ── */}
                <div className="space-y-3 p-4 rounded-lg border border-white/[0.08] bg-white/[0.03]">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-medium">Entry fills (Entry)</h4>
                    {(() => {
                      const sumQty = entries.reduce((acc, r) => acc + (parseInt(r.qty) || 0), 0);
                      return (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300">
                          {sumQty} contracts
                        </span>
                      );
                    })()}
                  </div>

                  <div className="space-y-3">
                    {entries.map((entry, idx) => (
                      <div
                        key={entry.id}
                        className="relative p-3 rounded-md border border-white/[0.06] bg-white/[0.02] space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-[#8A8F98]">Entry {idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveEntry(entry.id)}
                            disabled={entries.length <= 1}
                            className="w-5 h-5 flex items-center justify-center rounded text-[#8A8F98] hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                            aria-label={`delete Entry ${idx + 1}`}
                          >
                            ✕
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Entry time</Label>
                            <Input
                              type="datetime-local"
                              value={entry.entry_time}
                              onChange={(e) => handleEntryChange(entry.id, 'entry_time', e.target.value)}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                            <Label className="text-xs">Entry price</Label>
                              <Input
                                type="number"
                                step={getProductConfig(formData.symbol).priceStep}
                                placeholder={formData.symbol === 'SIL' ? '11570.0' : '23500.00'}
                                value={entry.entry_price}
                                onChange={(e) => handleEntryChange(entry.id, 'entry_price', e.target.value)}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Contracts</Label>
                              <Input
                                type="number"
                                min="1"
                                placeholder="1"
                                value={entry.qty}
                                onChange={(e) => handleEntryChange(entry.id, 'qty', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="w-full md:w-1/4">
                          <Label className="text-xs">Entry fee (USD)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder={getAutoExitFee(parseInt(entry.qty) || 1) || 'automatic'}
                            value={entry.fee}
                            onChange={(e) => handleEntryChange(entry.id, 'fee', e.target.value)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddEntry}
                    className="w-full py-2 px-3 rounded-md text-sm font-medium border border-dashed border-white/[0.12] text-[#8A8F98] hover:text-[#EDEDEF] hover:border-white/[0.20] hover:bg-white/[0.03] transition-all duration-200 flex items-center justify-center gap-1"
                  >
                    <span className="text-base leading-none">+</span>
                    <span>Add new entry</span>
                  </button>
                </div>

                {/* ── Exit fills block ── */}
                <div className="space-y-3 p-4 rounded-lg border border-white/[0.08] bg-white/[0.03]">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-medium">Exit fills</h4>
                    {(() => {
                      const sumExitQty = exits.reduce((acc, r) => acc + (parseInt(r.qty) || 0), 0);
                      return (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300">
                          {sumExitQty} contracts
                        </span>
                      );
                    })()}
                  </div>

                  <div className="space-y-3">
                    {exits.map((exit, idx) => {
                      const exitPrice = parseFloat(exit.exit_price);
                      const firstEntryPrice = parseFloat(entries[0]?.entry_price);
                      const qty = parseInt(exit.qty);
                      const side = formData.side as TradeSide;
                      const rowPnL = exitPrice && firstEntryPrice && qty && side
                        ? calculatePnL({ side, entry_price: firstEntryPrice, exit_price: exitPrice, qty } as Trade)
                        : null;

                      return (
                        <div
                          key={exit.id}
                          className="relative p-3 rounded-md border border-white/[0.06] bg-white/[0.02] space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-[#8A8F98]">TP{idx + 1}</span>
                            <div className="flex items-center gap-2">
                              {rowPnL !== null && (
                                <span className={`text-xs font-medium ${rowPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {rowPnL >= 0 ? '+' : ''}{rowPnL.toFixed(2)} pts
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveExit(exit.id)}
                                disabled={exits.length <= 1}
                                className="w-5 h-5 flex items-center justify-center rounded text-[#8A8F98] hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                                aria-label={`delete TP${idx + 1}`}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Exit time</Label>
                              <Input
                                type="datetime-local"
                                value={exit.exit_time}
                                onChange={(e) => handleExitChange(exit.id, 'exit_time', e.target.value)}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                        <Label className="text-xs">Exit price</Label>
                                <Input
                                  type="number"
                                  step={getProductConfig(formData.symbol).priceStep}
                                  placeholder="23600.00"
                                  value={exit.exit_price}
                                  onChange={(e) => handleExitChange(exit.id, 'exit_price', e.target.value)}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Contracts</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  placeholder="1"
                                  value={exit.qty}
                                  onChange={(e) => handleExitChange(exit.id, 'qty', e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="w-full md:w-1/4">
                            <Label className="text-xs">Exit fee (USD)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder={getAutoExitFee(parseInt(exit.qty) || 1) || 'automatic'}
                              value={exit.fee}
                              onChange={(e) => handleExitChange(exit.id, 'fee', e.target.value)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddExit}
                    className="w-full py-2 px-3 rounded-md text-sm font-medium border border-dashed border-white/[0.12] text-[#8A8F98] hover:text-[#EDEDEF] hover:border-white/[0.20] hover:bg-white/[0.03] transition-all duration-200 flex items-center justify-center gap-1"
                  >
                    <span className="text-base leading-none">+</span>
                    <span>Add exit</span>
                  </button>
                </div>

                {/* ── Qty Alignment instructions ── */}
                {(() => {
                  const sumEntryQty = entries.reduce((acc, r) => acc + (parseInt(r.qty) || 0), 0);
                  const sumExitQty = exits.reduce((acc, r) => acc + (parseInt(r.qty) || 0), 0);
                  const matched = sumEntryQty > 0 && sumEntryQty === sumExitQty;
                  return (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${matched ? 'bg-green-900/20 text-green-400' : 'bg-yellow-900/20 text-yellow-400'}`}>
                      <span>Entry: {sumEntryQty} contracts</span>
                      <span className="text-[#8A8F98]">｜</span>
                      <span>Exit: {sumExitQty} contracts</span>
                      <span>{matched ? '✅' : '⚠️ Does not match'}</span>
                    </div>
                  );
                })()}

                {/* Total PnL preview */}
                {currentPnL !== null && (
                  <div className={`p-3 rounded-md ${currentPnL >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total estimated profit and loss: </span>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${currentPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {currentPnL >= 0 ? '+' : ''}{currentPnL.toFixed(2)} point
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {calculatePnLAmount(currentPnL, 0, formData.symbol as Symbol).toFixed(2)} USD
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── Single mode exit section (original) ── */
              <div className="space-y-4">
                <h4 className="text-lg font-medium">Exit information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <Label htmlFor="exit_time">Exit time</Label>
                    <Input
                      id="exit_time"
                      type="datetime-local"
                      value={formData.exit_time}
                      onChange={(e) => handleInputChange('exit_time', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="exit_price">Exit price</Label>
                    <Input
                      id="exit_price"
                      type="number"
                      step={getProductConfig(formData.symbol).priceStep}
                      placeholder={formData.symbol === 'SIL' ? '11575.0' : '23600.00'}
                      value={formData.exit_price}
                      onChange={(e) => handleInputChange('exit_price', e.target.value)}
                    />
                  </div>
                </div>

                {currentPnL !== null && (
                  <div className={`p-3 rounded-md ${currentPnL >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Estimated profit and loss: </span>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${currentPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {currentPnL >= 0 ? '+' : ''}{currentPnL.toFixed(2)} point
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {calculatePnLAmount(currentPnL, parseFloat(formData.fee) || 0, formData.symbol as Symbol).toFixed(2)} USD
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Risk Management */}
            <div className="space-y-4">
              <h4 className="text-lg font-medium">Risk management</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="sl_price">SL price</Label>
                  <Input
                    id="sl_price"
                    type="number"
                    step="0.25"
                    placeholder="23400.00"
                    value={formData.sl_price}
                    onChange={(e) => handleInputChange('sl_price', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="tp1">TP1 price</Label>
                  <Input
                    id="tp1"
                    type="number"
                    step="0.25"
                    placeholder="23550.00"
                    value={formData.tp1}
                    onChange={(e) => handleInputChange('tp1', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="tp2">TP2 price</Label>
                  <Input
                    id="tp2"
                    type="number"
                    step="0.25"
                    placeholder="23600.00"
                    value={formData.tp2}
                    onChange={(e) => handleInputChange('tp2', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="tp3">TP3 price</Label>
                  <Input
                    id="tp3"
                    type="number"
                    step="0.25"
                    placeholder="23650.00"
                    value={formData.tp3}
                    onChange={(e) => handleInputChange('tp3', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Additional Info */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fuel_top">Fuel zone upper bound</Label>
                  <Input
                    id="fuel_top"
                    type="number"
                    step="0.25"
                    value={formData.fuel_top}
                    onChange={(e) => handleInputChange('fuel_top', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="fuel_bottom">Fuel zone lower bound</Label>
                  <Input
                    id="fuel_bottom"
                    type="number"
                    step="0.25"
                    value={formData.fuel_bottom}
                    onChange={(e) => handleInputChange('fuel_bottom', e.target.value)}
                  />
                </div>
              </div>

              {/* fuel calculation display */}
              {formData.fuel && (
                <div className="mt-2 p-3 bg-muted rounded-md">
                  <div className="text-sm text-muted-foreground">Fuel</div>
                  <div className="font-medium text-lg">
                    {formData.fuel} point
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="broker">Broker</Label>
                <Select
                  value={formData.broker}
                  onChange={(e) => handleInputChange('broker', e.target.value)}
                  options={brokerOptions}
                  placeholder="Select a broker"
                />
              </div>

              {/* fee (Hidden in advanced mode, Change to each entry/exit row Fill in each) */}
              {!isMultiExit && (
                <div>
                  <Label htmlFor="fee">Fee (USD)</Label>
                  {(() => {
                    const brokerRecord = dbBrokers.find(b => b.name === formData.broker);
                    const feePerContract = brokerRecord?.fees[formData.symbol] ?? null;
                    const hasKnownFee = feePerContract !== null && feePerContract > 0;
                    return (
                      <>
                        <Input
                          id="fee"
                          type="number"
                          step="0.01"
                          placeholder="2.50"
                          value={formData.fee}
                          onChange={(e) => handleInputChange('fee', e.target.value)}
                          disabled={hasKnownFee}
                          className={hasKnownFee ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}
                        />
                        {hasKnownFee && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formData.broker}: ${feePerContract}/contracts × {formData.qty || 0} contracts
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Notes are captured on create and edited at the group level afterward. */}
            {!trade && (
              <div>
                <Label htmlFor="notes">Trade notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Record trade notes and market observations..."
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                />
              </div>
            )}

            {/* Submit Button */}
            <div className="flex space-x-2">
              <Button type="submit" size="lg">
                {trade ? 'Update trade' : isMultiExit ? `Save partial exits (${entries.length} entries × ${exits.length} exits)` : 'Save trade'}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </LoadingOverlay>
  );
}
