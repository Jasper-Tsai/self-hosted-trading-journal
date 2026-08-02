'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getMonthlyPnL, getWeeklySummaries } from '@/lib/actions/trades';
import type { WeeklySummary, DailyPnL } from '@/lib/actions/trades';
import { getMarketEvents, createMarketEvent, updateMarketEvent, deleteMarketEvent } from '@/lib/actions/market-events';
import type { MarketEvent, EventSeverity } from '@/types';
import { ChevronLeft, ChevronRight, Plus, X, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface MonthData {
    year: number;
    month: number;
    dailyPnL: DailyPnL[];
    monthlyTotal: number;
    weeklySummaries: Record<string, WeeklySummary>;
}

interface TradingCalendarProps {
    usdTwdRate: number;
}

// severity Style correspondence
const severityConfig: Record<EventSeverity, { dot: string; label: string; text: string; bg: string; border: string; badge: string }> = {
    danger: { dot: 'bg-red-500', label: 'black swan', text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', badge: 'bg-red-500/20 text-red-400 border-red-500/30' },
    warning: { dot: 'bg-orange-500', label: 'High volatility', text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    info: { dot: 'bg-blue-500', label: 'Reference', text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
};

export default function TradingCalendar({ usdTwdRate }: TradingCalendarProps) {
    const { isViewer } = useAuth();
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() + 1 };
    });
    const [monthData, setMonthData] = useState<MonthData[]>([]);
    const [marketEvents, setMarketEvents] = useState<MarketEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [showEventModal, setShowEventModal] = useState(false);
    const [editingEvent, setEditingEvent] = useState<MarketEvent | null>(null);

    const getPreviousMonth = (year: number, month: number) => {
        if (month === 1) return { year: year - 1, month: 12 };
        return { year, month: month - 1 };
    };

    const fetchEvents = useCallback(async (year: number, month: number) => {
        const prev = getPreviousMonth(year, month);
        const start = `${prev.year}-${String(prev.month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        try {
            return await getMarketEvents(start, end);
        } catch {
            return [];
        }
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const prev = getPreviousMonth(currentMonth.year, currentMonth.month);

                const [currentData, prevData, currentWeekly, prevWeekly, events] = await Promise.all([
                    getMonthlyPnL(currentMonth.year, currentMonth.month, isViewer),
                    getMonthlyPnL(prev.year, prev.month, isViewer),
                    getWeeklySummaries(currentMonth.year, currentMonth.month, isViewer),
                    getWeeklySummaries(prev.year, prev.month, isViewer),
                    fetchEvents(currentMonth.year, currentMonth.month),
                ]);

                setMonthData([
                    { ...currentMonth, ...currentData, weeklySummaries: currentWeekly },
                    { ...prev, ...prevData, weeklySummaries: prevWeekly },
                ]);
                setMarketEvents(events);
            } catch (error) {
                console.error('Error fetching monthly PnL:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [currentMonth, isViewer, fetchEvents]);

    const goToPreviousMonth = () => setCurrentMonth(prev => getPreviousMonth(prev.year, prev.month));
    const goToNextMonth = () => setCurrentMonth(prev => {
        if (prev.month === 12) return { year: prev.year + 1, month: 1 };
        return { year: prev.year, month: prev.month + 1 };
    });
    const goToCurrentMonth = () => {
        const now = new Date();
        setCurrentMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
    };

    const handleEventSaved = async () => {
        setShowEventModal(false);
        setEditingEvent(null);
        const events = await fetchEvents(currentMonth.year, currentMonth.month);
        setMarketEvents(events);
    };

    const handleEditEvent = (event: MarketEvent) => {
        setEditingEvent(event);
        setShowEventModal(true);
    };

    const handleDeleteEvent = async (id: string) => {
        if (!confirm('Are you sure you want to delete this event??')) return;
        await deleteMarketEvent(id);
        const events = await fetchEvents(currentMonth.year, currentMonth.month);
        setMarketEvents(events);
    };

    return (
        <div className="space-y-6">
            {/* Navigation Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={goToNextMonth}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={goToCurrentMonth}>
                        This month
                    </Button>
                </div>
                {!isViewer && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setEditingEvent(null); setShowEventModal(true); }}
                        className="gap-1.5"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        event
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="text-center text-muted-foreground py-12">loading...</div>
            ) : (
                <div className="space-y-6">
                    {monthData.map((data, index) => (
                        <MonthCalendar
                            key={`${data.year}-${data.month}`}
                            year={data.year}
                            month={data.month}
                            dailyPnL={data.dailyPnL}
                            monthlyTotal={data.monthlyTotal}
                            usdTwdRate={usdTwdRate}
                            isCurrentMonth={index === 0}
                            isViewer={isViewer}
                            weeklySummaries={data.weeklySummaries}
                            marketEvents={marketEvents}
                            onEditEvent={!isViewer ? handleEditEvent : undefined}
                            onDeleteEvent={!isViewer ? handleDeleteEvent : undefined}
                        />
                    ))}
                </div>
            )}

            {/* Event Modal */}
            {showEventModal && (
                <EventModal
                    event={editingEvent}
                    onClose={() => { setShowEventModal(false); setEditingEvent(null); }}
                    onSaved={handleEventSaved}
                />
            )}
        </div>
    );
}

// ─── Event Modal ──────────────────────────────────────────────

interface EventModalProps {
    event: MarketEvent | null;
    onClose: () => void;
    onSaved: () => void;
}

function EventModal({ event, onClose, onSaved }: EventModalProps) {
    const isEdit = !!event?.id;
    const [title, setTitle] = useState(event?.title ?? '');
    const [description, setDescription] = useState(event?.description ?? '');
    const [severity, setSeverity] = useState<EventSeverity>(event?.severity ?? 'warning');
    const [startDate, setStartDate] = useState(event?.start_date ?? new Date().toISOString().slice(0, 10));
    const [endDate, setEndDate] = useState(event?.end_date ?? '');
    const [ongoing, setOngoing] = useState(!event?.end_date);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !startDate) return;
        setSaving(true);
        try {
            const data = {
                title: title.trim(),
                description: description.trim() || undefined,
                start_date: startDate,
                end_date: ongoing ? null : (endDate || null),
                severity,
            };
            if (isEdit && event?.id) {
                await updateMarketEvent(event.id, data);
            } else {
                await createMarketEvent(data);
            }
            onSaved();
        } catch (err) {
            console.error('Failed to save event:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-popover border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-semibold">{isEdit ? 'Edit market events' : 'Add new market event'}</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Title */}
                    <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1 block">title *</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="example: The outbreak of the US-Iraq war"
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                            required
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1 block">Description</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Description of the event’s impact on the market..."
                            rows={3}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
                        />
                    </div>

                    {/* Severity */}
                    <div>
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">Severity</label>
                        <div className="flex gap-2">
                            {(['danger', 'warning', 'info'] as const).map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setSeverity(s)}
                                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                                        severity === s
                                            ? `${severityConfig[s].badge} border-current`
                                            : 'border-border text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {s === 'danger' ? (
                                        <span className="mr-1.5 text-sm leading-none">💀</span>
                                    ) : (
                                        <span className={`inline-block w-2 h-2 rounded-full ${severityConfig[s].dot} mr-1.5`} />
                                    )}
                                    {severityConfig[s].label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-muted-foreground mb-1 block">start date *</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground mb-1 block">end date</label>
                            <input
                                type="date"
                                value={ongoing ? '' : endDate}
                                onChange={e => setEndDate(e.target.value)}
                                disabled={ongoing}
                                min={startDate}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-40"
                            />
                            <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={ongoing}
                                    onChange={e => setOngoing(e.target.checked)}
                                    className="rounded border-border"
                                />
                                <span className="text-xs text-muted-foreground">in progress</span>
                            </label>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                        <Button type="submit" size="sm" disabled={saving || !title.trim()}>
                            {saving ? 'Storing...' : (isEdit ? 'renew' : 'New')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Month Calendar ───────────────────────────────────────────

import { holidays } from '@/data/holidays';

interface MonthCalendarProps {
    year: number;
    month: number;
    dailyPnL: DailyPnL[];
    monthlyTotal: number;
    usdTwdRate: number;
    isCurrentMonth: boolean;
    isViewer?: boolean;
    weeklySummaries: Record<string, WeeklySummary>;
    marketEvents: MarketEvent[];
    onEditEvent?: (event: MarketEvent) => void;
    onDeleteEvent?: (id: string) => void;
}

// Determine whether a certain date is within the event range
function isDateInEvent(dateKey: string, event: MarketEvent): boolean {
    if (dateKey < event.start_date) return false;
    if (event.end_date && dateKey > event.end_date) return false;
    return true;
}

function MonthCalendar({ year, month, dailyPnL, monthlyTotal, usdTwdRate, isViewer = false, weeklySummaries, marketEvents, onEditEvent, onDeleteEvent }: MonthCalendarProps) {
    const router = useRouter();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const startDayOfWeek = firstDayOfMonth.getDay();

    const calendarDays: (number | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) calendarDays.push(null);
    for (let day = 1; day <= daysInMonth; day++) calendarDays.push(day);

    const pnlMap = new Map<string, DailyPnL>();
    dailyPnL.forEach(item => pnlMap.set(item.date, item));

    const formatDateKey = (day: number) =>
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const formatAmount = (amount: number) => {
        const formatted = Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 0 });
        return amount >= 0 ? `+$${formatted}` : `-$${formatted}`;
    };

    const formatPoints = (points: number) => {
        const sign = points >= 0 ? '+' : '';
        return `${sign}${points.toFixed(1)} point`;
    };

    const formatMonthlyTotal = (amount: number) => {
        const twdAmount = amount * usdTwdRate;
        const sign = amount >= 0 ? '+' : '-';
        return `${sign}$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${sign}$${Math.abs(twdAmount).toLocaleString('en-US', { maximumFractionDigits: 0 })} TWD)`;
    };

    const handleDateClick = (dateKey: string, hasTrade: boolean) => {
        if (hasTrade && !isViewer) router.push(`/trades?date=${dateKey}`);
    };

    const isSaturday = (day: number) => new Date(year, month - 1, day).getDay() === 6;

    // Filter out relevant events this month
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const activeEvents = marketEvents.filter(ev => {
        if (ev.start_date > monthEnd) return false;
        if (ev.end_date && ev.end_date < monthStart) return false;
        return true;
    });

    // Get the events of a certain day
    const getEventsForDate = (dateKey: string) =>
        activeEvents.filter(ev => isDateInEvent(dateKey, ev));

    // Get the highest severity (for polka dot color)
    const getHighestSeverity = (events: MarketEvent[]): EventSeverity | null => {
        if (events.length === 0) return null;
        if (events.some(e => e.severity === 'danger')) return 'danger';
        if (events.some(e => e.severity === 'warning')) return 'warning';
        return 'info';
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-lg md:text-xl">{monthNames[month - 1]} {year}</span>
                    <span className={`text-sm md:text-lg font-semibold ${monthlyTotal >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {formatMonthlyTotal(monthlyTotal)}
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {/* Active Events Alert Bar */}
                {activeEvents.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                        {activeEvents.map(ev => {
                            const cfg = severityConfig[ev.severity as EventSeverity] ?? severityConfig.warning;
                            const isOngoing = !ev.end_date;
                            const dateLabel = isOngoing
                                ? `${ev.start_date.substring(5)}~`
                                : ev.start_date === ev.end_date
                                    ? ev.start_date.substring(5)
                                    : `${ev.start_date.substring(5)}~${ev.end_date!.substring(5)}`;
                            return (
                                <div
                                    key={ev.id}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${cfg.badge} group/event relative`}
                                >
                                    {ev.severity === 'danger' ? (
                                        <span className={`text-xs leading-none ${isOngoing ? 'animate-pulse' : ''}`}>💀</span>
                                    ) : (
                                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${isOngoing ? 'animate-pulse' : ''}`} />
                                    )}
                                    <span>{ev.title}</span>
                                    <span className="opacity-60">({dateLabel})</span>
                                    {/* Owner: edit/delete on hover */}
                                    {onEditEvent && onDeleteEvent && (
                                        <span className="hidden group-hover/event:inline-flex items-center gap-1 ml-1">
                                            <button onClick={() => onEditEvent(ev)} className="hover:opacity-80 transition-opacity" title="edit">
                                                <Pencil className="h-3 w-3" />
                                            </button>
                                            <button onClick={() => onDeleteEvent(ev.id!)} className="hover:opacity-80 transition-opacity" title="delete">
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Week day headers */}
                <div className="grid grid-cols-6 md:grid-cols-7 gap-1 mb-2">
                    {weekDays.map((day, idx) => (
                        <div key={day} className={`text-center text-xs md:text-sm font-medium text-muted-foreground py-1 md:py-2 ${idx === 0 ? 'hidden md:block' : ''}`}>
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-6 md:grid-cols-7 gap-1">
                    {calendarDays.map((day, index) => {
                        const isSundayCol = index % 7 === 0;

                        if (day === null) {
                            return <div key={`empty-${index}`} className={`h-14 md:h-20 ${isSundayCol ? 'hidden md:block' : ''}`} />;
                        }

                        const dateKey = formatDateKey(day);
                        const dayData = pnlMap.get(dateKey);
                        const hasTrade = dayData !== undefined;
                        const holiday = holidays.find(h => h.date === dateKey);
                        const saturdayCheck = isSaturday(day);
                        const weeklySummary = saturdayCheck ? weeklySummaries[dateKey] : undefined;
                        const dayEvents = getEventsForDate(dateKey);
                        const highestSeverity = getHighestSeverity(dayEvents);

                        // Saturday cell: show weekly summary
                        if (saturdayCheck && weeklySummary) {
                            const hasWeeklyTrades = weeklySummary.totalTrades > 0;
                            return (
                                <div
                                    key={dateKey}
                                    className={`h-14 md:h-20 p-0.5 md:p-1 border rounded-md flex flex-col items-center justify-start relative group transition-all ${isSundayCol ? 'hidden md:flex' : ''}
                                        ${hasWeeklyTrades
                                            ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'
                                            : 'bg-muted/30 border-dashed'
                                        }
                                    `}
                                >
                                    <div className="w-full flex justify-between items-start">
                                        <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-semibold">
                                            Weekend
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">{day}</span>
                                    </div>

                                    {hasWeeklyTrades ? (
                                        <>
                                            <span className={`text-[10px] md:text-sm font-bold mt-auto mb-0.5 ${weeklySummary.totalAmount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                {formatAmount(weeklySummary.totalAmount)}
                                            </span>
                                            <div className="flex items-center gap-1 mb-auto">
                                                <span className="text-[10px] text-muted-foreground">
                                                    {weeklySummary.totalTrades} {weeklySummary.totalTrades === 1 ? 'trade' : 'trades'}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">·</span>
                                                <span className={`text-[10px] font-medium ${weeklySummary.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                                                    {weeklySummary.winRate}%
                                                </span>
                                            </div>

                                            {/* Weekly summary hover tooltip */}
                                            <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100
                                                transition-opacity duration-200 pointer-events-none">
                                                <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[200px] text-sm">
                                                    <div className="font-semibold mb-2 text-center border-b pb-1 text-indigo-600 dark:text-indigo-400">
                                                        📊 Weekly trading summary
                                                    </div>
                                                    <div className="text-xs text-muted-foreground text-center mb-2">
                                                        {weeklySummary.weekStart.substring(5)} ~ {weeklySummary.weekEnd.substring(5)}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Profit and loss (Points)</span>
                                                            <span className={weeklySummary.totalPoints >= 0 ? 'text-green-500' : 'text-red-500'}>
                                                                {formatPoints(weeklySummary.totalPoints)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Profit and loss (Amount)</span>
                                                            <span className={weeklySummary.totalAmount >= 0 ? 'text-green-500' : 'text-red-500'}>
                                                                {formatAmount(weeklySummary.totalAmount)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Trades</span>
                                                            <span>{weeklySummary.totalTrades} {weeklySummary.totalTrades === 1 ? 'trade' : 'trades'}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-muted-foreground">winning rate</span>
                                                            <span className={weeklySummary.winRate >= 50 ? 'text-green-500' : 'text-red-500'}>
                                                                {weeklySummary.winRate}% ({weeklySummary.wins}/{weeklySummary.totalTrades})
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Trading days</span>
                                                            <span>{weeklySummary.tradingDays} days</span>
                                                        </div>
                                                    </div>
                                                    {/* Tooltip Arrow */}
                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-popover"></div>
                                                </div>
                                            </div>
                                        </>
                                    ) : null}
                                </div>
                            );
                        }

                        // Saturday without weekly data
                        if (saturdayCheck && !weeklySummary) {
                            return (
                                <div
                                    key={dateKey}
                                    className={`h-14 md:h-20 p-0.5 md:p-1 border rounded-md flex flex-col items-center justify-start bg-muted/20 border-dashed ${isSundayCol ? 'hidden md:flex' : ''}`}
                                >
                                    <div className="w-full flex justify-between items-start">
                                        <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-semibold">
                                            Weekend
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">{day}</span>
                                    </div>
                                </div>
                            );
                        }

                        // Regular day cell (non-Saturday)
                        return (
                            <div
                                key={dateKey}
                                onClick={() => handleDateClick(dateKey, hasTrade)}
                                className={`h-14 md:h-20 p-1 md:p-1.5 border rounded-md flex flex-col items-center justify-start relative group transition-all ${isSundayCol ? 'hidden md:flex' : ''}
                  ${hasTrade ? `bg-accent/30 ${!isViewer ? 'cursor-pointer hover:bg-accent/50 hover:shadow-md hover:scale-105' : ''}` : 'bg-background'}
                  ${holiday ? 'bg-orange-50/50 dark:bg-orange-950/20' : ''}
                `}
                            >
                                <div className="w-full flex justify-between items-start">
                                    {/* Event dot indicator (left) */}
                                    <div className="flex items-center gap-0.5">
                                        <span className="text-xs md:text-sm text-muted-foreground">{day}</span>
                                        {highestSeverity && (
                                            highestSeverity === 'danger' ? (
                                                <span className={`text-xs leading-none ${dayEvents.some(e => !e.end_date) ? 'animate-pulse' : ''}`}>💀</span>
                                            ) : (
                                                <span className={`w-1.5 h-1.5 rounded-full ${severityConfig[highestSeverity].dot} ${dayEvents.some(e => !e.end_date) ? 'animate-pulse' : ''}`} />
                                            )
                                        )}
                                    </div>
                                    {holiday && (
                                        <div className="flex h-1.5 w-1.5 items-center justify-center rounded-full bg-orange-400" title={holiday.name} />
                                    )}
                                </div>

                                {holiday && (
                                    <div className="text-[10px] leading-tight text-orange-600 dark:text-orange-400 font-medium text-center mt-0.5 px-0.5 line-clamp-2 w-full">
                                        {holiday.name}
                                    </div>
                                )}

                                {hasTrade && (
                                    <>
                                        <span className={`text-[10px] md:text-sm font-bold mt-auto ${dayData.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            {formatAmount(dayData.amount)}
                                        </span>
                                        <span className="text-[9px] md:text-[10px] text-muted-foreground mb-auto">
                                            {isViewer ? dayData.strategicTrades : dayData.totalTrades} {(isViewer ? dayData.strategicTrades : dayData.totalTrades) === 1 ? 'trade' : 'trades'}
                                        </span>

                                        {/* Hover Tooltip */}
                                        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100
                      transition-opacity duration-200 pointer-events-none">
                                            <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[180px] text-sm">
                                                <div className="font-semibold mb-2 text-center border-b pb-1">
                                                    {month}/{day} Trade Statistics
                                                </div>
                                                {/* Market events in tooltip */}
                                                {dayEvents.length > 0 && (
                                                    <div className="mb-2 pb-2 border-b border-border/50">
                                                        {dayEvents.map(ev => {
                                                            const cfg = severityConfig[ev.severity as EventSeverity] ?? severityConfig.warning;
                                                            const isOngoing = !ev.end_date;
                                                            return (
                                                                <div key={ev.id} className="mb-1 last:mb-0">
                                                                    <div className={`font-medium flex items-center gap-1 ${cfg.text}`}>
                                                                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                                                        <span className="text-xs">{ev.title}</span>
                                                                    </div>
                                                                    {ev.description && (
                                                                        <div className="text-xs text-muted-foreground mt-0.5 pl-3">
                                                                            {ev.description}
                                                                        </div>
                                                                    )}
                                                                    <div className="text-[10px] text-muted-foreground pl-3">
                                                                        {ev.start_date.substring(5)}rise{isOngoing ? ' · in progress' : ` ~ ${ev.end_date!.substring(5)}`}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                {holiday && (
                                                    <div className="mb-2 pb-2 border-b border-border/50">
                                                        <div className="text-orange-500 font-medium flex items-center justify-center gap-1">
                                                            <span>{holiday.name}</span>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground text-center mt-0.5">
                                                            {holiday.details}
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="space-y-1">
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Profit and loss (Points)</span>
                                                        <span className={dayData.points >= 0 ? 'text-green-500' : 'text-red-500'}>
                                                            {formatPoints(dayData.points)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Profit and loss (Amount)</span>
                                                        <span className={dayData.amount >= 0 ? 'text-green-500' : 'text-red-500'}>
                                                            {formatAmount(dayData.amount)}
                                                        </span>
                                                    </div>
                                                    {!isViewer && (
                                                        <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Overall winning rate</span>
                                                            <span>{dayData.winRate}% ({dayData.wins}/{dayData.totalTrades})</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">{isViewer ? 'winning rate' : 'Strategy winning rate'}</span>
                                                        <span>{dayData.strategicWinRate}% ({dayData.strategicWins}/{dayData.strategicTrades})</span>
                                                    </div>
                                                </div>
                                                {!isViewer && (
                                                    <div className="text-xs text-muted-foreground text-center mt-2 pt-1 border-t">
                                                        Click to view Trades
                                                    </div>
                                                )}
                                                {/* Tooltip Arrow */}
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-popover"></div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Tooltip for days with events but no trades */}
                                {!hasTrade && (dayEvents.length > 0 || holiday) && (
                                    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100
                      transition-opacity duration-200 pointer-events-none">
                                        <div className="bg-popover border border-border rounded-lg shadow-lg p-2 min-w-[150px] text-sm">
                                            {dayEvents.length > 0 && (
                                                <div className={`${holiday ? 'mb-2 pb-2 border-b border-border/50' : ''}`}>
                                                    {dayEvents.map(ev => {
                                                        const cfg = severityConfig[ev.severity as EventSeverity] ?? severityConfig.warning;
                                                        const isOngoing = !ev.end_date;
                                                        return (
                                                            <div key={ev.id} className="mb-1 last:mb-0">
                                                                <div className={`font-medium flex items-center gap-1 ${cfg.text}`}>
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                                                    <span className="text-xs">{ev.title}</span>
                                                                </div>
                                                                {ev.description && (
                                                                    <div className="text-xs text-muted-foreground mt-0.5 pl-3">
                                                                        {ev.description}
                                                                    </div>
                                                                )}
                                                                <div className="text-[10px] text-muted-foreground pl-3">
                                                                    {ev.start_date.substring(5)}rise{isOngoing ? ' · in progress' : ` ~ ${ev.end_date!.substring(5)}`}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {holiday && (
                                                <>
                                                    <div className="text-orange-500 font-medium text-center">
                                                        {holiday.name}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground text-center mt-1">
                                                        {holiday.status === 'closed' ? 'Market closed' : 'close early'}
                                                        <br />
                                                        {holiday.details}
                                                    </div>
                                                </>
                                            )}
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-popover"></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
