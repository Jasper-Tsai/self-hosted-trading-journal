'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { DirectPnlTrade } from '@/types';

const EMPTY = { date: new Date().toISOString().slice(0, 10), symbol: 'MNQ', side: 'LONG', entry_time: '', exit_time: '', qty: '1', broker: 'Manual', gross_pnl_usd: '', fee: '0', point_value_snapshot: '2', strategy: '', notes: '' };
type Form = typeof EMPTY;
function fromRecord(r: DirectPnlTrade): Form { return { date: r.date, symbol: r.symbol, side: r.side, entry_time: r.entry_time, exit_time: r.exit_time, qty: String(r.qty), broker: r.broker, gross_pnl_usd: String(r.gross_pnl_usd), fee: String(r.fee), point_value_snapshot: String(r.point_value_snapshot), strategy: r.strategy ?? '', notes: r.notes ?? '' }; }

export default function ManualPnlPage() {
  const [records, setRecords] = useState<DirectPnlTrade[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = async () => { const res = await fetch('/api/manual-pnl?start=2000-01-01&end=2100-01-01'); if (res.ok) setRecords(await res.json()); else toast.error('Could not load manual P&L records'); };
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);
  const set = (key: keyof Form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    const body = { ...form, qty: Number(form.qty), gross_pnl_usd: Number(form.gross_pnl_usd), fee: Number(form.fee), point_value_snapshot: Number(form.point_value_snapshot), strategy: form.strategy || null, notes: form.notes || null };
    const response = await fetch(editing ? `/api/manual-pnl/${editing}` : '/api/manual-pnl', { method: editing ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (!response.ok) return toast.error((await response.json().catch(() => null))?.error ?? 'Could not save record');
    toast.success(editing ? 'Manual P&L updated' : 'Manual P&L recorded'); setForm(EMPTY); setEditing(null); void load();
  };
  const remove = async (id: string) => { if (!confirm('Delete this manual P&L record?')) return; const response = await fetch(`/api/manual-pnl/${id}`, { method: 'DELETE' }); if (!response.ok) return toast.error('Could not delete record'); toast.success('Record deleted'); void load(); };
  const net = Number(form.gross_pnl_usd || 0) - Number(form.fee || 0);
  return <div className="space-y-6">
    <section><p className="text-xs font-mono uppercase tracking-widest text-[#8A8F98]">Broker statement mode</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#EDEDEF]">Manual P&L</h1><p className="mt-2 max-w-2xl text-sm text-[#8A8F98]">Record the P&L reported by a broker when individual fills or entry prices are unavailable. These records stay separate from your fill-based trade journal.</p></section>
    <form onSubmit={submit} className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_32px_rgba(0,0,0,0.25)]">
      <div className="grid gap-3 md:grid-cols-4">{([['date','Date','date'],['symbol','Symbol','text'],['side','Side','select'],['qty','Quantity','number'],['entry_time','Entry time','datetime-local'],['exit_time','Exit time','datetime-local'],['broker','Broker','text'],['strategy','Strategy','text'],['gross_pnl_usd','Gross P&L (USD)','number'],['fee','Fees (USD)','number'],['point_value_snapshot','Point value','number']] as const).map(([key,label,type]) => <label key={key} className="text-xs text-[#8A8F98]">{label}{type === 'select' ? <select value={form.side} onChange={(e) => set('side', e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-white/10 bg-[#0F0F12] px-3 text-sm text-[#EDEDEF]"><option>LONG</option><option>SHORT</option></select> : <input required={key !== 'strategy'} type={type} step={type === 'number' ? 'any' : undefined} value={form[key]} onChange={(e) => set(key, e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-white/10 bg-[#0F0F12] px-3 text-sm text-[#EDEDEF] focus:border-[#5E6AD2] focus:outline-none" />}</label>)}</div>
      <label className="mt-3 block text-xs text-[#8A8F98]">Notes<textarea value={form.notes} maxLength={1000} onChange={(e) => set('notes', e.target.value)} className="mt-1 block min-h-20 w-full rounded-lg border border-white/10 bg-[#0F0F12] p-3 text-sm text-[#EDEDEF] focus:border-[#5E6AD2] focus:outline-none" /></label>
      <div className="mt-4 flex flex-wrap items-center gap-3"><span className={net >= 0 ? 'text-emerald-400' : 'text-rose-400'}>Net: {net >= 0 ? '+' : ''}${net.toFixed(2)}</span><button disabled={saving} className="rounded-lg bg-[#5E6AD2] px-4 py-2 text-sm font-medium text-white shadow-[0_4px_12px_rgba(94,106,210,0.3)] hover:bg-[#6872D9] disabled:opacity-50">{saving ? 'Saving…' : editing ? 'Update record' : 'Record P&L'}</button>{editing && <button type="button" onClick={() => { setForm(EMPTY); setEditing(null); }} className="rounded-lg px-4 py-2 text-sm text-[#8A8F98] hover:bg-white/[0.05] hover:text-[#EDEDEF]">Cancel</button>}</div>
    </form>
    <section className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]"><div className="border-b border-white/[0.06] px-5 py-4 text-sm font-medium text-[#EDEDEF]">Recorded P&L</div><div className="divide-y divide-white/[0.06]">{records.length === 0 ? <p className="p-5 text-sm text-[#8A8F98]">No manual P&L records yet.</p> : records.slice().reverse().map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"><div><span className="font-medium text-[#EDEDEF]">{r.date} · {r.symbol} · {r.side}</span><span className="ml-3 text-[#8A8F98]">{r.qty} contracts · {r.broker}</span>{r.strategy && <span className="ml-3 text-[#8A8F98]">{r.strategy}</span>}</div><div className="flex items-center gap-3"><span className={r.gross_pnl_usd - r.fee >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{r.gross_pnl_usd - r.fee >= 0 ? '+' : ''}${(r.gross_pnl_usd - r.fee).toFixed(2)}</span><button onClick={() => { setForm(fromRecord(r)); setEditing(r.id); }} className="text-[#8A8F98] hover:text-[#EDEDEF]">Edit</button><button onClick={() => void remove(r.id)} className="text-rose-400 hover:text-rose-300">Delete</button></div></div>)}</div></section>
  </div>;
}
