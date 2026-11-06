"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";

type Preset = "this-month" | "last-month" | "this-quarter" | "year-to-date" | "this-year" | "last-year" | "custom";

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string) => void;
}

/** Local calendar date as YYYY-MM-DD (toISOString would shift it a day east of UTC). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getPresetDates(preset: Preset): { start: string; end: string } | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (preset) {
    case "this-month":
      return { start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m + 1, 0)) };
    case "last-month":
      return { start: ymd(new Date(y, m - 1, 1)), end: ymd(new Date(y, m, 0)) };
    case "this-quarter": {
      const q = Math.floor(m / 3) * 3;
      return { start: ymd(new Date(y, q, 1)), end: ymd(new Date(y, q + 3, 0)) };
    }
    case "year-to-date":
      return { start: `${y}-01-01`, end: ymd(now) };
    case "this-year":
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    case "last-year":
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
    default:
      return null;
  }
}

const presets: { label: string; value: Preset }[] = [
  { label: "This Month", value: "this-month" },
  { label: "Last Month", value: "last-month" },
  { label: "This Quarter", value: "this-quarter" },
  { label: "Year to Date", value: "year-to-date" },
  { label: "This Year", value: "this-year" },
  { label: "Last Year", value: "last-year" },
  { label: "Custom", value: "custom" },
];

/** The preset whose dates match the range the page is showing, else Custom. */
function presetFor(startDate: string, endDate: string): Preset {
  for (const p of presets) {
    const d = getPresetDates(p.value);
    if (d && d.start === startDate && d.end === endDate) return p.value;
  }
  // Pages default to Jan 1 through today, often with today taken in UTC.
  const ytd = getPresetDates("year-to-date");
  if (ytd && startDate === ytd.start && endDate === new Date().toISOString().slice(0, 10)) return "year-to-date";
  return "custom";
}

export function DateRangeFilter({ startDate, endDate, onDateChange }: DateRangeFilterProps) {
  // Follow the range the page actually loaded, so the highlighted button always
  // matches the numbers on screen. Choosing Custom keeps the pickers open even
  // while the dates still match a preset.
  const [customOpen, setCustomOpen] = useState(false);
  const matched = presetFor(startDate, endDate);
  const active: Preset = customOpen ? "custom" : matched;

  function handlePreset(preset: Preset) {
    setCustomOpen(preset === "custom");
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
          variant="ghost"
          size="sm"
          aria-pressed={active === p.value}
          onClick={() => handlePreset(p.value)}
          className={active === p.value ? "bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.08]" : "text-muted-foreground"}
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
