"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";

type Preset = "this-month" | "last-month" | "this-quarter" | "this-year" | "last-year" | "custom";

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string) => void;
}

function getPresetDates(preset: Preset): { start: string; end: string } | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (preset) {
    case "this-month":
      return {
        start: new Date(y, m, 1).toISOString().slice(0, 10),
        end: new Date(y, m + 1, 0).toISOString().slice(0, 10),
      };
    case "last-month":
      return {
        start: new Date(y, m - 1, 1).toISOString().slice(0, 10),
        end: new Date(y, m, 0).toISOString().slice(0, 10),
      };
    case "this-quarter": {
      const q = Math.floor(m / 3) * 3;
      return {
        start: new Date(y, q, 1).toISOString().slice(0, 10),
        end: new Date(y, q + 3, 0).toISOString().slice(0, 10),
      };
    }
    case "this-year":
      return {
        start: `${y}-01-01`,
        end: `${y}-12-31`,
      };
    case "last-year":
      return {
        start: `${y - 1}-01-01`,
        end: `${y - 1}-12-31`,
      };
    default:
      return null;
  }
}

const presets: { label: string; value: Preset }[] = [
  { label: "This Month", value: "this-month" },
  { label: "Last Month", value: "last-month" },
  { label: "This Quarter", value: "this-quarter" },
  { label: "This Year", value: "this-year" },
  { label: "Last Year", value: "last-year" },
  { label: "Custom", value: "custom" },
];

export function DateRangeFilter({ startDate, endDate, onDateChange }: DateRangeFilterProps) {
  const [active, setActive] = useState<Preset>("this-month");

  function handlePreset(preset: Preset) {
    setActive(preset);
    const dates = getPresetDates(preset);
    if (dates) {
      onDateChange(dates.start, dates.end);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <Button
          key={p.value}
          variant={active === p.value ? "default" : "outline"}
          size="sm"
          onClick={() => handlePreset(p.value)}
          className={active === p.value ? "bg-emerald-600 hover:bg-emerald-700" : ""}
        >
          {p.label}
        </Button>
      ))}
      {active === "custom" && (
        <div className="flex items-center gap-2 ml-2">
          <DatePicker
            value={startDate}
            onChange={(v) => onDateChange(v, endDate)}
            placeholder="Start date"
            className="w-40 h-8 text-sm"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <DatePicker
            value={endDate}
            onChange={(v) => onDateChange(startDate, v)}
            placeholder="End date"
            className="w-40 h-8 text-sm"
          />
        </div>
      )}
    </div>
  );
}
