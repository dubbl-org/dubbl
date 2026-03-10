"use client";

import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface ForecastWeek {
  weekOf: string;
  inflows: number;
  outflows: number;
  net: number;
  entryCount: number;
  cumulativeNet: number;
}

interface ForecastData {
  forecastPeriod: { start: string; end: string; weeks: number };
  totalInflows: number;
  totalOutflows: number;
  netForecast: number;
  weeks: ForecastWeek[];
}

const periods = [
  { label: "30 days", weeks: 4 },
  { label: "60 days", weeks: 9 },
  { label: "90 days", weeks: 13 },
];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-md">
      <p className="text-xs font-medium mb-1.5">{label}</p>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          className="flex items-center justify-between gap-4 text-xs"
        >
          <span className="text-muted-foreground capitalize">
            {entry.dataKey}
          </span>
          <span
            className={cn(
              "font-mono tabular-nums font-medium",
              entry.dataKey === "inflows"
                ? "text-emerald-600"
                : entry.dataKey === "outflows"
                ? "text-red-600"
                : ""
            )}
          >
            $
            {entry.value.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CashFlowWidget() {
  const [weeks, setWeeks] = useState(4);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = localStorage.getItem("activeOrgId");
    if (!id) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/v1/reports/cash-flow-forecast?weeks=${weeks}`, {
          headers: { "x-organization-id": id },
          signal: controller.signal,
        });
        const data = await r.json();
        if (active) setForecast(data);
      } catch {
        if (active) setForecast(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [weeks]);

  const chartData =
    forecast?.weeks?.map((w) => ({
      name: new Date(w.weekOf).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      inflows: w.inflows / 100,
      outflows: w.outflows / 100,
      balance: w.cumulativeNet / 100,
    })) ?? [];

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
          Cash Flow Forecast
        </h3>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          {periods.map((p) => (
            <button
              key={p.weeks}
              onClick={() => setWeeks(p.weeks)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                weeks === p.weeks
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-[220px] rounded-md bg-muted animate-pulse" />
          <div className="grid grid-cols-3 gap-4 border-t pt-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                <div className="h-4 w-20 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : forecast ? (
        <>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="#10b981"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#10b981"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id="outflowGrad"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#ef4444"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#ef4444"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  tickFormatter={(v) =>
                    `$${(v / 1000).toFixed(0)}k`
                  }
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px" }}
                />
                <Area
                  type="monotone"
                  dataKey="inflows"
                  stroke="#10b981"
                  fill="url(#inflowGrad)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="outflows"
                  stroke="#ef4444"
                  fill="url(#outflowGrad)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#3b82f6"
                  fill="none"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Expected In</p>
              <p className="text-sm font-bold font-mono tabular-nums text-emerald-600">
                {formatMoney(forecast.totalInflows)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Expected Out</p>
              <p className="text-sm font-bold font-mono tabular-nums text-red-600">
                {formatMoney(forecast.totalOutflows)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Net Position</p>
              <p
                className={cn(
                  "text-sm font-bold font-mono tabular-nums",
                  forecast.netForecast >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                )}
              >
                {formatMoney(forecast.netForecast)}
              </p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
