"use client";

import { useState } from "react";
import { Loader2, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { postJson } from "@/components/dashboard/explorer/action-button";

/** "Mark lost" with an optional reason, so the analytics can say why deals slip away. */
export function LostButton({ dealIds, onDone, label = "Mark lost" }: { dealIds: string[]; onDone: () => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      for (const id of dealIds) await postJson(`/api/v1/crm/deals/${id}/lost`, { reason: reason.trim() || null });
      toast.success(dealIds.length === 1 ? "Marked as lost" : `${dealIds.length} deals marked as lost`);
      setOpen(false);
      setReason("");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={dealIds.length === 0}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-[13px] font-medium transition-colors hover:bg-foreground/[0.03] disabled:pointer-events-none disabled:opacity-40"
        >
          <ThumbsDown className="size-3.5" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <p className="text-[13px] font-medium">Why was it lost?</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Optional, but it helps you spot patterns later.</p>
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. Went with a cheaper supplier"
          className="mt-2.5 h-8 w-full rounded-lg bg-foreground/[0.04] px-2.5 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:bg-background focus:ring-1 focus:ring-border"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="h-7 rounded-md px-2.5 text-[12.5px] text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-[12.5px] font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-3 animate-spin" />}
            Mark lost
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
