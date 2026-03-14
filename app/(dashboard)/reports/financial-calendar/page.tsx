"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  date: string;
  type: "invoice_due" | "bill_due" | "recurring_generation" | "budget_period_start";
  title: string;
  amount?: number;
  id?: string;
  status?: string;
}

const typeColors: Record<string, { bg: string; text: string; dot: string }> = {
  invoice_due: { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  bill_due: { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-700 dark:text-red-300", dot: "bg-red-500" },
  recurring_generation: { bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  budget_period_start: { bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
};

const typeLabels: Record<string, string> = {
  invoice_due: "Invoice Due",
  bill_due: "Bill Due",
  recurring_generation: "Recurring",
  budget_period_start: "Budget Period",
};

export default function FinancialCalendarPage() {
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    const startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().slice(0, 10);

    fetch(`/api/v1/reports/financial-calendar?startDate=${startDate}&endDate=${endDate}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setEvents(data.events || []);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, [currentMonth]);

  const monthName = currentMonth.toLocaleString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const startDay = currentMonth.getDay();
  const today = new Date().toISOString().slice(0, 10);

  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const existing = eventsByDate.get(e.date) || [];
    existing.push(e);
    eventsByDate.set(e.date, existing);
  }

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) || []) : [];

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Financial Calendar"
        description="Upcoming due dates, recurring generations, and budget periods."
      />

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <ContentReveal>
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            {/* Calendar Grid */}
            <div className="rounded-lg border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
                  <ChevronLeft className="size-4" />
                </Button>
                <p className="text-sm font-medium">{monthName}</p>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              <div className="p-2">
                <div className="grid grid-cols-7 mb-1">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1.5">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {Array.from({ length: startDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-20 border-t border-r last:border-r-0" />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dayEvents = eventsByDate.get(dateStr) || [];
                    const isToday = dateStr === today;
                    const isSelected = dateStr === selectedDate;

                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDate(dateStr === selectedDate ? null : dateStr)}
                        className={cn(
                          "h-20 border-t border-r p-1 text-left transition-colors hover:bg-muted/50",
                          (startDay + i + 1) % 7 === 0 && "border-r-0",
                          isSelected && "bg-muted"
                        )}
                      >
                        <span className={cn(
                          "inline-flex size-5 items-center justify-center rounded-full text-[11px]",
                          isToday && "bg-emerald-600 text-white font-medium"
                        )}>
                          {day}
                        </span>
                        <div className="mt-0.5 space-y-0.5">
                          {dayEvents.slice(0, 3).map((e, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <div className={cn("size-1.5 rounded-full shrink-0", typeColors[e.type]?.dot)} />
                              <span className="text-[9px] truncate text-muted-foreground">{e.title.split(" - ")[0]}</span>
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 3} more</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Event Detail Panel */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                {Object.entries(typeLabels).map(([type, label]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className={cn("size-2 rounded-full", typeColors[type]?.dot)} />
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>

              {selectedDate ? (
                <div>
                  <p className="text-sm font-medium mb-2">{selectedDate}</p>
                  {selectedEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No events on this date.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedEvents.map((e, i) => (
                        <div key={i} className={cn("rounded-lg p-3 space-y-1", typeColors[e.type]?.bg)}>
                          <div className="flex items-center gap-2">
                            <div className={cn("size-2 rounded-full", typeColors[e.type]?.dot)} />
                            <span className={cn("text-xs font-medium", typeColors[e.type]?.text)}>
                              {typeLabels[e.type]}
                            </span>
                          </div>
                          <p className="text-sm font-medium">{e.title}</p>
                          {e.amount !== undefined && (
                            <p className="text-sm font-mono tabular-nums">{formatMoney(e.amount)}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">Click a date to see events</p>
                </div>
              )}

              {/* Upcoming list */}
              {events.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">All Events This Month</p>
                  <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {events.map((e, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={cn("size-1.5 rounded-full shrink-0", typeColors[e.type]?.dot)} />
                          <span className="text-muted-foreground w-16 shrink-0">{e.date}</span>
                          <span className="truncate">{e.title}</span>
                        </div>
                        {e.amount !== undefined && (
                          <span className="font-mono tabular-nums shrink-0 ml-2">{formatMoney(e.amount)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}
