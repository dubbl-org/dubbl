"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, Plus, Play, Trash2 } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { CurrencySelect } from "@/components/ui/currency-select";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { cn } from "@/lib/utils";

interface ContractorDetail {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  taxId: string | null;
  hourlyRate: number | null;
  currency: string;
  bankAccountNumber: string | null;
  isActive: boolean;
  payments: Payment[];
}

interface Payment {
  id: string;
  amount: number;
  description: string | null;
  invoiceNumber: string | null;
  status: string;
  paidAt: string | null;
}

const statusColors: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

export default function ContractorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contractor, setContractor] = useState<ContractorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Edit form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [bankAccount, setBankAccount] = useState("");

  // New payment
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDesc, setPaymentDesc] = useState("");
  const [paymentInvoice, setPaymentInvoice] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState("");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  function fetchContractor() {
    if (!orgId) return;
    fetch(`/api/v1/payroll/contractors/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.contractor) {
          const c = data.contractor;
          setContractor(c);
          setName(c.name);
          setEmail(c.email || "");
          setCompany(c.company || "");
          setHourlyRate(c.hourlyRate ? (c.hourlyRate / 100).toFixed(2) : "");
          setBankAccount(c.bankAccountNumber || "");
          setPaymentCurrency(c.currency || "USD");
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchContractor(); }, [id, orgId]);

  async function handleSave() {
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/payroll/contractors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name,
          email: email || null,
          company: company || null,
          hourlyRate: hourlyRate ? Math.round(parseFloat(hourlyRate) * 100) : null,
          bankAccountNumber: bankAccount || null,
        }),
      });
      if (res.ok) toast.success("Contractor updated");
      else toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPayment() {
    if (!orgId || !paymentAmount) return;
    const res = await fetch(`/api/v1/payroll/contractors/${id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify({
        amount: Math.round(parseFloat(paymentAmount) * 100),
        currency: paymentCurrency || contractor?.currency || "USD",
        description: paymentDesc || undefined,
        invoiceNumber: paymentInvoice || undefined,
      }),
    });
    if (res.ok) {
      toast.success("Payment added");
      setPaymentAmount(""); setPaymentDesc(""); setPaymentInvoice("");
      fetchContractor();
    }
  }

  async function handleProcessPayment(paymentId: string) {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Process this payment?",
      description: "This will create a journal entry and mark the payment as paid.",
      confirmLabel: "Process",
    });
    if (!confirmed) return;

    const res = await fetch(`/api/v1/payroll/contractors/${id}/payments/${paymentId}/process`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      toast.success("Payment processed");
      fetchContractor();
    } else {
      toast.error("Failed to process payment");
    }
  }

  async function handleDelete() {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Delete this contractor?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/api/v1/payroll/contractors/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      toast.success("Contractor deleted");
      router.push("/payroll/contractors");
    }
  }

  if (loading) return <BrandLoader />;
  if (!contractor) {
    return (
      <ContentReveal>
        <button onClick={() => router.push("/payroll/contractors")} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="size-3.5" /> Back to contractors
        </button>
        <p className="text-sm text-muted-foreground">Contractor not found</p>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      <button onClick={() => router.push("/payroll/contractors")} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to contractors
      </button>

      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <Briefcase className="size-5 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{contractor.name}</h1>
            {contractor.currency && contractor.currency !== "USD" && (
              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{contractor.currency}</code>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{contractor.company || contractor.email || "-"}</p>
        </div>
      </div>

      <div className="max-w-4xl space-y-6">
        <Section title="Details" description="Contractor information.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hourly Rate ({contractor.currency || "USD"})</Label>
              <Input type="number" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bank Account</Label>
              <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-1.5 size-3.5" /> Delete
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </Section>

        <div className="h-px bg-border" />

        <Section title="Payments" description="Payment history and new payments.">
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Amount</Label>
                  <Input type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Currency</Label>
                  <CurrencySelect value={paymentCurrency} onValueChange={setPaymentCurrency} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input value={paymentDesc} onChange={(e) => setPaymentDesc(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Invoice #</Label>
                  <Input value={paymentInvoice} onChange={(e) => setPaymentInvoice(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <Button size="sm" onClick={handleAddPayment} disabled={!paymentAmount}>
                <Plus className="mr-1.5 size-3" /> Add Payment
              </Button>
            </div>

            {(contractor.payments || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No payments yet</p>
            ) : (
              <div className="rounded-xl border bg-card divide-y">
                {(contractor.payments || []).map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium font-mono tabular-nums">{formatMoney(p.amount, contractor.currency || "USD")}</p>
                      <p className="text-xs text-muted-foreground">{p.description || p.invoiceNumber || "-"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("text-[10px]", statusColors[p.status] || "")}>
                        {p.status}
                      </Badge>
                      {p.status === "pending" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleProcessPayment(p.id)}>
                          <Play className="mr-1 size-3" /> Process
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      </div>

      {confirmDialog}
    </ContentReveal>
  );
}
