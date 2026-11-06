"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Play, Search, X, FileText, CheckCircle2, XCircle, Gift, ScrollText, Send, Plus, BookOpen, ArrowRight, Trash2, Ban, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { cn } from "@/lib/utils";
import { useApi, useApiCache } from "@/lib/query/use-api";

interface PayrollRunDetail {
  id: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  status: string;
  approvalStatus: string | null;
  runType: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  journalEntryId: string | null;
  processedAt: string | null;
  notes: string | null;
  items: PayrollItemRow[];
  approvalRecords?: {
    id: string;
    status: string;
    comment: string | null;
    decidedAt: string | null;
    approver: { user: { name: string | null; email: string } | null } | null;
  }[];
  journalEntry?: { id: string; entryNumber: number; voidedAt: string | null; voidReason: string | null } | null;
}

interface TaxLine {
  id: string;
  jurisdictionLevel: string;
  jurisdiction: string | null;
  taxKind: string;
  amount: number;
}

interface PayrollItemRow {
  id: string;
  employeeId: string;
  grossAmount: number;
  taxAmount: number;
  deductions: number;
  netAmount: number;
  type: string | null;
  description: string | null;
  currency: string | null;
  fxRate: number | null;
  employee: { name: string; employeeNumber: string } | null;
  taxBreakdowns?: TaxLine[];
  deductionBreakdowns?: { id: string; amount: number; category: string; deductionType: { name: string } | null }[];
}

interface Bonus {
  id: string;
  employeeId: string;
  bonusType: string;
  amount: number;
  description: string | null;
  employee?: { name: string };
}

const statusColors: Record<string, string> = {
  draft: "",
  processing: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
  pending_approval: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

// Plain-language payroll status labels for non-accountants.
const statusLabels: Record<string, string> = {
  draft: "Not finished",
  processing: "Finishing",
  completed: "Finished & recorded",
  void: "Cancelled",
  pending_approval: "Waiting for sign-off",
};

const approvalLabels: Record<string, string> = {
  pending: "Waiting for sign-off",
  approved: "Signed off",
  rejected: "Sent back",
};

const TAX_KIND_LABELS: Record<string, string> = {
  social_security: "Social Security",
  medicare: "Medicare",
  additional_medicare: "Additional Medicare",
};

/** "Federal income tax", "State income tax (CA)", "Social Security", ... */
function taxLabel(t: TaxLine): string {
  if (t.taxKind !== "income_tax") return TAX_KIND_LABELS[t.taxKind] ?? t.taxKind.replace(/_/g, " ");
  const level = t.jurisdictionLevel === "federal" ? "Federal" : t.jurisdictionLevel === "state" ? "State" : "Local";
  return `${level} income tax${t.jurisdiction ? ` (${t.jurisdiction})` : ""}`;
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const bonusTypes = [
  { value: "performance", label: "Performance" },
  { value: "signing", label: "Signing" },
  { value: "holiday", label: "Holiday" },
  { value: "referral", label: "Referral" },
  { value: "spot", label: "Spot" },
  { value: "retention", label: "Retention" },
  { value: "other", label: "Other" },
];

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

export default function PayrollRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, refetch } = useApi<{ run?: PayrollRunDetail }>(`/api/v1/payroll/runs/${id}`);
  const run = data?.run ?? null;
  const [processing, setProcessing] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [generatingPayslips, setGeneratingPayslips] = useState(false);
  const [emailingPayslips, setEmailingPayslips] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  useDocumentTitle("Payroll · Run Details");

  const bonusesUrl = `/api/v1/payroll/runs/${id}/bonuses`;
  const { data: bonusesData, refetch: refetchBonuses } = useApi<{ bonuses?: Bonus[] }>(bonusesUrl);
  const bonuses = bonusesData?.bonuses ?? [];
  const cache = useApiCache();
  const [bonusDialogOpen, setBonusDialogOpen] = useState(false);
  const [bonusForm, setBonusForm] = useState({
    employeeId: "",
    bonusType: "",
    amount: "",
    description: "",
  });
  const [creatingBonus, setCreatingBonus] = useState(false);

  async function handleProcess() {
    const confirmed = await confirm({
      title: "Finish this payroll and record it?",
      description:
        "This locks in the pay amounts and records the wages and taxes in your books. It can't be undone.",
      confirmLabel: "Finish and record",
      destructive: true,
    });
    if (!confirmed) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setProcessing(true);

    try {
      const res = await fetch(`/api/v1/payroll/runs/${id}/process`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Payroll finished and recorded");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't finish the payroll");
    } finally {
      setProcessing(false);
    }
  }

  async function handleSubmitForApproval() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setSubmittingApproval(true);

    try {
      const res = await fetch(`/api/v1/payroll/runs/${id}/submit-for-approval`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Sent for sign-off");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send for sign-off");
    } finally {
      setSubmittingApproval(false);
    }
  }

  async function handleApprove() {
    const confirmed = await confirm({
      title: "Approve this payroll?",
      description: "This marks the payroll as approved and ready to finish.",
      confirmLabel: "Approve",
    });
    if (!confirmed) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setApproving(true);

    try {
      const res = await fetch(`/api/v1/payroll/runs/${id}/approve`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Payroll approved");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't approve the payroll");
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setRejecting(true);

    try {
      const res = await fetch(`/api/v1/payroll/runs/${id}/reject`, {
        method: "POST",
        headers: { "x-organization-id": orgId, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Payroll sent back");
      setRejectOpen(false);
      setRejectReason("");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setRejecting(false);
    }
  }

  async function handleGeneratePayslips() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setGeneratingPayslips(true);

    try {
      const res = await fetch(`/api/v1/payroll/runs/${id}/generate-payslips`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Payslips generated");
      router.push(`/payroll/runs/${id}/payslips`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate payslips");
    } finally {
      setGeneratingPayslips(false);
    }
  }

  async function handleCreateBonus() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    if (!bonusForm.employeeId || !bonusForm.bonusType || !bonusForm.amount) {
      toast.error("Please fill in all required fields");
      return;
    }
    setCreatingBonus(true);

    try {
      const res = await fetch(`/api/v1/payroll/runs/${id}/bonuses`, {
        method: "POST",
        headers: {
          "x-organization-id": orgId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: bonusForm.employeeId,
          bonusType: bonusForm.bonusType,
          amount: Math.round(parseFloat(bonusForm.amount) * 100),
          description: bonusForm.description || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      // The employee's pay and the run totals are recalculated with the bonus.
      await Promise.all([refetch(), refetchBonuses()]);
      toast.success("Bonus added");
      setBonusDialogOpen(false);
      setBonusForm({ employeeId: "", bonusType: "", amount: "", description: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add bonus");
    } finally {
      setCreatingBonus(false);
    }
  }

  async function handleRemoveBonus(bonusId: string) {
    const confirmed = await confirm({
      title: "Remove this bonus?",
      description: "The employee's pay in this run is worked out again without it.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/payroll/runs/${id}/bonuses/${bonusId}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      await Promise.all([refetch(), refetchBonuses()]);
      toast.success("Bonus removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove the bonus");
    }
  }

  async function handleDeleteRun() {
    const confirmed = await confirm({
      title: "Delete this payroll run?",
      description: "The run and its pay amounts are removed. Nothing has been recorded in your books yet.",
      confirmLabel: "Delete run",
      destructive: true,
    });
    if (!confirmed) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/v1/payroll/runs/${id}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Payroll run deleted");
      cache.invalidate("/api/v1/payroll/runs");
      router.push("/payroll/runs");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the run");
    } finally {
      setRemoving(false);
    }
  }

  async function handleVoidRun() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setRemoving(true);
    try {
      const qs = voidReason.trim() ? `?reason=${encodeURIComponent(voidReason.trim())}` : "";
      const res = await fetch(`/api/v1/payroll/runs/${id}${qs}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Payroll run voided and reversed in your books");
      setVoidOpen(false);
      setVoidReason("");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't void the run");
    } finally {
      setRemoving(false);
    }
  }

  async function handleEmailPayslips() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setEmailingPayslips(true);
    try {
      const res = await fetch(`/api/v1/payroll/runs/${id}/email-payslips`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const parts = [`${data.sent} sent`];
      if (data.skippedNoEmail) parts.push(`${data.skippedNoEmail} with no email address`);
      if (data.alreadySent) parts.push(`${data.alreadySent} already sent`);
      if (data.failed?.length) parts.push(`couldn't send to ${data.failed.join(", ")}`);
      toast.success(`Payslips emailed: ${parts.join(", ")}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't email the payslips");
    } finally {
      setEmailingPayslips(false);
    }
  }

  if (loading) return <BrandLoader />;

  if (!run) {
    return (
      <ContentReveal>
        <button
          onClick={() => router.push("/payroll/runs")}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="size-3.5" />
          Back to runs
        </button>
        <p className="text-sm text-muted-foreground">Payroll run not found</p>
      </ContentReveal>
    );
  }

  const filteredItems = (run.items || []).filter((item) => {
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    const nameMatch = item.employee?.name.toLowerCase().includes(q);
    const numMatch = item.employee?.employeeNumber.toLowerCase().includes(q);
    return nameMatch || numMatch;
  });

  return (
    <ContentReveal className="space-y-6">
      {/* Back link */}
      <button
        onClick={() => router.push("/payroll/runs")}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Back to runs
      </button>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            run.status === "completed"
              ? "bg-brand-50 dark:bg-brand-950/40"
              : "bg-muted"
          )}>
            <FileText className={cn(
              "size-5",
              run.status === "completed"
                ? "text-brand-600 dark:text-brand-400"
                : "text-muted-foreground"
            )} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold">
                {run.payPeriodStart} to {run.payPeriodEnd}
              </h1>
              <Badge variant="outline" className={statusColors[run.status] || ""}>
                {statusLabels[run.status] || run.status.replace(/_/g, " ")}
              </Badge>
              {run.runType && run.runType !== "regular" && (
                <Badge variant="outline" className="capitalize">
                  {run.runType.replace(/_/g, " ")}
                </Badge>
              )}
              {run.approvalStatus && run.status !== "pending_approval" && run.status !== "completed" && run.status !== "void" && (
                <Badge
                  variant="outline"
                  className={run.approvalStatus === "approved"
                    ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300"
                    : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"}
                >
                  {approvalLabels[run.approvalStatus] || run.approvalStatus.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {run.processedAt ? `Finished and recorded ${formatDateTime(run.processedAt)}` : "Not finished yet"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(run.status === "draft" || run.status === "pending_approval") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteRun}
              disabled={removing}
              title="Delete this unfinished run"
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Delete
            </Button>
          )}
          {run.status === "completed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVoidOpen(true)}
              disabled={removing}
              title="Cancel this finished run and reverse its accounting entry"
            >
              <Ban className="mr-1.5 size-3.5" />
              Void run
            </Button>
          )}
          {run.status === "draft" && (
            <>
              {run.approvalStatus !== "approved" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSubmitForApproval}
                  disabled={submittingApproval}
                  title="Send this payroll to someone for sign-off before it's finished"
                >
                  <Send className="mr-1.5 size-3.5" />
                  {submittingApproval ? "Sending..." : "Send for sign-off"}
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleProcess}
                disabled={processing}
                className="bg-brand-600 hover:bg-brand-700"
                title="Lock in the pay amounts and record the wages and taxes in your books"
              >
                <Play className="mr-1.5 size-3.5" />
                {processing ? "Finishing..." : "Finish & record payroll"}
              </Button>
            </>
          )}
          {run.status === "pending_approval" && (
            <>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={approving}
                className="bg-brand-600 hover:bg-brand-700"
              >
                <CheckCircle2 className="mr-1.5 size-3.5" />
                {approving ? "Approving..." : "Approve"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setRejectOpen(true)}
                disabled={rejecting}
              >
                <XCircle className="mr-1.5 size-3.5" />
                Send back
              </Button>
            </>
          )}
        </div>
      </div>

      {run.status === "void" && (
        <div className="rounded-xl border border-dashed bg-card p-4 text-sm">
          <p className="font-medium">This run was voided</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            A reversing accounting entry cancelled its wages, withholdings and payment
            {run.journalEntry?.voidReason ? `. Reason: ${run.journalEntry.voidReason}` : "."}
          </p>
        </div>
      )}

      {(run.approvalRecords?.length ?? 0) > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sign-off</p>
          {run.approvalRecords!.map((r) => (
            <p key={r.id} className="text-sm">
              <span className="font-medium">{r.approver?.user?.name || r.approver?.user?.email || "Approver"}</span>
              <span className="text-muted-foreground">
                {" "}· {approvalLabels[r.status] || r.status}
                {r.decidedAt ? ` ${formatDateTime(r.decidedAt)}` : ""}
                {r.comment ? `: ${r.comment}` : ""}
              </span>
            </p>
          ))}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pay before deductions</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate">{formatMoney(run.totalGross)}</p>
        </motion.div>
        <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Taxes &amp; deductions</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate text-red-600 dark:text-red-400">{formatMoney(run.totalDeductions)}</p>
        </motion.div>
        <motion.div {...anim(0.09)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Take-home pay</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate text-brand-600 dark:text-brand-400">{formatMoney(run.totalNet)}</p>
        </motion.div>
      </div>

      {/* Accounting entry (GL journal posted when the run was finished) */}
      {run.journalEntryId ? (
        <motion.button
          {...anim(0.12)}
          onClick={() => router.push(`/accounting/${run.journalEntryId}`)}
          className="group flex w-full items-center justify-between gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
              <BookOpen className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">View accounting entry</p>
              <p className="text-xs text-muted-foreground truncate">
                Wages {formatMoney(run.totalGross)} · Taxes &amp; deductions {formatMoney(run.totalDeductions)} · Net paid {formatMoney(run.totalNet)}
              </p>
            </div>
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </motion.button>
      ) : run.status === "completed" ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed bg-card p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
            <BookOpen className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No accounting entry linked</p>
            <p className="text-xs text-muted-foreground">This run was finished but no journal entry is on record.</p>
          </div>
        </div>
      ) : null}

      {/* Employee items */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold">Employees ({run.items?.length || 0})</h3>
          <div className="relative sm:max-w-xs w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8 h-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <FileText className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">
              {search ? "No employees match your search" : "No employees in this run"}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {filteredItems.map((item) => (
              <div key={item.id}>
              <div
                className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer hover:bg-muted/40"
                onClick={() => setExpanded((cur) => (cur === item.id ? null : item.id))}
                title="Show the taxes and deductions"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.employee?.name || "-"}</p>
                  <p className="text-xs text-muted-foreground font-mono">{item.employee?.employeeNumber}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {item.type && (
                      <Badge variant="outline" className="text-[9px] h-4 capitalize">
                        {item.type.replace(/_/g, " ")}
                      </Badge>
                    )}
                    {item.description && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{item.description}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  {item.currency && item.currency !== "USD" && (
                    <Badge variant="outline" className="text-[9px] h-4 font-mono shrink-0">
                      {item.currency}
                      {item.fxRate && item.fxRate !== 1 && (
                        <span className="ml-0.5 text-muted-foreground">@ {item.fxRate.toFixed(4)}</span>
                      )}
                    </Badge>
                  )}
                  <div className="hidden sm:block text-right">
                    <p className="text-xs text-muted-foreground">Before deductions</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(item.grossAmount, item.currency ?? "USD")}</p>
                  </div>
                  <div className="hidden sm:block text-right">
                    <p className="text-xs text-muted-foreground">Tax</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(item.taxAmount, item.currency ?? "USD")}</p>
                  </div>
                  <div className="hidden sm:block text-right">
                    <p className="text-xs text-muted-foreground">Other deductions</p>
                    {/* item.deductions includes the tax, so take it out here. */}
                    <p className="text-sm font-mono tabular-nums">{formatMoney(Math.max(0, item.deductions - item.taxAmount), item.currency ?? "USD")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Take-home</p>
                    <p className="text-sm font-mono tabular-nums font-medium">{formatMoney(item.netAmount, item.currency ?? "USD")}</p>
                  </div>
                </div>
              </div>
              {expanded === item.id && (
                <div className="px-4 pb-3 text-xs space-y-1">
                  {(item.taxBreakdowns ?? []).map((t) => (
                    <div key={t.id} className="flex justify-between">
                      <span className="text-muted-foreground">{taxLabel(t)}</span>
                      <span className="font-mono tabular-nums">{formatMoney(t.amount, item.currency ?? "USD")}</span>
                    </div>
                  ))}
                  {(item.taxBreakdowns ?? []).length === 0 && item.taxAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax</span>
                      <span className="font-mono tabular-nums">{formatMoney(item.taxAmount, item.currency ?? "USD")}</span>
                    </div>
                  )}
                  {(item.deductionBreakdowns ?? []).map((d) => (
                    <div key={d.id} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {d.deductionType?.name ?? "Deduction"} ({d.category === "pre_tax" ? "before tax" : "after tax"})
                      </span>
                      <span className="font-mono tabular-nums">{formatMoney(d.amount, item.currency ?? "USD")}</span>
                    </div>
                  ))}
                  {(item.taxBreakdowns ?? []).length === 0 && (item.deductionBreakdowns ?? []).length === 0 && item.taxAmount === 0 && (
                    <p className="text-muted-foreground">Nothing withheld</p>
                  )}
                </div>
              )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bonuses section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Gift className="size-4" />
            Bonuses ({bonuses.length})
          </h3>
          {run.status === "draft" && (
          <Dialog open={bonusDialogOpen} onOpenChange={setBonusDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="mr-1.5 size-3.5" />
                Add Bonus
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Bonus</DialogTitle>
                <DialogDescription>
                  Add a bonus for an employee in this payroll run. Their pay is worked out again with the bonus taxed as part of it.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Employee</Label>
                  <Select
                    value={bonusForm.employeeId}
                    onValueChange={(v) => setBonusForm((f) => ({ ...f, employeeId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {(run.items || []).map((item) =>
                        item.employee ? (
                          <SelectItem key={item.id} value={item.employeeId}>
                            {item.employee.name} ({item.employee.employeeNumber})
                          </SelectItem>
                        ) : null
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Bonus Type</Label>
                  <Select
                    value={bonusForm.bonusType}
                    onValueChange={(v) => setBonusForm((f) => ({ ...f, bonusType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {bonusTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <CurrencyInput
                    prefix="$"
                    value={bonusForm.amount}
                    onChange={(v) => setBonusForm((f) => ({ ...f, amount: v }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Optional description..."
                    value={bonusForm.description}
                    onChange={(e) => setBonusForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateBonus}
                  disabled={creatingBonus}
                  size="sm"
                >
                  {creatingBonus ? "Adding..." : "Add Bonus"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>

        {bonuses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border bg-card">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <Gift className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No bonuses added</p>
            <p className="text-xs text-muted-foreground mt-1">
              {run.status === "draft" ? "Add bonuses for employees in this payroll run" : "Bonuses can only be added while a run isn't finished"}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {bonuses.map((bonus) => (
              <div
                key={bonus.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{bonus.employee?.name || "-"}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[9px] h-4 capitalize">
                      {bonus.bonusType.replace(/_/g, " ")}
                    </Badge>
                    {bonus.description && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{bonus.description}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-mono tabular-nums font-medium">
                    {formatMoney(bonus.amount)}
                  </p>
                  {run.status === "draft" && (
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => handleRemoveBonus(bonus.id)} title="Remove bonus">
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate Payslips */}
      {run.status === "completed" && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleGeneratePayslips}
            disabled={generatingPayslips}
          >
            <ScrollText className="mr-1.5 size-3.5" />
            {generatingPayslips ? "Generating..." : "Generate Payslips"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/payroll/runs/${id}/payslips`)}
          >
            <ScrollText className="mr-1.5 size-3.5" />
            View Payslips
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleEmailPayslips}
            disabled={emailingPayslips}
            title="Email each employee their payslip as a PDF"
          >
            <Mail className="mr-1.5 size-3.5" />
            {emailingPayslips ? "Sending..." : "Email Payslips"}
          </Button>
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this payroll back?</DialogTitle>
            <DialogDescription>
              It goes back to not finished so it can be fixed and sent for sign-off again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason</Label>
            <Textarea
              placeholder="What needs changing (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="destructive" size="sm" onClick={handleReject} disabled={rejecting}>
              {rejecting ? "Sending back..." : "Send back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this payroll run?</DialogTitle>
            <DialogDescription>
              A reversing accounting entry, on the same date as the original, cancels the wages, taxes, deductions and payment this run recorded. The run is kept, marked Cancelled. Pay any corrections with a new run.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason</Label>
            <Textarea
              placeholder="Why it's being voided (optional)"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="destructive" size="sm" onClick={handleVoidRun} disabled={removing}>
              {removing ? "Voiding..." : "Void run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </ContentReveal>
  );
}
