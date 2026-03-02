"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TimePickerProps {
  hours: number;
  minutes: number;
  onChange: (hours: number, minutes: number) => void;
  className?: string;
}

export function TimePicker({ hours, minutes, onChange, className }: TimePickerProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Input
        type="number"
        min={0}
        max={23}
        value={hours.toString().padStart(2, "0")}
        onChange={(e) => {
          const h = Math.max(0, Math.min(23, parseInt(e.target.value) || 0));
          onChange(h, minutes);
        }}
        className="h-8 w-14 text-center font-mono text-sm"
      />
      <span className="text-sm font-medium text-muted-foreground">:</span>
      <Input
        type="number"
        min={0}
        max={59}
        value={minutes.toString().padStart(2, "0")}
        onChange={(e) => {
          const m = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
          onChange(hours, m);
        }}
        className="h-8 w-14 text-center font-mono text-sm"
      />
    </div>
  );
}
