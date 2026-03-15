"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Play, Search, X, FileText, CheckCircle2, XCircle, Gift, ScrollText, Send, Plus } from "lucide-react";
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
  processedAt: string | null;
  items: PayrollItemRow[];
}

interface PayrollItemRow {
  id: string;
  grossAmount: number;
  taxAmount: number;
  deductions: number;
  netAmount: number;
  type: string | null;
  description: string | null;
  currency: string | null;
  fxRate: number | null;
  employee: { name: string; employeeNumber: string } | null;
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
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
  pending_approval: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

const bonusTypes = [
  { value: "performance", label: "Performance" },
  { value: "signing", label: "Signing" },
  { value: "holiday", label: "Holiday" },
  { value: "referral", label: "Referral" },
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
  const [run, setRun] = useState<PayrollRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [generatingPayslips, setGeneratingPayslips] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  useDocumentTitle("Payroll · Run Details");

  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [bonusDialogOpen, setBonusDialogOpen] = useState(false);
  const [bonusForm, setBonusForm] = useState({
    employeeId: "",
    bonusType: "",
    amount: "",
    description: "",
  });
  const [creatingBonus, setCreatingBonus] = useState(false);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/payroll/runs/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.run) setRun(data.run);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/payroll/runs/${id}/bonuses`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.bonuses) setBonuses(data.bonuses);
      })
      .catch(() => {});
  }, [id]);

  async function handleProcess() {
    const confirmed = await confirm({
      title: "Process this payroll run?",
      description: "This will create journal entries and cannot be undone.",
      confirmLabel: "Process",
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
      toast.success("Payroll run processed");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process payroll");
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
      toast.success("Submitted for approval");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit for approval");
    } finally {
      setSubmittingApproval(false);
    }
  }

  async function handleApprove() {
    const confirmed = await confirm({
      title: "Approve this payroll run?",
      description: "This will mark the run as approved and ready for processing.",
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
      toast.success("Payroll run approved");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    const confirmed = await confirm({
      title: "Reject this payroll run?",
      description: "This will send the run back to draft status.",
      confirmLabel: "Reject",
      destructive: true,
    });
    if (!confirmed) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setRejecting(true);

    try {
      const res = await fetch(`/api/v1/payroll/runs/${id}/reject`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Payroll run rejected");
      window.location.reload();
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
          amount: parseFloat(bonusForm.amount),
          description: bonusForm.description || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      const data = await res.json();
      if (data.bonus) {
        setBonuses((prev) => [...prev, data.bonus]);
      }
      toast.success("Bonus added");
      setBonusDialogOpen(false);
      setBonusForm({ employeeId: "", bonusType: "", amount: "", description: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add bonus");
    } finally {
      setCreatingBonus(false);
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
              ? "bg-emerald-50 dark:bg-emerald-950/40"
              : "bg-muted"
          )}>
            <FileText className={cn(
              "size-5",
              run.status === "completed"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground"
            )} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold">
                {run.payPeriodStart} to {run.payPeriodEnd}
              </h1>
              <Badge variant="outline" className={statusColors[run.status] || ""}>
                {run.status.replace(/_/g, " ")}
              </Badge>
              {run.runType && run.runType !== "regular" && (
                <Badge variant="outline" className="capitalize">
                  {run.runType.replace(/_/g, " ")}
                </Badge>
              )}
              {run.approvalStatus && (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                >
                  {run.approvalStatus.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {run.processedAt ? `Processed ${run.processedAt}` : "Draft payroll run"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {run.status === "draft" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSubmitForApproval}
                disabled={submittingApproval}
              >
                <Send className="mr-1.5 size-3.5" />
                {submittingApproval ? "Submitting..." : "Submit for Approval"}
              </Button>
              <Button
                size="sm"
                onClick={handleProcess}
                disabled={processing}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Play className="mr-1.5 size-3.5" />
                {processing ? "Processing..." : "Process Payroll"}
              </Button>
            </>
          )}
          {run.status === "pending_approval" && (
            <>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={approving}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="mr-1.5 size-3.5" />
                {approving ? "Approving..." : "Approve"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleReject}
                disabled={rejecting}
              >
                <XCircle className="mr-1.5 size-3.5" />
                {rejecting ? "Rejecting..." : "Reject"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Gross</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate">{formatMoney(run.totalGross)}</p>
        </motion.div>
        <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Deductions</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate text-red-600 dark:text-red-400">{formatMoney(run.totalDeductions)}</p>
        </motion.div>
        <motion.div {...anim(0.09)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Net Pay</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate text-emerald-600 dark:text-emerald-400">{formatMoney(run.totalNet)}</p>
        </motion.div>
      </div>

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
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
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
                    <p className="text-xs text-muted-foreground">Gross</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(item.grossAmount, item.currency ?? "USD")}</p>
                  </div>
                  <div className="hidden sm:block text-right">
                    <p className="text-xs text-muted-foreground">Tax</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(item.taxAmount, item.currency ?? "USD")}</p>
                  </div>
                  <div className="hidden sm:block text-right">
                    <p className="text-xs text-muted-foreground">Deductions</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(item.deductions, item.currency ?? "USD")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Net</p>
                    <p className="text-sm font-mono tabular-nums font-medium">{formatMoney(item.netAmount, item.currency ?? "USD")}</p>
                  </div>
                </div>
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
                  Add a bonus for an employee in this payroll run.
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
                          <SelectItem key={item.id} value={item.id}>
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
        </div>

        {bonuses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border bg-card">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <Gift className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No bonuses added</p>
            <p className="text-xs text-muted-foreground mt-1">Add bonuses for employees in this payroll run</p>
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
                <p className="text-sm font-mono tabular-nums font-medium shrink-0">
                  {formatMoney(bonus.amount)}
                </p>
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
        </div>
      )}

      {confirmDialog}
    </ContentReveal>
  );
}
