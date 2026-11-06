"use client";

import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  BookOpen,
  Users,
  Activity,
  BarChart3,
  Paperclip,
  Target,
  ScrollText,
  CreditCard,
  Banknote,
  Receipt,
  Merge,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { centsToDecimal } from "@/lib/money";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useApi, useApiCache } from "@/lib/query/use-api";
import { ApiError } from "@/lib/query/api";

// ---------------------------------------------------------------------------
// Shared interfaces
// ---------------------------------------------------------------------------

export interface ContactPerson {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export interface ContactDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  type: "customer" | "supplier" | "both";
  paymentTermsDays: number;
  creditLimit: number | null;
  isTaxExempt: boolean;
  is1099Vendor: boolean;
  w9TaxClassification?: string | null;
  taxIdentifier?: string | null;
  backupWithholding?: boolean;
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

export interface ContactFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  visibility: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
}

export interface ActivityItem {
  id: string;
  type: "invoice" | "quote" | "credit_note" | "payment" | "bill";
  number: string;
  status: string;
  amount: number;
  currencyCode: string;
  date: string;
  createdAt: string;
}

export const activityTypeConfig: Record<ActivityItem["type"], {
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
    color: "text-brand-600 dark:text-brand-400",
    bg: "bg-brand-50 dark:bg-brand-950/40",
    href: (id) => `/sales/payments/${id}`,
  },
  bill: {
    label: "Bill",
    icon: Receipt,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    href: (id) => `/purchases/${id}`,
  },
};

export function getOrgId() {
  return localStorage.getItem("activeOrgId");
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = [
  { value: "details", label: "Details", icon: FileText },
  { value: "activity", label: "Activity", icon: Activity },
  { value: "statement", label: "Statement", icon: BarChart3 },
  { value: "bookkeeping", label: "Bookkeeping", icon: BookOpen },
  { value: "people", label: "People", icon: Users },
  { value: "files", label: "Files", icon: Paperclip },
] as const;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface ContactContextValue {
  contact: ContactDetail;
  /** Show a saved contact (e.g. a PATCH answer) right away and drop the unsaved form edits. */
  setContact: (contact: ContactDetail) => void;
  fetchContact: () => Promise<void>;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  confirmDialog: ReturnType<typeof useConfirm>["dialog"];
  // Form state shared between details and bookkeeping
  formType: string;
  setFormType: (v: string) => void;
  formRevenueAccountId: string;
  setFormRevenueAccountId: (v: string) => void;
  formExpenseAccountId: string;
  setFormExpenseAccountId: (v: string) => void;
  formTaxRateId: string;
  setFormTaxRateId: (v: string) => void;
  formTaxExempt: boolean;
  setFormTaxExempt: (v: boolean) => void;
  form1099Vendor: boolean;
  setForm1099Vendor: (v: boolean) => void;
  formCreditLimit: string;
  setFormCreditLimit: (v: string) => void;
  formCurrencyCode: string;
  setFormCurrencyCode: (v: string) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
}

const ContactContext = createContext<ContactContextValue | null>(null);

/** The form fields shared between details and bookkeeping, as edited. */
interface ContactForm {
  type: string;
  revenueAccountId: string;
  expenseAccountId: string;
  taxRateId: string;
  taxExempt: boolean;
  is1099Vendor: boolean;
  creditLimit: string;
  currencyCode: string;
}

function toForm(c: ContactDetail | null): ContactForm {
  return {
    type: c?.type ?? "customer",
    revenueAccountId: c?.defaultRevenueAccountId || "none",
    expenseAccountId: c?.defaultExpenseAccountId || "none",
    taxRateId: c?.defaultTaxRateId || "none",
    taxExempt: c?.isTaxExempt ?? false,
    is1099Vendor: c?.is1099Vendor ?? false,
    creditLimit: c?.creditLimit != null ? centsToDecimal(c.creditLimit) : "",
    currencyCode: c?.currencyCode || "",
  };
}

export function useContactContext() {
  const ctx = useContext(ContactContext);
  if (!ctx) throw new Error("useContactContext must be used within ContactDetailLayout");
  return ctx;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function ContactDetailLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { open: openDrawer } = useCreateDrawer();

  const cache = useApiCache();
  const contactUrl = `/api/v1/contacts/${id}`;
  const { data, error, loading, refetch } = useApi<{ contact?: ContactDetail }>(contactUrl);
  const contact = data?.contact ?? null;

  // Shared form state: unsaved edits (for this contact) on top of the loaded contact
  const [draft, setDraft] = useState<{ id: string; form: ContactForm } | null>(null);
  const form = draft?.id === id ? draft.form : toForm(contact);
  const setField = <K extends keyof ContactForm>(key: K) => (v: ContactForm[K]) =>
    setDraft((d) => ({ id, form: { ...(d?.id === id ? d.form : form), [key]: v } }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (error && !data && !(error instanceof ApiError)) toast.error("Failed to load contact");
  }, [error, data]);

  function setContact(c: ContactDetail) {
    // A PATCH answer may leave out the joined fields (people, accounts), so keep those.
    cache.update<{ contact?: ContactDetail }>(contactUrl, (d) => ({ ...d, contact: { ...d.contact, ...c } }));
    setDraft(null);
  }

  async function fetchContact() {
    await refetch();
  }

  // "Merge duplicates" dialog: combine another contact's records into this one.
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [merging, setMerging] = useState(false);

  useEntityTitle(contact?.name ?? undefined);

  // Search other contacts to pick the duplicate to fold into this one.
  const debouncedMergeSearch = useDebounce(mergeSearch, 250);
  const mergeParams = new URLSearchParams();
  if (debouncedMergeSearch) mergeParams.set("search", debouncedMergeSearch);
  mergeParams.set("limit", "20");
  const { data: mergeData } = useApi<{ data?: { id: string; name: string; email: string | null }[] }>(
    mergeOpen ? `/api/v1/contacts?${mergeParams}` : null,
    { keepPrevious: true, learn: false }
  );
  const mergeResults = useMemo(() => (mergeData?.data ?? []).filter((c) => c.id !== id), [mergeData, id]);

  // Fold the picked duplicate INTO the contact being viewed (this one survives).
  async function handleMerge(duplicateId: string, duplicateName: string) {
    const orgId = getOrgId();
    if (!orgId || !contact) return;
    const confirmed = await confirm({
      title: `Combine "${duplicateName}" into "${contact.name}"?`,
      description:
        "All invoices, bills, payments and other records from the duplicate will be moved onto this contact. The duplicate is then removed. This can't be undone.",
      confirmLabel: "Combine them",
      destructive: true,
    });
    if (!confirmed) return;
    setMerging(true);
    try {
      // The route merges the [id] in the URL (source) into targetContactId
      // (survivor). We want THIS contact to survive, so the duplicate is the
      // source and this contact is the target.
      const res = await fetch(`/api/v1/contacts/${duplicateId}/merge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ targetContactId: contact.id }),
      });
      if (res.ok) {
        toast.success("Duplicate combined into this contact");
        setMergeOpen(false);
        setMergeSearch("");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(
          typeof data.error === "string"
            ? data.error
            : "Couldn't combine the contacts"
        );
      }
    } finally {
      setMerging(false);
    }
  }

  const activeTab = pathname.endsWith("/activity") ? "activity"
    : pathname.endsWith("/statement") ? "statement"
    : pathname.endsWith("/bookkeeping") ? "bookkeeping"
    : pathname.endsWith("/people") ? "people"
    : pathname.endsWith("/files") ? "files"
    : "details";

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
    <ContactContext.Provider
      value={{
        contact,
        setContact,
        fetchContact,
        confirm,
        confirmDialog,
        formType: form.type,
        setFormType: setField("type"),
        formRevenueAccountId: form.revenueAccountId,
        setFormRevenueAccountId: setField("revenueAccountId"),
        formExpenseAccountId: form.expenseAccountId,
        setFormExpenseAccountId: setField("expenseAccountId"),
        formTaxRateId: form.taxRateId,
        setFormTaxRateId: setField("taxRateId"),
        formTaxExempt: form.taxExempt,
        setFormTaxExempt: setField("taxExempt"),
        form1099Vendor: form.is1099Vendor,
        setForm1099Vendor: setField("is1099Vendor"),
        formCreditLimit: form.creditLimit,
        setFormCreditLimit: setField("creditLimit"),
        formCurrencyCode: form.currencyCode,
        setFormCurrencyCode: setField("currencyCode"),
        saving,
        setSaving,
      }}
    >
      <div>
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push("/contacts")}
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to contacts
          </button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setMergeOpen(true)}
              title="Found the same contact entered twice? Combine the other one's records into this contact and remove the duplicate."
            >
              <Merge className="size-3" />
              Merge duplicates
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => openDrawer("deal", { contactId: contact.id, contactName: contact.name })}
              title="Start tracking a potential sale with this contact"
            >
              <Target className="size-3" />
              Add a sales opportunity
            </Button>
          </div>
        </div>

        {/* Merge duplicates */}
        <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Merge a duplicate into this contact</DialogTitle>
              <DialogDescription>
                Pick the other contact that&apos;s the same as this one. Its
                invoices, bills, payments and notes move onto{" "}
                <span className="font-medium">{contact.name}</span>, and the
                duplicate is removed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search for the duplicate contact..."
                  value={mergeSearch}
                  onChange={(e) => setMergeSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {mergeResults.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                    No other contacts found.
                  </p>
                ) : (
                  mergeResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={merging}
                      onClick={() => handleMerge(c.id, c.name)}
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {c.name}
                        </span>
                        {c.email && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.email}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-brand-600">
                        Merge in
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Tab nav */}
        <nav className="-mt-2 mb-8 flex items-center gap-1 overflow-x-auto border-b border-border">
          {TABS.map((t) => {
            const Icon = t.icon;
            const tabHref = t.value === "details" ? `/contacts/${id}` : `/contacts/${id}/${t.value}`;
            const active = activeTab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => router.push(tabHref)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-[13px] font-medium transition-colors",
                  active
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

        {/* Tab content */}
        <ContentReveal key={pathname}>
          {children}
        </ContentReveal>

        {confirmDialog}
      </div>
    </ContactContext.Provider>
  );
}
