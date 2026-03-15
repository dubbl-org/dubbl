"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { centsToDecimal } from "@/lib/money";

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
  setContact: React.Dispatch<React.SetStateAction<ContactDetail | null>>;
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
  formCreditLimit: string;
  setFormCreditLimit: (v: string) => void;
  formCurrencyCode: string;
  setFormCurrencyCode: (v: string) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
}

const ContactContext = createContext<ContactContextValue | null>(null);

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

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Shared form state
  const [formType, setFormType] = useState<string>("customer");
  const [formRevenueAccountId, setFormRevenueAccountId] = useState<string>("none");
  const [formExpenseAccountId, setFormExpenseAccountId] = useState<string>("none");
  const [formTaxRateId, setFormTaxRateId] = useState<string>("none");
  const [formTaxExempt, setFormTaxExempt] = useState(false);
  const [formCreditLimit, setFormCreditLimit] = useState("");
  const [formCurrencyCode, setFormCurrencyCode] = useState("");
  const [saving, setSaving] = useState(false);

  useEntityTitle(contact?.name ?? undefined);

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
    fetchContact();
  }, [fetchContact]);

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
        formType,
        setFormType,
        formRevenueAccountId,
        setFormRevenueAccountId,
        formExpenseAccountId,
        setFormExpenseAccountId,
        formTaxRateId,
        setFormTaxRateId,
        formTaxExempt,
        setFormTaxExempt,
        formCreditLimit,
        setFormCreditLimit,
        formCurrencyCode,
        setFormCurrencyCode,
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
