"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  CircleDot,
  Plus,
  Sparkles,
  Upload,
  Waves,
} from "lucide-react";
import { toast } from "sonner";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { Section } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/money";

type BankAccountType =
  | "checking"
  | "savings"
  | "credit_card"
  | "cash"
  | "loan"
  | "investment"
  | "other";

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string | null;
  bankName: string | null;
  currencyCode: string;
  countryCode: string | null;
  accountType: BankAccountType;
  color: string;
  balance: number;
  isActive: boolean;
}

const ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit Card",
  cash: "Cash",
  loan: "Loan",
  investment: "Investment",
  other: "Other",
};

const ACCOUNT_COLORS = [
  "#0f766e",
  "#1d4ed8",
  "#b45309",
  "#9f1239",
  "#4338ca",
  "#166534",
];

export default function BankingPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    accountName: "",
    accountNumber: "",
    bankName: "",
    currencyCode: "USD",
    countryCode: "",
    accountType: "checking" as BankAccountType,
    color: ACCOUNT_COLORS[0],
  });

  function fetchAccounts() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/bank-accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((res) => res.json())
      .then((data) => setAccounts(data.bankAccounts || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchAccounts();
  }, []);

  const totals = useMemo(() => {
    const active = accounts.filter((account) => account.isActive).length;
    const balances = accounts.reduce((sum, account) => sum + account.balance, 0);
    return { active, balances };
  }, [accounts]);

  async function createAccount() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setSaving(true);

    try {
      const res = await fetch("/api/v1/bank-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          accountName: form.accountName,
          accountNumber: form.accountNumber || null,
          bankName: form.bankName || null,
          currencyCode: form.currencyCode,
          countryCode: form.countryCode || null,
          accountType: form.accountType,
          color: form.color,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Bank account created");
      setDialogOpen(false);
      setForm({
        accountName: "",
        accountNumber: "",
        bankName: "",
        currencyCode: "USD",
        countryCode: "",
        accountType: "checking",
        color: ACCOUNT_COLORS[(accounts.length + 1) % ACCOUNT_COLORS.length],
      });
      fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create bank account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BlurReveal className="space-y-8">
      <section className="overflow-hidden rounded-[28px] border bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.22),_transparent_38%),linear-gradient(135deg,_rgba(255,255,255,0.96),_rgba(244,247,245,0.96))] p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
              No bank connected
            </Badge>
            <div className="space-y-2">
              <h1 className="font-serif text-3xl tracking-tight text-foreground">
                Global statement imports are live. Salt Edge sync is coming soon.
              </h1>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                Add bank accounts, assign a distinct color to each one, and import structured
                statement files from banks across regions. Live bank feeds are intentionally
                disabled for now, so every workflow is scoped cleanly through manual imports.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              icon={Building2}
              label="Accounts"
              value={loading ? "..." : String(accounts.length)}
              sub={`${totals.active} active`}
            />
            <MetricCard
              icon={Upload}
              label="Import Mode"
              value="Statements"
              sub="CSV, QFX, OFX, CAMT, MT, BAI2"
            />
            <MetricCard
              icon={Waves}
              label="Live Sync"
              value="Coming Soon"
              sub="Salt Edge roadmap"
            />
          </div>
        </div>
      </section>

      <Section
        title="Account Deck"
        description="Each account owns its transactions, imports, balances, and reconciliation state."
      >
        {accounts.length === 0 && !loading ? (
          <div className="rounded-[24px] border border-dashed bg-card/70 p-10 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
              <Sparkles className="size-6 text-muted-foreground" />
            </div>
            <h2 className="mt-4 font-serif text-2xl">Build your import workspace</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Start with a bank account. Every imported statement is attached to a specific
              account so you can keep currencies, balances, and reconciliations isolated.
            </p>
            <Button
              onClick={() => setDialogOpen(true)}
              className="mt-6 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              Add Bank Account
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => router.push(`/accounting/banking/${account.id}`)}
                className="group rounded-[24px] border bg-card p-5 text-left transition-transform duration-200 hover:-translate-y-0.5 hover:border-foreground/20"
              >
                <div
                  className="mb-5 h-1.5 rounded-full"
                  style={{ backgroundColor: account.color }}
                />
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CircleDot className="size-3.5" style={{ color: account.color }} />
                      <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[account.accountType]}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{account.accountName}</h3>
                      <p className="text-sm text-muted-foreground">
                        {[account.bankName, account.countryCode].filter(Boolean).join(" • ") || "Manual statement imports"}
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>

                <div className="mt-8 flex items-end justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Balance
                    </p>
                    <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                      {formatMoney(account.balance, account.currencyCode)}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant="outline"
                      className="border-slate-200 bg-slate-50 text-slate-700"
                    >
                      Salt Edge coming soon
                    </Badge>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      {account.accountNumber ? `••••${account.accountNumber.slice(-4)}` : "No mask"}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Workspace Summary"
        description="Manual-import support is available now across global structured formats."
      >
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[24px] border bg-card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Portfolio Balance
                </p>
                <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">
                  {formatMoney(totals.balances)}
                </p>
              </div>
              <Button onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="mr-2 size-4" />
                New Account
              </Button>
            </div>
          </div>
          <div className="rounded-[24px] border bg-card p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Supported Formats
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              CSV, TSV, QIF, OFX/QFX/QBO, CAMT.052/.053/.054, MT940/MT942, and BAI2.
            </p>
          </div>
        </div>
      </Section>

      <CreateAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        onSubmit={createAccount}
        loading={saving}
      />
    </BlurReveal>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-[22px] border bg-background/90 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className="mt-3 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function CreateAccountDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    currencyCode: string;
    countryCode: string;
    accountType: BankAccountType;
    color: string;
  };
  setForm: (value: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    currencyCode: string;
    countryCode: string;
    accountType: BankAccountType;
    color: string;
  }) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Bank Account</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Account Name</Label>
            <Input
              value={form.accountName}
              onChange={(e) => setForm({ ...form, accountName: e.target.value })}
              placeholder="Global Operating Account"
            />
          </div>
          <div className="space-y-2">
            <Label>Bank Name</Label>
            <Input
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
              placeholder="Revolut Business"
            />
          </div>
          <div className="space-y-2">
            <Label>Account Number / Mask</Label>
            <Input
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
              placeholder="1234 or GB29NWBK..."
            />
          </div>
          <div className="space-y-2">
            <Label>Account Type</Label>
            <Select
              value={form.accountType}
              onValueChange={(value) =>
                setForm({ ...form, accountType: value as BankAccountType })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 grid-cols-[1fr_1fr]">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input
                value={form.currencyCode}
                onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })}
                placeholder="USD"
                maxLength={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Input
                value={form.countryCode}
                onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
                placeholder="US"
                maxLength={2}
              />
            </div>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Accent Color</Label>
            <div className="flex flex-wrap gap-3">
              {ACCOUNT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setForm({ ...form, color })}
                  className={`size-9 rounded-full border-2 ${
                    form.color === color ? "border-foreground" : "border-transparent"
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Choose ${color}`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!form.accountName.trim() || loading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? "Creating..." : "Add Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
