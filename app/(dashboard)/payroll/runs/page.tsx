"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { FileText, Plus, Search, ArrowUpDown, ChevronDown, Send, Play, CheckCircle2, XCircle, ReceiptText, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useTopbarAction } from "@/components/dashboard/topbar";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, MutedCell, StatusPill, daysUntil, formatDay, parseDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

/**
 * One row of GET /api/v1/payroll/runs. Each item also carries the full
 * employee record, including `bankAccountNumber`; only the name is used here.
 */
interface PayrollItem {
  id: string;
  employeeId: string;
  type: string;
  grossAmount: number;
  taxAmount: number;
  deductions: number;
  netAmount: number;
  bonusAmount: number | null;
  overtimeAmount: number | null;
  employee: { name: string; employeeNumber: string; department: string | null } | null;
}

interface PayrollRun {
  id: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  status: "draft" | "processing" | "completed" | "void" | "pending_approval";
  runType: string | null;
  parentRunId: string | null;
  notes: string | null;
  approvalStatus: "pending" | "approved" | "rejected" | null;
  approvedAt: string | null;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  journalEntryId: string | null;
  processedAt: string | null;
  createdAt: string;
  items: PayrollItem[];
}

// Plain-language payroll statuses for non-accountants. Sign-off sends a run
// back to draft, so "Signed off" and "Sent back" are drafts with an outcome.
const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Not finished", color: "#A1A1AA", hint: "Set up but not finished yet. Check the pay, then finish it" },
  { value: "sent_back", label: "Sent back", color: "#EF4444", hint: "Rejected at sign-off. Fix it, then send it again" },
  { value: "pending_approval", label: "Waiting for sign-off", color: "#6366F1", hint: "Someone needs to approve it before it can be finished" },
  { value: "approved", label: "Signed off", color: "#14B8A6", hint: "Approved and ready to finish" },
  { value: "processing", label: "Finishing", color: "#0EA5E9", hint: "Being locked in and recorded right now" },
  { value: "completed", label: "Finished & recorded", color: "#10B981", hint: "Pay is locked in and the wages are in your books" },
  { value: "void", label: "Cancelled", color: "#D4D4D8", hint: "Cancelled, so it no longer counts" },
];

const RUN_TYPES: Record<string, string> = {
  regular: "Regular",
  termination: "Final pay",
  bonus_only: "Bonus",
  correction: "Correction",
  off_cycle: "Off-cycle",
};

const RUN_TYPE_TONE: Record<string, string> = {
  termination: "bg-red-500/10 text-red-700 dark:text-red-400",
  bonus_only: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  correction: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  off_cycle: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

const PERIOD_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function statusOf(r: PayrollRun) {
  if (r.status === "draft" && r.approvalStatus === "approved") return "approved";
  if (r.status === "draft" && r.approvalStatus === "rejected") return "sent_back";
  return r.status;
}

const typeOf = (r: PayrollRun) => r.runType || "regular";
const typeLabel = (r: PayrollRun) => RUN_TYPES[typeOf(r)] ?? typeOf(r);
const people = (r: PayrollRun) => new Set(r.items.map((i) => i.employeeId)).size;
const withheld = (r: PayrollRun) => r.totalDeductions;

/** "Mar 1 – Mar 31, 2026" */
function periodLabel(r: PayrollRun) {
  const start = parseDay(r.payPeriodStart);
  const end = parseDay(r.payPeriodEnd);
  if (!start || !end) return `${r.payPeriodStart} to ${r.payPeriodEnd}`;
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${sameYear ? PERIOD_FMT.format(start) : formatDay(r.payPeriodStart)} – ${formatDay(r.payPeriodEnd)}`;
}

function TypeTag({ run }: { run: PayrollRun }) {
  const t = typeOf(run);
  if (t === "regular") return <span className="text-foreground/70">Regular</span>;
  return <span className={cn("rounded px-1.5 py-px text-[11.5px] font-medium", RUN_TYPE_TONE[t] ?? "bg-foreground/[0.055]")}>{RUN_TYPES[t] ?? t}</span>;
}

export default function PayrollRunsPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  useDocumentTitle("Payroll · Runs");

  // New run dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [payPeriodStart, setPayPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [payPeriodEnd, setPayPeriodEnd] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 0);
    return d.toISOString().split("T")[0];
  });

  async function handleCreateRun() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setCreating(true);

    try {
      const res = await fetch("/api/v1/payroll/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ payPeriodStart, payPeriodEnd }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create payroll run");
      }

      const data = await res.json();
      toast.success("Payroll run created");
      setDialogOpen(false);
      router.push(`/payroll/runs/${data.run.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create payroll run");
    } finally {
      setCreating(false);
    }
  }

  // Kept as it was: these post the same bodies the page always sent.
  const handleCreateOffCycleRun = useCallback(async (type: "termination" | "bonus-only" | "correction") => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const endpoints: Record<string, string> = {
      termination: "/api/v1/payroll/runs/termination",
      "bonus-only": "/api/v1/payroll/runs/bonus-only",
      correction: "/api/v1/payroll/runs/correction",
    };

    const bodies: Record<string, object> = {
      termination: { employeeId: "", payPeriodEnd },
      "bonus-only": { payPeriodStart, payPeriodEnd, items: [] },
      correction: { parentRunId: "", payPeriodStart, payPeriodEnd },
    };

    try {
      const res = await fetch(endpoints[type], {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify(bodies[type]),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to create ${type} run`);
      }

      const data = await res.json();
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} run created`);
      router.push(`/payroll/runs/${data.run.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to create ${type} run`);
    }
  }, [router, payPeriodStart, payPeriodEnd]);

  useTopbarAction(
    useMemo(
      () => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg px-3 text-[13px]" title="A one-off payment outside your normal payday">
              One-off payment
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleCreateOffCycleRun("termination")} title="A final pay for someone leaving">
              Final pay (someone leaving)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCreateOffCycleRun("bonus-only")} title="A one-off bonus payment">
              Bonus only
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCreateOffCycleRun("correction")} title="Fix a mistake in a past payroll">
              Fix a past payroll
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      [handleCreateOffCycleRun]
    )
  );

  const config = useMemo<ExplorerConfig<PayrollRun>>(
    () => ({
      id: "payroll-runs",
      endpoint: "/api/v1/payroll/runs",
      noun: { one: "Payroll run", many: "Payroll runs" },
      getId: (r) => r.id,
      href: (r) => `/payroll/runs/${r.id}`,
      status: { get: statusOf, options: STATUSES },
      date: { get: (r) => r.payPeriodEnd, label: "Pay date" },
      amount: (r) => r.totalGross,
      amountLabel: "Pay before deductions",
      search: (r) => [
        r.payPeriodStart,
        r.payPeriodEnd,
        periodLabel(r),
        r.status,
        STATUSES.find((s) => s.value === statusOf(r))?.label,
        typeLabel(r),
        r.notes,
        ...r.items.map((i) => i.employee?.name),
      ],
      defaultSort: { key: "period", dir: "desc" },
      facets: [{ key: "type", label: "Type", value: typeLabel }],
      create: { label: "New payroll run", onClick: () => setDialogOpen(true) },
      columns: [
        { key: "period", label: "Pay period", className: "w-56", value: (r) => r.payPeriodStart, render: (r) => <span className="font-medium tabular-nums">{periodLabel(r)}</span>, csv: (r) => `${r.payPeriodStart} to ${r.payPeriodEnd}` },
        { key: "type", label: "Type", className: "w-32", value: typeLabel, render: (r) => <TypeTag run={r} /> },
        { key: "status", label: "Status", className: "w-48", value: statusOf, render: (r) => <StatusPill value={statusOf(r)} options={STATUSES} /> },
        { key: "people", label: "People", align: "right", className: "w-24", hint: "How many employees are paid in this run", value: people },
        { key: "gross", label: "Before deductions", align: "right", className: "w-36", money: true, hint: "Total pay before tax and deductions", value: (r) => r.totalGross },
        {
          key: "deductions",
          label: "Taxes & deductions",
          align: "right",
          className: "w-36",
          money: true,
          hint: "Tax and other amounts held back from employees' pay",
          value: withheld,
          render: (r) => <span className={cn("tabular-nums", r.totalDeductions > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground/60")}>{formatMoney(r.totalDeductions)}</span>,
        },
        { key: "net", label: "Take-home", align: "right", className: "w-36", money: true, hint: "What lands in employees' bank accounts", value: (r) => r.totalNet, render: (r) => <span className="font-medium tabular-nums">{formatMoney(r.totalNet)}</span> },
        { key: "finished", label: "Finished on", className: "w-32", value: (r) => r.processedAt, render: (r) => <DateCell value={r.processedAt} /> },
        { key: "approved", label: "Signed off on", className: "w-32", hidden: true, value: (r) => r.approvedAt, render: (r) => <DateCell value={r.approvedAt} /> },
        { key: "start", label: "Period start", className: "w-32", hidden: true, value: (r) => r.payPeriodStart, render: (r) => <DateCell value={r.payPeriodStart} /> },
        { key: "end", label: "Period end", className: "w-32", hidden: true, value: (r) => r.payPeriodEnd, render: (r) => <DateCell value={r.payPeriodEnd} /> },
        { key: "notes", label: "Notes", hidden: true, value: (r) => r.notes, render: (r) => <MutedCell value={r.notes} /> },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (r) => r.createdAt, render: (r) => <DateCell value={r.createdAt} /> },
      ],
      metrics: (rows) => {
        const year = new Date().getFullYear();
        const done = rows.filter((r) => r.status === "completed");
        const thisYear = done.filter((r) => parseDay(r.payPeriodEnd)?.getFullYear() === year);
        const net = thisYear.reduce((s, r) => s + r.totalNet, 0);
        const gross = thisYear.reduce((s, r) => s + r.totalGross, 0);
        const tax = thisYear.reduce((s, r) => s + r.totalDeductions, 0);
        const last = [...done].sort((a, b) => b.payPeriodEnd.localeCompare(a.payPeriodEnd))[0];
        const open = rows.filter((r) => ["draft", "pending_approval", "processing"].includes(r.status));
        const next = [...open].sort((a, b) => a.payPeriodEnd.localeCompare(b.payPeriodEnd))[0];
        const nextDays = next ? daysUntil(next.payPeriodEnd) : null;
        const waiting = rows.filter((r) => r.status === "pending_approval");
        const drafts = rows.filter((r) => r.status === "draft");
        return [
          { key: "paid", label: "Paid this year", color: "#10B981", value: formatMoney(net), note: `${thisYear.length} run${thisYear.length === 1 ? "" : "s"} · ${formatMoney(gross)} before deductions`, hint: "Take-home pay from finished runs whose pay date falls this calendar year." },
          { key: "tax", label: "Held back this year", color: "#EF4444", value: formatMoney(tax), note: gross ? `${Math.round((tax / gross) * 100)}% of pay` : "Nothing yet", hint: "Taxes and deductions taken from employees' pay this year. Most of it has to be paid on to the tax office." },
          { key: "last", label: "Last payroll", color: "#0EA5E9", status: "completed", value: last ? formatDay(last.payPeriodEnd) : "—", note: last ? `${formatMoney(last.totalNet)} take-home · ${people(last)} people` : "Nothing finished yet", hint: "The most recent finished and recorded payroll." },
          {
            key: "next",
            label: "Next pay date",
            color: "#8B5CF6",
            value: next ? formatDay(next.payPeriodEnd) : "—",
            note: next ? (nextDays == null ? statusOfLabel(next) : nextDays < 0 ? `${-nextDays} days late · ${statusOfLabel(next)}` : nextDays === 0 ? `Today · ${statusOfLabel(next)}` : `In ${nextDays} days · ${statusOfLabel(next)}`) : "No run set up yet",
            hint: "The earliest payroll that still has to be finished.",
          },
          { key: "waiting", label: "Waiting for sign-off", color: "#6366F1", status: "pending_approval", value: waiting.length.toString(), note: waiting.length ? formatMoney(waiting.reduce((s, r) => s + r.totalNet, 0)) + " take-home" : "Nothing to approve", hint: "Runs someone has to approve before they can be finished." },
          { key: "drafts", label: "Not finished", color: "#A1A1AA", status: "draft", value: drafts.length.toString(), note: drafts.length ? formatMoney(drafts.reduce((s, r) => s + r.totalNet, 0)) + " take-home" : "All caught up", hint: "Runs that are set up but not finished. Employees aren't paid until you finish them." },
        ];
      },
      preview: (r, helpers) => {
        const s = statusOf(r);
        const items = [...r.items].sort((a, b) => (a.employee?.name ?? "").localeCompare(b.employee?.name ?? ""));
        return (
          <DocumentPreview
            number={periodLabel(r)}
            status={s}
            statusOptions={STATUSES}
            amount={r.totalNet}
            amountLabel="take-home"
            facts={[
              { label: "Type", value: <TypeTag run={r} /> },
              { label: "People paid", value: people(r) },
              { label: "Before deductions", value: formatMoney(r.totalGross) },
              { label: "Taxes & deductions", value: formatMoney(r.totalDeductions) },
              { label: "Pay date", value: formatDay(r.payPeriodEnd) },
              { label: "Finished on", value: formatDay(r.processedAt) },
              { label: "Sign-off", value: r.approvalStatus ? { pending: "Waiting", approved: "Approved", rejected: "Sent back" }[r.approvalStatus] : "Not needed" },
              { label: "Signed off on", value: formatDay(r.approvedAt) },
            ]}
            actions={
              <>
                {r.status === "draft" && (
                  <>
                    <ActionButton primary icon={<Play className="size-3.5" />} run={async () => router.push(`/payroll/runs/${r.id}`)}>
                      Review and finish
                    </ActionButton>
                    {r.approvalStatus !== "approved" && (
                      <ActionButton
                        icon={<Send className="size-3.5" />}
                        success="Sent for sign-off"
                        run={async () => {
                          await postJson(`/api/v1/payroll/runs/${r.id}/submit-for-approval`);
                          helpers.refresh();
                        }}
                      >
                        Send for sign-off
                      </ActionButton>
                    )}
                  </>
                )}
                {r.status === "pending_approval" && (
                  <>
                    <ActionButton
                      primary
                      icon={<CheckCircle2 className="size-3.5" />}
                      run={() =>
                        confirm({
                          title: "Approve this payroll?",
                          description: "This marks the payroll as approved and ready to finish.",
                          confirmLabel: "Approve",
                          onConfirm: async () => {
                            try {
                              await postJson(`/api/v1/payroll/runs/${r.id}/approve`);
                              toast.success("Payroll approved");
                              helpers.refresh();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Couldn't approve the payroll");
                              throw err;
                            }
                          },
                        })
                      }
                    >
                      Approve
                    </ActionButton>
                    <ActionButton
                      icon={<XCircle className="size-3.5" />}
                      className="text-red-600 dark:text-red-400"
                      run={() =>
                        confirm({
                          title: "Reject this payroll run?",
                          description: "This will send the run back to draft status.",
                          confirmLabel: "Reject",
                          destructive: true,
                          onConfirm: async () => {
                            try {
                              await postJson(`/api/v1/payroll/runs/${r.id}/reject`);
                              toast.success("Payroll run rejected");
                              helpers.refresh();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Failed to reject");
                              throw err;
                            }
                          },
                        })
                      }
                    >
                      Reject
                    </ActionButton>
                  </>
                )}
                {r.status === "completed" && (
                  <>
                    <ActionButton
                      primary
                      icon={<ReceiptText className="size-3.5" />}
                      success="Payslips generated"
                      run={async () => {
                        await postJson(`/api/v1/payroll/runs/${r.id}/generate-payslips`);
                        router.push(`/payroll/runs/${r.id}/payslips`);
                      }}
                    >
                      Generate payslips
                    </ActionButton>
                    <ActionButton icon={<FileText className="size-3.5" />} run={async () => router.push(`/payroll/runs/${r.id}/payslips`)}>
                      View payslips
                    </ActionButton>
                  </>
                )}
                {r.journalEntryId && (
                  <ActionButton icon={<BookOpen className="size-3.5" />} run={async () => router.push(`/accounting/${r.journalEntryId}`)}>
                    View entry
                  </ActionButton>
                )}
              </>
            }
          >
            <div className="mt-6">
              <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Who gets paid</p>
              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">Nobody is in this run yet</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border/80">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="h-8 bg-foreground/[0.025] text-[11.5px] text-muted-foreground">
                        <th className="px-3 text-left font-medium">Employee</th>
                        <th className="w-24 px-2 text-right font-medium">Before</th>
                        <th className="w-24 px-2 text-right font-medium">Held back</th>
                        <th className="w-24 px-3 text-right font-medium">Take-home</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i) => (
                        <tr key={i.id} className="border-t border-border/60 align-top">
                          <td className="px-3 py-2">
                            <span className="block truncate">{i.employee?.name ?? "—"}</span>
                            {(i.bonusAmount ?? 0) > 0 && <span className="block text-[11.5px] text-muted-foreground">incl. {formatMoney(i.bonusAmount ?? 0)} bonus</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{formatMoney(i.grossAmount)}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{formatMoney(i.taxAmount + i.deductions)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(i.netAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="space-y-1 border-t border-border/80 bg-foreground/[0.015] px-3 py-2.5">
                    <div className="flex justify-between text-[13px] text-muted-foreground">
                      <span>Before deductions</span>
                      <span className="tabular-nums">{formatMoney(r.totalGross)}</span>
                    </div>
                    <div className="flex justify-between text-[13px] text-muted-foreground">
                      <span>Taxes &amp; deductions</span>
                      <span className="tabular-nums">{formatMoney(r.totalDeductions)}</span>
                    </div>
                    <div className="flex justify-between text-[13px] font-semibold">
                      <span>Take-home</span>
                      <span className="tabular-nums">{formatMoney(r.totalNet)}</span>
                    </div>
                  </div>
                </div>
              )}
              {r.notes && (
                <div className="mt-5">
                  <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{r.notes}</p>
                </div>
              )}
            </div>
          </DocumentPreview>
        );
      },
      empty: <RunsEmpty onCreate={() => setDialogOpen(true)} />,
    }),
    [router, confirm]
  );

  return (
    <>
      <Explorer config={config} />
      <NewRunDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        payPeriodStart={payPeriodStart}
        setPayPeriodStart={setPayPeriodStart}
        payPeriodEnd={payPeriodEnd}
        setPayPeriodEnd={setPayPeriodEnd}
        onSubmit={handleCreateRun}
        loading={creating}
      />
      {confirmDialog}
    </>
  );
}

function statusOfLabel(r: PayrollRun) {
  return (STATUSES.find((s) => s.value === statusOf(r))?.label ?? r.status).toLowerCase();
}

function RunsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal className="space-y-6">
      {/* Visual empty state */}
      <div className="relative overflow-hidden rounded-2xl border border-dashed border-brand-200 dark:border-brand-900/50">
        <div className="relative flex flex-col items-center py-16 px-6">
          {/* Timeline illustration */}
          <div className="relative mb-8 w-full max-w-sm">
            <div className="absolute top-1/2 left-4 right-4 h-px bg-muted-foreground/15 -translate-y-1/2" />
            <div className="flex items-center justify-between relative">
              {[
                { icon: FileText, label: "Set up", delay: 0.15, active: true },
                { icon: Search, label: "Review", delay: 0.25, active: false },
                { icon: ArrowUpDown, label: "Finish & record", delay: 0.35, active: false },
              ].map((step) => (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: step.delay, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center gap-2"
                >
                  <div
                    className={cn(
                      "flex size-12 items-center justify-center rounded-xl",
                      step.active ? "bg-brand-100 dark:bg-brand-950/60 ring-4 ring-brand-100/50 dark:ring-brand-900/30" : "bg-muted/60 ring-2 ring-muted/40"
                    )}
                  >
                    <step.icon className={cn("size-5", step.active ? "text-brand-600 dark:text-brand-400" : "text-muted-foreground/40")} />
                  </div>
                  <span className={cn("text-xs font-medium", step.active ? "text-brand-700 dark:text-brand-300" : "text-muted-foreground/40")}>{step.label}</span>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.h3 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.4 }} className="text-lg font-semibold">
            Run your first payroll
          </motion.h3>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.45 }}
            className="mt-2 max-w-sm text-sm text-muted-foreground text-center leading-relaxed"
          >
            Set up a pay run for a date range, check each employee&apos;s pay, then finish it to lock in the amounts and record the wages.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.55 }} className="mt-6">
            <Button size="lg" onClick={onCreate} className="bg-brand-600 hover:bg-brand-700 shadow-md shadow-brand-600/20">
              <Plus className="mr-2 size-4" />
              New Payroll Run
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Ghost run rows with fake data */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.65 }}
        className="rounded-xl border border-dashed border-muted-foreground/15 divide-y divide-dashed divide-muted-foreground/10"
      >
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5" style={{ opacity: 1 - i * 0.25 }}>
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-muted/40" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-40 rounded bg-muted/40" />
                <div className="h-4 w-16 rounded-full bg-muted/25" />
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-4">
              <div className="space-y-1 text-right">
                <div className="h-2.5 w-8 rounded bg-muted/25 ml-auto" />
                <div className="h-3.5 w-16 rounded bg-muted/30" />
              </div>
              <div className="space-y-1 text-right">
                <div className="h-2.5 w-8 rounded bg-muted/25 ml-auto" />
                <div className="h-3.5 w-16 rounded bg-muted/30" />
              </div>
            </div>
          </div>
        ))}
      </motion.div>
    </ContentReveal>
  );
}

function NewRunDialog({
  open,
  onOpenChange,
  payPeriodStart,
  setPayPeriodStart,
  payPeriodEnd,
  setPayPeriodEnd,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payPeriodStart: string;
  setPayPeriodStart: (v: string) => void;
  payPeriodEnd: string;
  setPayPeriodEnd: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Payroll Run</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Pay Period Start</Label>
            <Input type="date" value={payPeriodStart} onChange={(e) => setPayPeriodStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Pay Period End</Label>
            <Input type="date" value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!payPeriodStart || !payPeriodEnd || loading} className="bg-brand-600 hover:bg-brand-700">
            {loading ? "Creating..." : "Create Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
