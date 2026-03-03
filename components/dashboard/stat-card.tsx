import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  sparklineData?: number[];
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-20">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-emerald-500"
      />
    </svg>
  );
}

export function StatCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  sparklineData,
}: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/50 border-t-2 border-t-emerald-500/20 bg-card/80 backdrop-blur-sm p-5 shadow-sm transition-all duration-150 hover:shadow-lg hover:shadow-emerald-500/5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/50">
          <Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
        </div>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold tracking-tight font-mono tabular-nums">
            {value}
          </p>
          {change && (
            <span
              className={cn(
                "text-xs font-medium",
                changeType === "positive" && "text-emerald-600",
                changeType === "negative" && "text-red-600",
                changeType === "neutral" && "text-muted-foreground"
              )}
            >
              {change}
            </span>
          )}
        </div>
        {sparklineData && <Sparkline data={sparklineData} />}
      </div>
    </div>
  );
}
