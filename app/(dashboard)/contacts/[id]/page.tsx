"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  UserPlus,
  X,
  Mail,
  Phone,
  Briefcase,
  Star,
  FileText,
  BookOpen,
  Users,
  Activity,
  Receipt,
  ScrollText,
  CreditCard,
  Banknote,
  Loader2,
  BarChart3,
  Download,
  Send,
  Target,
} from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { centsToDecimal, decimalToCents } from "@/lib/money";
import { CurrencyInput } from "@/components/ui/currency-input";
import { CurrencySelect } from "@/components/ui/currency-select";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { DatePicker } from "@/components/ui/date-picker";

interface ContactPerson {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  isPrimary: boolean;
  notes: string | null;
}

interface ContactDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  type: "customer" | "supplier" | "both";
  paymentTermsDays: number;
  creditLimit: number | null;
  isTaxExempt: boolean;
  currencyCode: string | null;
  defaultRevenueAccountId: string | null;
  defaultExpenseAccountId: string | null;
  defaultTaxRateId: string | null;
  defaultRevenueAccount: { id: string; code: string; name: string } | null;
  defaultExpenseAccount: { id: string; code: string; name: string } | null;
  defaultTaxRate: { id: string; name: string; rate: number } | null;
  people: ContactPerson[];
  notes: string | null;
  createdAt: string;
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface TaxRate {
  id: string;
  name: string;
  rate: number;
}

function getOrgId() {
  return localStorage.getItem("activeOrgId");
}

const TABS = [
  { value: "details", label: "Details", icon: FileText },
  { value: "activity", label: "Activity", icon: Activity },
  { value: "statement", label: "Statement", icon: BarChart3 },
  { value: "bookkeeping", label: "Bookkeeping", icon: BookOpen },
  { value: "people", label: "People", icon: Users },
] as const;

interface ActivityItem {
  id: string;
  type: "invoice" | "quote" | "credit_note" | "payment" | "bill";
  number: string;
  status: string;
  amount: number;
  currencyCode: string;
  date: string;
  createdAt: string;
}

const activityTypeConfig: Record<ActivityItem["type"], {
  label: string;
  icon: typeof FileText;
  color: string;
  bg: string;
  href: (id: string) => string;
}> = {
  invoice: {
    label: "Invoice",
    icon: FileText,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    href: (id) => `/sales/${id}`,
  },
  quote: {
    label: "Quote",
    icon: ScrollText,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    href: (id) => `/sales/quotes/${id}`,
  },
  credit_note: {
    label: "Credit Note",
    icon: CreditCard,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    href: (id) => `/sales/credit-notes/${id}`,
  },
  payment: {
    label: "Payment",
    icon: Banknote,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    href: (id) => `/payments/${id}`,
  },
  bill: {
    label: "Bill",
    icon: Receipt,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    href: (id) => `/purchases/${id}`,
  },
};

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { open: openDrawer } = useCreateDrawer();

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting] = useState(false);
  const [tab, setTab] = useState<string>("details");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);

  const [formType, setFormType] = useState<string>("customer");
  const [formRevenueAccountId, setFormRevenueAccountId] = useState<string>("none");
  const [formExpenseAccountId, setFormExpenseAccountId] = useState<string>("none");
  const [formTaxRateId, setFormTaxRateId] = useState<string>("none");
  const [formTaxExempt, setFormTaxExempt] = useState(false);
  const [formCreditLimit, setFormCreditLimit] = useState("");
  const [formCurrencyCode, setFormCurrencyCode] = useState("");

  useEntityTitle(contact?.name ?? undefined);

  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [activityHasMore, setActivityHasMore] = useState(true);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [activityStartDate, setActivityStartDate] = useState("");
  const [activityEndDate, setActivityEndDate] = useState("");
  const [activityTypeFilter, setActivityTypeFilter] = useState("all");
  const activitySentinelRef = useRef<HTMLDivElement>(null);
  const activityInitialized = useRef(false);

  const [statementData, setStatementData] = useState<{
    contact: { id: string; name: string; email: string | null; type: string };
    startDate: string;
    endDate: string;
    openingBalance: number;
    transactions: { date: string; type: string; documentNumber: string; description: string; debit: number; credit: number; balance: number }[];
    closingBalance: number;
  } | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementStartDate, setStatementStartDate] = useState("");
  const [statementEndDate, setStatementEndDate] = useState("");
  const [sendingStatement, setSendingStatement] = useState(false);

  const [showAddPerson, setShowAddPerson] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);
  const [newPerson, setNewPerson] = useState({
    name: "",
    email: "",
    phone: "",
    jobTitle: "",
    isPrimary: false,
  });

  const fetchContact = useCallback(async () => {
    const orgId = getOrgId();
    if (!orgId) return;

    try {
      const res = await fetch(`/api/v1/contacts/${id}`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.contact) {
        const c = data.contact as ContactDetail;
        setContact(c);
        setFormType(c.type);
        setFormRevenueAccountId(c.defaultRevenueAccountId || "none");
        setFormExpenseAccountId(c.defaultExpenseAccountId || "none");
        setFormTaxRateId(c.defaultTaxRateId || "none");
        setFormTaxExempt(c.isTaxExempt);
        setFormCreditLimit(c.creditLimit != null ? centsToDecimal(c.creditLimit) : "");
        setFormCurrencyCode(c.currencyCode || "");
      }
    } catch {
      toast.error("Failed to load contact");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const orgId = getOrgId();
    if (!orgId) return;

    fetchContact();

    fetch("/api/v1/accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.accounts) setAccounts(data.accounts);
      })
      .catch(() => {});

    fetch("/api/v1/tax-rates", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.taxRates) setTaxRates(data.taxRates);
      })
      .catch(() => {});
  }, [fetchContact]);

  const fetchActivity = useCallback(
    (cursor?: string | null) => {
      const orgId = getOrgId();
      if (!orgId) return;

      const isLoadMore = !!cursor;
      if (isLoadMore) setActivityLoadingMore(true);
      else setActivityLoading(true);

      const params = new URLSearchParams({ limit: "30" });
      if (cursor) params.set("cursor", cursor);
      if (activityStartDate) params.set("startDate", activityStartDate);
      if (activityEndDate) params.set("endDate", activityEndDate);
      if (activityTypeFilter !== "all") params.set("type", activityTypeFilter);

      fetch(`/api/v1/contacts/${id}/activity?${params}`, {
        headers: { "x-organization-id": orgId },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.activity) {
            setActivityItems((prev) => isLoadMore ? [...prev, ...data.activity] : data.activity);
          }
          setActivityHasMore(data.hasMore ?? false);
          setActivityCursor(data.nextCursor ?? null);
        })
        .catch(() => {})
        .finally(() => {
          setActivityLoading(false);
          setActivityLoadingMore(false);
        });
    },
    [id, activityStartDate, activityEndDate, activityTypeFilter]
  );

  // Fetch activity when tab is selected or filters change
  useEffect(() => {
    if (tab !== "activity") return;
    activityInitialized.current = true;
    setActivityCursor(null);
    setActivityHasMore(true);
    fetchActivity(null);
  }, [tab, fetchActivity]);

  // Infinite scroll for activity
  const loadMoreActivity = useCallback(() => {
    if (activityLoadingMore || !activityHasMore || !activityCursor) return;
    fetchActivity(activityCursor);
  }, [activityLoadingMore, activityHasMore, activityCursor, fetchActivity]);

  useEffect(() => {
    if (tab !== "activity") return;
    const el = activitySentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreActivity(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tab, loadMoreActivity]);

  const fetchStatement = useCallback(async () => {
    const orgId = getOrgId();
    if (!orgId) return;

    setStatementLoading(true);
    try {
      const params = new URLSearchParams();
      if (statementStartDate) params.set("startDate", statementStartDate);
      if (statementEndDate) params.set("endDate", statementEndDate);

      const res = await fetch(`/api/v1/contacts/${id}/statement?${params}`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.contact) {
        setStatementData(data);
      }
    } catch {
      toast.error("Failed to load statement");
    } finally {
      setStatementLoading(false);
    }
  }, [id, statementStartDate, statementEndDate]);

  useEffect(() => {
    if (tab !== "statement") return;
    fetchStatement();
  }, [tab, fetchStatement]);

  function applyStatementPreset(preset: string) {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (preset) {
      case "this_month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "last_month":
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case "this_quarter": {
        const q = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), q, 1);
        break;
      }
      case "last_quarter": {
        const q = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), q - 3, 1);
        end = new Date(now.getFullYear(), q, 0);
        break;
      }
      case "ytd":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case "last_12":
        start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default:
        return;
    }
    setStatementStartDate(start.toISOString().slice(0, 10));
    setStatementEndDate(end.toISOString().slice(0, 10));
  }

  function handleDownloadPdf() {
    const orgId = getOrgId();
    if (!orgId) return;
    const params = new URLSearchParams({ orgId });
    if (statementStartDate) params.set("startDate", statementStartDate);
    if (statementEndDate) params.set("endDate", statementEndDate);
    window.open(`/api/v1/contacts/${id}/statement/pdf?${params}`, "_blank");
  }

  async function handleEmailStatement() {
    const orgId = getOrgId();
    if (!orgId) return;

    setSendingStatement(true);
    try {
      const res = await fetch(`/api/v1/contacts/${id}/statement/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          startDate: statementStartDate || undefined,
          endDate: statementEndDate || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send");
      }
      toast.success("Statement emailed successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to email statement");
    } finally {
      setSendingStatement(false);
    }
  }

  const statementTypeLabels: Record<string, string> = {
    invoice: "Invoice",
    credit_note: "Credit Note",
    payment: "Payment",
    bill: "Bill",
    debit_note: "Debit Note",
  };

  const revenueAccounts = accounts.filter((a) => a.type === "revenue");
  const expenseAccounts = accounts.filter((a) => a.type === "expense");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const orgId = getOrgId();
    if (!orgId) return;

    const creditLimitValue = formCreditLimit;

    try {
      const res = await fetch(`/api/v1/contacts/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email") || null,
          phone: form.get("phone") || null,
          taxNumber: form.get("taxNumber") || null,
          type: formType,
          paymentTermsDays:
            parseInt(form.get("paymentTermsDays") as string) || 30,
          creditLimit: creditLimitValue
            ? decimalToCents(creditLimitValue)
            : null,
          isTaxExempt: formTaxExempt,
          currencyCode: formCurrencyCode || null,
          defaultRevenueAccountId: formRevenueAccountId !== "none" ? formRevenueAccountId : null,
          defaultExpenseAccountId: formExpenseAccountId !== "none" ? formExpenseAccountId : null,
          defaultTaxRateId: formTaxRateId !== "none" ? formTaxRateId : null,
          notes: form.get("notes") || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to update");
      const data = await res.json();
      const c = data.contact as ContactDetail;
      setContact(c);
      setFormType(c.type);
      setFormRevenueAccountId(c.defaultRevenueAccountId || "none");
      setFormExpenseAccountId(c.defaultExpenseAccountId || "none");
      setFormTaxRateId(c.defaultTaxRateId || "none");
      setFormTaxExempt(c.isTaxExempt);
      setFormCreditLimit(c.creditLimit != null ? centsToDecimal(c.creditLimit) : "");
      setFormCurrencyCode(c.currencyCode || "");
      toast.success("Contact updated");
    } catch {
      toast.error("Failed to update contact");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await confirm({
      title: "Delete this contact?",
      description: "This contact and all associated data will be permanently deleted.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        const orgId = getOrgId();
        if (!orgId) return;
        await fetch(`/api/v1/contacts/${id}`, {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        });
        toast.success("Contact deleted");
        router.push("/contacts");
      },
    });
  }

  async function handleAddPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!newPerson.name.trim()) return;
    const orgId = getOrgId();
    if (!orgId) return;

    setAddingPerson(true);
    try {
      const res = await fetch(`/api/v1/contacts/${id}/people`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name: newPerson.name,
          email: newPerson.email || null,
          phone: newPerson.phone || null,
          jobTitle: newPerson.jobTitle || null,
          isPrimary: newPerson.isPrimary,
        }),
      });

      if (!res.ok) throw new Error("Failed to add person");
      toast.success("Person added");
      setNewPerson({ name: "", email: "", phone: "", jobTitle: "", isPrimary: false });
      setShowAddPerson(false);
      fetchContact();
    } catch {
      toast.error("Failed to add person");
    } finally {
      setAddingPerson(false);
    }
  }

  if (loading) return <BrandLoader />;

  if (!contact) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This contact does not exist or has been deleted.
        </p>
        <Button variant="outline" size="sm" onClick={() => router.push("/contacts")}>
          Back to Contacts
        </Button>
      </div>
    );
  }

  const peopleCount = contact.people?.length ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push("/contacts")}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Back to contacts
        </button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => openDrawer("deal", { contactId: contact.id, contactName: contact.name })}
        >
          <Target className="size-3" />
          Create Lead
        </Button>
      </div>

      {/* Tab nav - same style as settings */}
      <nav className="-mt-2 mb-8 flex items-center gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-[13px] font-medium transition-colors",
              tab === t.value
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {t.label}
            {t.value === "people" && peopleCount > 0 && (
              <span className="ml-1 text-[11px] tabular-nums text-muted-foreground">
                {peopleCount}
              </span>
            )}
          </button>
          );
        })}
      </nav>

      <ContentReveal key={tab}>
        {/* Details tab */}
        {tab === "details" && (
          <form onSubmit={handleSubmit} className="space-y-10">
            <Section title="General" description="Basic contact information and identification.">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input name="name" required defaultValue={contact.name} placeholder="Contact name" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email</Label>
                    <Input name="email" type="email" defaultValue={contact.email || ""} placeholder="email@example.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Phone</Label>
                    <Input name="phone" defaultValue={contact.phone || ""} placeholder="+1 (555) 000-0000" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select value={formType} onValueChange={setFormType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer">Customer</SelectItem>
                        <SelectItem value="supplier">Supplier</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tax number / VAT</Label>
                    <Input name="taxNumber" defaultValue={contact.taxNumber || ""} placeholder="e.g. US12-3456789" />
                  </div>
                </div>
              </div>
            </Section>

            <div className="h-px bg-border" />

            <Section title="Payment" description="Payment terms, currency, and credit settings.">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Payment terms (days)</Label>
                    <Input
                      name="paymentTermsDays"
                      type="number"
                      min={0}
                      defaultValue={contact.paymentTermsDays}
                      placeholder="e.g. 30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Currency code</Label>
                    <CurrencySelect
                      value={formCurrencyCode}
                      onValueChange={setFormCurrencyCode}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Credit limit</Label>
                    <CurrencyInput
                      prefix="$"
                      value={formCreditLimit}
                      onChange={setFormCreditLimit}
                      placeholder="No limit"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tax status</Label>
                    <div className="flex h-9 items-center space-x-2">
                      <Checkbox
                        id="isTaxExempt"
                        checked={formTaxExempt}
                        onCheckedChange={(checked) =>
                          setFormTaxExempt(checked === true)
                        }
                      />
                      <Label
                        htmlFor="isTaxExempt"
                        className="cursor-pointer text-sm font-normal"
                      >
                        Tax exempt
                      </Label>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            <div className="h-px bg-border" />

            <Section title="Notes" description="Internal notes about this contact.">
              <Textarea
                name="notes"
                defaultValue={contact.notes || ""}
                rows={3}
                placeholder="Internal notes..."
              />
            </Section>

            <div className="h-px bg-border" />

            <div className="flex justify-end">
              <Button
                type="submit"
                loading={saving}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Save changes
              </Button>
            </div>

            <div className="h-px bg-border" />

            {/* Danger zone */}
            <Section title="Danger zone" description="Irreversible actions for this contact.">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
                <div>
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete contact</p>
                  <p className="text-[12px] text-muted-foreground">
                    Permanently delete this contact and all associated data.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  loading={deleting}
                  onClick={handleDelete}
                >
                  Delete
                </Button>
              </div>
            </Section>
          </form>
        )}

        {/* Activity tab */}
        {tab === "activity" && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
                <SelectTrigger className="w-40 h-8 text-sm">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="invoice">Invoices</SelectItem>
                  <SelectItem value="quote">Quotes</SelectItem>
                  <SelectItem value="credit_note">Credit Notes</SelectItem>
                  <SelectItem value="payment">Payments</SelectItem>
                  <SelectItem value="bill">Bills</SelectItem>
                </SelectContent>
              </Select>
              <DatePicker
                value={activityStartDate}
                onChange={setActivityStartDate}
                placeholder="From date"
                className="w-36 h-8 text-sm"
              />
              <DatePicker
                value={activityEndDate}
                onChange={setActivityEndDate}
                placeholder="To date"
                className="w-36 h-8 text-sm"
              />
              {(activityStartDate || activityEndDate || activityTypeFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={() => {
                    setActivityStartDate("");
                    setActivityEndDate("");
                    setActivityTypeFilter("all");
                  }}
                >
                  <X className="mr-1 size-3" />
                  Clear
                </Button>
              )}
            </div>

            {activityLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="brand-loader" aria-label="Loading">
                  <div className="brand-loader-circle brand-loader-circle-1" />
                  <div className="brand-loader-circle brand-loader-circle-2" />
                </div>
              </div>
            ) : activityItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-dashed">
                <Activity className="mb-2 size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No activity found</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {activityStartDate || activityEndDate || activityTypeFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Invoices, quotes, payments, and bills will appear here"}
                </p>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

                <div className="space-y-1">
                  {activityItems.map((item) => {
                    const config = activityTypeConfig[item.type];
                    const Icon = config.icon;
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        onClick={() => router.push(config.href(item.id))}
                        className="relative flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className={cn("relative z-10 flex size-[38px] shrink-0 items-center justify-center rounded-full border bg-card", config.bg)}>
                          <Icon className={cn("size-4", config.color)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{item.number}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {config.label}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                              {item.status.replace("_", " ")}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(item.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <span className="text-sm font-medium tabular-nums">
                          {item.type === "credit_note" ? "-" : ""}
                          {formatMoney(item.amount, item.currencyCode)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Infinite scroll sentinel */}
            {activityHasMore && !activityLoading && (
              <div ref={activitySentinelRef} className="flex items-center justify-center py-4">
                {activityLoadingMore && (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                )}
              </div>
            )}
          </div>
        )}

        {/* Statement tab */}
        {tab === "statement" && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <Select onValueChange={applyStatementPreset}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="this_quarter">This Quarter</SelectItem>
                  <SelectItem value="last_quarter">Last Quarter</SelectItem>
                  <SelectItem value="ytd">Year to Date</SelectItem>
                  <SelectItem value="last_12">Last 12 Months</SelectItem>
                </SelectContent>
              </Select>
              <DatePicker
                value={statementStartDate}
                onChange={setStatementStartDate}
                placeholder="From date"
                className="w-36 h-8 text-sm"
              />
              <DatePicker
                value={statementEndDate}
                onChange={setStatementEndDate}
                placeholder="To date"
                className="w-36 h-8 text-sm"
              />
              {(statementStartDate || statementEndDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={() => {
                    setStatementStartDate("");
                    setStatementEndDate("");
                  }}
                >
                  <X className="mr-1 size-3" />
                  Clear
                </Button>
              )}

              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={handleDownloadPdf}
                  disabled={statementLoading}
                >
                  <Download className="mr-1.5 size-3.5" />
                  PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={handleEmailStatement}
                  disabled={statementLoading || sendingStatement || !contact.email}
                  title={!contact.email ? "Contact has no email address" : undefined}
                >
                  {sendingStatement ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 size-3.5" />
                  )}
                  Email
                </Button>
              </div>
            </div>

            {statementLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="brand-loader" aria-label="Loading">
                  <div className="brand-loader-circle brand-loader-circle-1" />
                  <div className="brand-loader-circle brand-loader-circle-2" />
                </div>
              </div>
            ) : statementData ? (
              <div className="space-y-6">
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Opening Balance</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums font-mono">
                      {formatMoney(statementData.openingBalance)}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Debited</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums font-mono">
                      {formatMoney(statementData.transactions.reduce((s, t) => s + t.debit, 0))}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Credited</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums font-mono">
                      {formatMoney(statementData.transactions.reduce((s, t) => s + t.credit, 0))}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Closing Balance</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums font-mono">
                      {formatMoney(statementData.closingBalance)}
                    </p>
                  </div>
                </div>

                {/* Transaction table */}
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Reference</th>
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="px-3 py-2 text-right font-medium">Debit</th>
                        <th className="px-3 py-2 text-right font-medium">Credit</th>
                        <th className="px-3 py-2 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Opening balance row */}
                      <tr className="border-b bg-muted/30">
                        <td colSpan={6} className="px-3 py-2 text-sm font-medium">
                          Opening Balance
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-sm font-medium tabular-nums">
                          {formatMoney(statementData.openingBalance)}
                        </td>
                      </tr>

                      {statementData.transactions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                            No transactions in this period
                          </td>
                        </tr>
                      ) : (
                        statementData.transactions.map((tx, i) => (
                          <tr key={i} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2 whitespace-nowrap">
                              {new Date(tx.date + "T00:00:00").toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {statementTypeLabels[tx.type] || tx.type}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{tx.documentNumber}</td>
                            <td className="px-3 py-2 text-muted-foreground">{tx.description}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {tx.debit ? formatMoney(tx.debit) : "-"}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {tx.credit ? formatMoney(tx.credit) : "-"}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {formatMoney(tx.balance)}
                            </td>
                          </tr>
                        ))
                      )}

                      {/* Closing balance row */}
                      <tr className="bg-muted/30">
                        <td colSpan={6} className="px-3 py-2 text-sm font-medium">
                          Closing Balance
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-sm font-medium tabular-nums">
                          {formatMoney(statementData.closingBalance)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-dashed">
                <BarChart3 className="mb-2 size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No statement data</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Select a date range to generate a statement
                </p>
              </div>
            )}
          </div>
        )}

        {/* Bookkeeping tab */}
        {tab === "bookkeeping" && (
          <form onSubmit={handleSubmit} className="space-y-10">
            <Section title="Default accounts" description="Default chart of accounts for this contact's transactions.">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Revenue account</Label>
                  <Select
                    value={formRevenueAccountId}
                    onValueChange={setFormRevenueAccountId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {revenueAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Expense account</Label>
                  <Select
                    value={formExpenseAccountId}
                    onValueChange={setFormExpenseAccountId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {expenseAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Section>

            <div className="h-px bg-border" />

            <Section title="Default tax rate" description="Automatically applied when creating invoices or bills for this contact.">
              <div className="max-w-xs">
                <Select
                  value={formTaxRateId}
                  onValueChange={setFormTaxRateId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tax rate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {taxRates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({(t.rate / 100).toFixed(1)}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Section>

            <div className="h-px bg-border" />

            <div className="flex justify-end">
              <Button
                type="submit"
                loading={saving}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Save changes
              </Button>
            </div>
          </form>
        )}

        {/* People tab */}
        {tab === "people" && (
          <div className="space-y-10">
            <Section title="Contact people" description="People associated with this contact organization.">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  {(contact.people?.length ?? 0) > 0 ? (
                    <p className="text-[12px] text-muted-foreground">
                      {(contact.people?.length ?? 0)} {(contact.people?.length ?? 0) === 1 ? "person" : "people"}
                    </p>
                  ) : (
                    <div />
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddPerson(!showAddPerson)}
                  >
                    {showAddPerson ? (
                      <>
                        <X className="mr-2 size-3.5" />
                        Cancel
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 size-3.5" />
                        Add person
                      </>
                    )}
                  </Button>
                </div>

                {showAddPerson && (
                  <form
                    onSubmit={handleAddPerson}
                    className="space-y-4 rounded-lg border border-dashed p-4"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Name *</Label>
                        <Input
                          placeholder="Full name"
                          value={newPerson.name}
                          onChange={(e) =>
                            setNewPerson({ ...newPerson, name: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Email</Label>
                        <Input
                          type="email"
                          placeholder="Email address"
                          value={newPerson.email}
                          onChange={(e) =>
                            setNewPerson({ ...newPerson, email: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Phone</Label>
                        <Input
                          placeholder="Phone number"
                          value={newPerson.phone}
                          onChange={(e) =>
                            setNewPerson({ ...newPerson, phone: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Job title</Label>
                        <Input
                          placeholder="Job title"
                          value={newPerson.jobTitle}
                          onChange={(e) =>
                            setNewPerson({ ...newPerson, jobTitle: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="personPrimary"
                          checked={newPerson.isPrimary}
                          onCheckedChange={(checked) =>
                            setNewPerson({ ...newPerson, isPrimary: checked === true })
                          }
                        />
                        <Label
                          htmlFor="personPrimary"
                          className="cursor-pointer text-sm font-normal"
                        >
                          Primary contact
                        </Label>
                      </div>
                      <Button
                        type="submit"
                        size="sm"
                        loading={addingPerson}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <UserPlus className="mr-2 size-3.5" />
                        Add
                      </Button>
                    </div>
                  </form>
                )}

                {(contact.people?.length ?? 0) === 0 && !showAddPerson ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center rounded-lg border border-dashed">
                    <UserPlus className="mb-2 size-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      No contact people yet
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Add people associated with this contact
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(contact.people ?? []).map((person) => (
                      <div
                        key={person.id}
                        className="flex items-start gap-3 rounded-lg border p-3"
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {person.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {person.name}
                            </span>
                            {person.isPrimary && (
                              <Badge
                                variant="outline"
                                className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px]"
                              >
                                <Star className="mr-1 size-3" />
                                Primary
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {person.jobTitle && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="size-3" />
                                {person.jobTitle}
                              </span>
                            )}
                            {person.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="size-3" />
                                {person.email}
                              </span>
                            )}
                            {person.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="size-3" />
                                {person.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          </div>
        )}
      </ContentReveal>
      {confirmDialog}
    </div>
  );
}
