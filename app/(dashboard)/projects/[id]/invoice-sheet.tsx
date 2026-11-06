"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useApi } from "@/lib/query/use-api";
import { fixedPriceInvoiceAmount } from "@/lib/projects/rules";
import { useProject, formatDateShort, projectFetch, errorText } from "./project-context";

interface UninvoicedMilestone { id: string; title: string; amount: number; invoicedAmountCents: number; remaining: number }
interface UninvoicedTimeEntry {
  id: string;
  date: string;
  description: string | null;
  minutes: number;
  hourlyRate: number;
  amount: number;
  user: { name: string | null } | null;
}
interface BillableExpense { id: string; description: string; billableAmount: number }
interface UninvoicedData {
  billingType: string;
  milestones?: UninvoicedMilestone[];
  timeEntries?: UninvoicedTimeEntry[];
  fixedPrice?: number;
  totalInvoiced?: number;
  remaining?: number;
  invoicedPercent?: number;
  billableExpenses?: BillableExpense[];
}

/**
 * The project's "Invoice" sheet. What it offers follows the billing type:
 * hourly projects pick unbilled time entries, milestone projects pick
 * milestones, fixed price projects bill a percentage of the fixed price. Any
 * registered billable expenses can be added too. Creates a draft invoice.
 */
export function ProjectInvoiceSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { project: proj, orgId, projectId } = useProject();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [milestoneIds, setMilestoneIds] = useState<string[]>([]);
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [expenseIds, setExpenseIds] = useState<string[]>([]);
  const [fixedPercent, setFixedPercent] = useState("");
  const [notes, setNotes] = useState("");

  const { data, loading } = useApi<UninvoicedData>(open ? `/api/v1/projects/${projectId}/progress-invoice` : null);

  // Fresh selection each time the sheet opens: all unbilled time and expenses ticked.
  useEffect(() => {
    if (!open) return;
    setMilestoneIds([]);
    setFixedPercent("");
    setNotes("");
  }, [open]);
  useEffect(() => {
    if (!open || !data) return;
    setEntryIds((data.timeEntries ?? []).map((e) => e.id));
    setExpenseIds((data.billableExpenses ?? []).map((e) => e.id));
  }, [open, data]);

  const expenses = data?.billableExpenses ?? [];
  const fixedRemaining = data?.remaining ?? 0;

  const workTotal = useMemo(() => {
    if (!data) return 0;
    if (data.billingType === "milestone") {
      return (data.milestones ?? []).filter((m) => milestoneIds.includes(m.id)).reduce((s, m) => s + m.remaining, 0);
    }
    if (data.billingType === "hourly") {
      return (data.timeEntries ?? []).filter((e) => entryIds.includes(e.id)).reduce((s, e) => s + e.amount, 0);
    }
    if (data.billingType === "fixed") {
      return fixedPriceInvoiceAmount(data.fixedPrice ?? 0, data.totalInvoiced ?? 0, parseFloat(fixedPercent) || 0);
    }
    return 0;
  }, [data, milestoneIds, entryIds, fixedPercent]);
  const expenseTotal = expenses.filter((e) => expenseIds.includes(e.id)).reduce((s, e) => s + e.billableAmount, 0);
  const total = workTotal + expenseTotal;

  if (!proj) return null;

  function toggle(list: string[], set: (v: string[]) => void, id: string) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function handleCreate() {
    if (!data || total <= 0) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        notes: notes || undefined,
        includeBillableExpenses: expenseIds.length > 0,
        billableItemIds: expenseIds,
      };
      if (data.billingType === "milestone") body.milestoneIds = milestoneIds;
      if (data.billingType === "hourly") body.timeEntryIds = entryIds;
      if (data.billingType === "fixed" && workTotal > 0) {
        body.percentageToInvoice = Math.min(100, Math.max(0, parseFloat(fixedPercent) || 0));
      }
      const res = await projectFetch<{ invoice: { id: string; invoiceNumber: string } }>(
        orgId,
        `/api/v1/projects/${projectId}/progress-invoice`,
        { method: "POST", body }
      );
      toast.success(`Draft invoice ${res.invoice.invoiceNumber} created`);
      onOpenChange(false);
      router.push(`/sales/${res.invoice.id}`);
    } catch (err) {
      toast.error(errorText(err, "Failed to create invoice"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <FileText className="size-5" />
            </div>
            <div>
              <SheetTitle className="text-lg">Invoice project</SheetTitle>
              <SheetDescription>
                Create a draft invoice for {proj.contact?.name ?? "the client"}. Nothing is posted until you approve and send it.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
          {loading && !data ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : data ? (
            <>
              {data.billingType === "milestone" && (
                <div className="space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Select milestones to invoice</p>
                  {(data.milestones ?? []).some((m) => m.remaining > 0) ? (
                    <div className="rounded-lg border divide-y">
                      {(data.milestones ?? []).map((m) => {
                        const hasRemaining = m.remaining > 0;
                        return (
                          <label
                            key={m.id}
                            className={cn("flex items-center gap-3 px-4 py-3 transition-colors", hasRemaining ? "cursor-pointer hover:bg-muted/20" : "opacity-50")}
                          >
                            <Checkbox
                              checked={milestoneIds.includes(m.id)}
                              onCheckedChange={() => hasRemaining && toggle(milestoneIds, setMilestoneIds, m.id)}
                              disabled={!hasRemaining}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium truncate">{m.title}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Total: {formatMoney(m.amount)} · Invoiced: {formatMoney(m.invoicedAmountCents)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={cn("text-[13px] font-mono tabular-nums font-medium", hasRemaining ? "text-foreground" : "text-muted-foreground")}>
                                {formatMoney(m.remaining)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">remaining</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground py-3">
                      {(data.milestones ?? []).length === 0
                        ? "No milestones yet. Add them on the Milestones tab."
                        : "All milestones have been fully invoiced."}
                    </p>
                  )}
                </div>
              )}

              {data.billingType === "hourly" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Uninvoiced time entries</p>
                    {(data.timeEntries ?? []).length > 0 && (
                      <button
                        className="text-[11px] text-blue-600 hover:underline font-medium"
                        onClick={() => {
                          const all = (data.timeEntries ?? []).map((e) => e.id);
                          setEntryIds(entryIds.length === all.length ? [] : all);
                        }}
                      >
                        {entryIds.length === (data.timeEntries ?? []).length ? "Deselect all" : "Select all"}
                      </button>
                    )}
                  </div>
                  {(data.timeEntries ?? []).length > 0 ? (
                    <div className="rounded-lg border divide-y max-h-[400px] overflow-y-auto">
                      {(data.timeEntries ?? []).map((e) => (
                        <label key={e.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors">
                          <Checkbox checked={entryIds.includes(e.id)} onCheckedChange={() => toggle(entryIds, setEntryIds, e.id)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] truncate">{e.description || "Time entry"}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatDateShort(e.date)} · {e.user?.name ? `${e.user.name} · ` : ""}
                              {Math.round((e.minutes / 60) * 100) / 100}h @ {formatMoney(e.hourlyRate)}/hr
                            </p>
                          </div>
                          <span className="text-[13px] font-mono tabular-nums font-medium shrink-0">{formatMoney(e.amount)}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground py-3">No uninvoiced time entries.</p>
                  )}
                </div>
              )}

              {data.billingType === "fixed" && (
                <div className="space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fixed price progress</p>
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-muted-foreground">Fixed price</span>
                        <span className="font-mono tabular-nums font-medium">{formatMoney(data.fixedPrice ?? 0)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-muted-foreground">Already invoiced</span>
                        <span className="font-mono tabular-nums">{formatMoney(data.totalInvoiced ?? 0)} ({data.invoicedPercent ?? 0}%)</span>
                      </div>
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-muted-foreground">Remaining</span>
                        <span className="font-mono tabular-nums font-medium text-brand-600">{formatMoney(fixedRemaining)}</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(100, data.invoicedPercent ?? 0)}%` }} />
                    </div>
                  </div>
                  {fixedRemaining > 0 ? (
                    <div className="space-y-2">
                      <Label>Percentage to invoice</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={100 - (data.invoicedPercent || 0)}
                          value={fixedPercent}
                          onChange={(e) => setFixedPercent(e.target.value)}
                          placeholder={`0 - ${100 - (data.invoicedPercent || 0)}`}
                          className="font-mono"
                        />
                        <span className="text-[13px] text-muted-foreground shrink-0">%</span>
                      </div>
                      {fixedPercent && (
                        <p className="text-[11px] text-muted-foreground">Amount: {formatMoney(workTotal)} (never more than what is left)</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">The fixed price has been fully invoiced.</p>
                  )}
                </div>
              )}

              {expenses.length > 0 && (
                <div className="space-y-4">
                  <div className="h-px bg-border" />
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Billable expenses</p>
                  <div className="rounded-lg border divide-y">
                    {expenses.map((e) => (
                      <label key={e.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors">
                        <Checkbox checked={expenseIds.includes(e.id)} onCheckedChange={() => toggle(expenseIds, setExpenseIds, e.id)} />
                        <p className="flex-1 min-w-0 text-[13px] truncate">{e.description}</p>
                        <span className="text-[13px] font-mono tabular-nums font-medium shrink-0">{formatMoney(e.billableAmount)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="h-px bg-border" />
              <div className="space-y-2">
                <Label>Invoice notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes to include on the invoice..." rows={2} />
              </div>
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground py-3">Failed to load billing data.</p>
          )}
        </div>

        <div className="sticky bottom-0 z-10 border-t bg-background/80 backdrop-blur-sm">
          {total > 0 && (
            <div className="px-6 py-3 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-muted-foreground">Invoice total</span>
                <span className="text-lg font-bold font-mono tabular-nums">{formatMoney(total)}</span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || total <= 0} className="bg-blue-600 hover:bg-blue-700">
              {saving ? "Creating..." : "Create Invoice"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
