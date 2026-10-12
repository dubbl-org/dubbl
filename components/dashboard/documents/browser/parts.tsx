"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOLDER_COLORS } from "./glyphs";

/** Inline name editor: selects the name without its extension, Enter saves, Esc cancels. */
export function RenameInput({
  value,
  onDone,
  className,
}: {
  value: string;
  onDone: (name: string | null) => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = value.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : value.length);
  }, [value]);

  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };

  return (
    <input
      ref={ref}
      defaultValue={value}
      aria-label="Name"
      spellCheck={false}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(e.currentTarget.value);
        if (e.key === "Escape") finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
      className={cn(
        "h-6 w-full min-w-0 rounded-[5px] border border-foreground/25 bg-background px-1.5 text-[13px] outline-none ring-2 ring-foreground/10",
        className
      )}
    />
  );
}

/** Colour dots for a folder's label. */
export function ColorSwatches({ value, onPick }: { value: string | null; onPick: (color: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
      {FOLDER_COLORS.map((c) => (
        <button
          key={c.label}
          type="button"
          title={c.label}
          aria-label={c.label}
          onClick={() => onPick(c.value)}
          className={cn(
            "flex size-5 items-center justify-center rounded-full transition-transform hover:scale-110",
            !c.value && "border border-dashed border-foreground/30"
          )}
          style={c.value ? { backgroundColor: c.value } : undefined}
        >
          {(value ?? null) === c.value && <Check className={cn("size-3", c.value ? "text-white" : "text-foreground/60")} strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

/** Storage used against the plan's allowance. */
export function StorageMeter({ used, max, className }: { used: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const fmt = (n: number) =>
    n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(n >= 10 * 1024 ** 3 ? 0 : 1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(n >= 100 * 1024 ** 2 ? 0 : 1)} MB` : `${Math.round(n / 1024)} KB`;
  return (
    <div className={cn("px-2.5", className)}>
      <div className="h-1 overflow-hidden rounded-full bg-foreground/[0.07]">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", pct > 95 ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-foreground/60")}
          style={{ width: `${Math.max(pct, used > 0 ? 1.5 : 0)}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11.5px] text-muted-foreground">
        <span className="tabular-nums text-foreground/75">{fmt(used)}</span> of {fmt(max)} used
      </p>
    </div>
  );
}

/** A keyboard key, for menus and hints. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-border/90 bg-background px-1 font-sans text-[10.5px] font-medium text-muted-foreground shadow-[0_1px_0_rgba(0,0,0,0.04)]", className)}>
      {children}
    </kbd>
  );
}
