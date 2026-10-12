"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, Trash2, UserPlus, Building2, Truck, ArrowRight, Target, Copy, Mail, Download, ScrollText, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useTopbarAction } from "@/components/dashboard/topbar";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton } from "@/components/dashboard/explorer/action-button";
import { RecentActivity } from "@/components/dashboard/contacts/recent-activity";
import { PortalInviteDialog } from "@/components/dashboard/contacts/portal-invite-dialog";
import { downloadStatementPdfs, emailStatements } from "@/components/dashboard/contacts/actions";
import { DateCell, MoneyCell, MutedCell, PartyCell, StatusPill, formatDay, parseDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface Address {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/**
 * One row of GET /api/v1/contacts. The API also returns `taxIdentifier`
 * (TIN/SSN from the W-9); it is deliberately left out so it never reaches
 * the table, the preview or the CSV export.
 */
interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  type: "customer" | "supplier" | "both";
  paymentTermsDays: number | null;
  creditLimit: number | null;
  isTaxExempt: boolean;
  is1099Vendor: boolean;
  w9TaxClassification: string | null;
  backupWithholding: boolean;
  linkedOrgId: string | null;
  peppolId: string | null;
  currencyCode: string | null;
  addresses: { billing?: Address; shipping?: Address } | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Unpaid invoices: what this customer owes you (cents). */
  owesYou?: number;
  /** Unpaid bills: what you owe this supplier (cents). */
  youOwe?: number;
  /** Past-due part of both, in cents. */
  overdue?: number;
}

const TYPES: ExplorerStatus[] = [
  { value: "customer", label: "Customer", color: "#0EA5E9", hint: "Someone you sell to and send invoices" },
  { value: "supplier", label: "Supplier", color: "#14B8A6", hint: "Someone you buy from and get bills from" },
  { value: "both", label: "Customer & supplier", color: "#8B5CF6", hint: "You both sell to and buy from them" },
];

const W9: Record<string, string> = {
  individual: "Individual / sole proprietor",
  c_corp: "C corporation",
  s_corp: "S corporation",
  partnership: "Partnership",
  trust_estate: "Trust / estate",
  llc: "LLC",
};

const terms = (c: Contact) => (c.paymentTermsDays == null ? null : c.paymentTermsDays === 0 ? "Due on receipt" : `Net ${c.paymentTermsDays}`);
const country = (c: Contact) => c.addresses?.billing?.country || c.addresses?.shipping?.country || null;
const city = (c: Contact) => c.addresses?.billing?.city || c.addresses?.shipping?.city || null;
const isCustomer = (c: Contact) => c.type === "customer" || c.type === "both";
const isSupplier = (c: Contact) => c.type === "supplier" || c.type === "both";

function addressLine(a: Address | undefined) {
  if (!a) return null;
  const parts = [a.line1, a.line2, a.city, a.state, a.postalCode, a.country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function sum(rows: Contact[], pick: (c: Contact) => number | undefined) {
  return rows.reduce((s, c) => s + (pick(c) ?? 0), 0);
}

function TaxBadges({ c }: { c: Contact }) {
  if (!c.isTaxExempt && !c.is1099Vendor) return <span className="text-muted-foreground/50">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {c.isTaxExempt && (
        <span title="You don't charge tax to this contact" className="rounded bg-foreground/[0.055] px-1.5 py-px text-[11px] font-medium text-foreground/75">
          No tax
        </span>
      )}
      {c.is1099Vendor && (
        <span title="Tracked for a year-end 1099 (US contractor)" className="rounded bg-amber-500/10 px-1.5 py-px text-[11px] font-medium text-amber-700 dark:text-amber-400">
          1099
        </span>
      )}
    </span>
  );
}

export default function ContactsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();
  useDocumentTitle("Contacts · All Contacts");
  const [invite, setInvite] = useState<Contact | null>(null);

  useTopbarAction(
    useMemo(
      () => (
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-lg px-3 text-[13px]"
          onClick={() => router.push("/contacts/duplicates")}
          title="Find contacts that were entered twice and merge them"
        >
          <Copy className="size-3.5" />
          <span className="hidden sm:inline">Find duplicates</span>
        </Button>
      ),
      [router]
    )
  );

  const config = useMemo<ExplorerConfig<Contact>>(
    () => ({
      id: "contacts",
      endpoint: "/api/v1/contacts",
      noun: { one: "Contact", many: "Contacts" },
      getId: (c) => c.id,
      href: (c) => `/contacts/${c.id}`,
      status: { get: (c) => c.type, options: TYPES },
      date: { get: (c) => c.createdAt, label: "Date added" },
      currency: (c) => c.currencyCode,
      search: (c) => [c.name, c.email, c.phone, c.taxNumber, city(c), country(c), c.peppolId],
      defaultSort: { key: "created", dir: "desc" },
      facets: [
        { key: "terms", label: "Payment terms", value: terms },
        { key: "currency", label: "Currency", value: (c) => c.currencyCode },
        { key: "country", label: "Country", value: country },
        { key: "tax", label: "Tax", value: (c) => (c.isTaxExempt ? "No tax charged" : "Tax charged") },
        { key: "1099", label: "1099", value: (c) => (c.is1099Vendor ? "Tracked for 1099" : "Not tracked") },
        {
          key: "balance",
          label: "Balance",
          value: (c) => ((c.overdue ?? 0) > 0 ? "Something overdue" : (c.owesYou ?? 0) > 0 ? "Owes you" : (c.youOwe ?? 0) > 0 ? "You owe them" : "Nothing owed"),
        },
      ],
      columns: [
        { key: "name", label: "Name", value: (c) => c.name, render: (c) => <PartyCell name={c.name} sub={c.email} /> },
        { key: "type", label: "Type", className: "w-44", value: (c) => c.type, render: (c) => <StatusPill value={c.type} options={TYPES} /> },
        { key: "phone", label: "Phone", className: "w-36", value: (c) => c.phone, render: (c) => <MutedCell value={c.phone} /> },
        { key: "terms", label: "Payment terms", className: "w-32", hint: "How many days they have to pay an invoice", value: (c) => c.paymentTermsDays, render: (c) => <MutedCell value={terms(c)} />, csv: terms },
        {
          key: "owesYou",
          label: "Owes you",
          align: "right",
          className: "w-32",
          money: true,
          hint: "Unpaid invoices you've sent this customer",
          value: (c) => c.owesYou ?? 0,
          render: (c) => (
            <MoneyCell
              cents={c.owesYou ?? 0}
              currency={c.currencyCode}
              className={c.creditLimit != null && (c.owesYou ?? 0) > c.creditLimit ? "font-semibold text-red-600 dark:text-red-400" : (c.owesYou ?? 0) > 0 ? "font-medium" : undefined}
            />
          ),
        },
        {
          key: "youOwe",
          label: "You owe",
          align: "right",
          className: "w-32",
          money: true,
          hint: "Unpaid bills from this supplier",
          value: (c) => c.youOwe ?? 0,
          render: (c) => <MoneyCell cents={c.youOwe ?? 0} currency={c.currencyCode} className={(c.youOwe ?? 0) > 0 ? "font-medium" : undefined} />,
        },
        {
          key: "overdue",
          label: "Overdue",
          align: "right",
          className: "w-32",
          money: true,
          hint: "The part of either balance that is past its due date",
          value: (c) => c.overdue ?? 0,
          render: (c) => <MoneyCell cents={c.overdue ?? 0} currency={c.currencyCode} className={(c.overdue ?? 0) > 0 ? "font-semibold text-red-600 dark:text-red-400" : undefined} />,
        },
        {
          key: "creditLimit",
          label: "Credit limit",
          align: "right",
          className: "w-32",
          hint: "The most this customer can owe you at once",
          value: (c) => c.creditLimit,
          render: (c) => (c.creditLimit != null ? <MoneyCell cents={c.creditLimit} currency={c.currencyCode} /> : <span className="text-muted-foreground/60">No limit</span>),
          csv: (c) => (c.creditLimit != null ? (c.creditLimit / 100).toFixed(2) : ""),
        },
        {
          key: "creditUsed",
          label: "Credit used",
          align: "right",
          className: "w-28",
          hidden: true,
          hint: "How much of the credit limit their unpaid invoices take up",
          value: (c) => (c.creditLimit ? Math.round(((c.owesYou ?? 0) / c.creditLimit) * 100) : null),
          render: (c) => {
            if (!c.creditLimit) return <span className="text-muted-foreground/50">—</span>;
            const pct = Math.round(((c.owesYou ?? 0) / c.creditLimit) * 100);
            return <span className={pct > 100 ? "font-semibold tabular-nums text-red-600 dark:text-red-400" : pct > 80 ? "tabular-nums text-amber-700 dark:text-amber-400" : "tabular-nums"}>{pct}%</span>;
          },
        },
        { key: "tax", label: "Tax", className: "w-28", value: (c) => [c.isTaxExempt && "No tax", c.is1099Vendor && "1099"].filter(Boolean).join(", "), render: (c) => <TaxBadges c={c} /> },
        { key: "currency", label: "Currency", className: "w-24", value: (c) => c.currencyCode },
        { key: "created", label: "Added", className: "w-32", value: (c) => c.createdAt, render: (c) => <DateCell value={c.createdAt} /> },
        { key: "email", label: "Email", hidden: true, value: (c) => c.email, render: (c) => <MutedCell value={c.email} /> },
        { key: "taxNumber", label: "Tax number", className: "w-36", hidden: true, hint: "Their VAT, GST or company tax number", value: (c) => c.taxNumber, render: (c) => <MutedCell value={c.taxNumber} /> },
        { key: "city", label: "City", className: "w-32", hidden: true, value: city, render: (c) => <MutedCell value={city(c)} /> },
        { key: "country", label: "Country", className: "w-28", hidden: true, value: country, render: (c) => <MutedCell value={country(c)} /> },
        { key: "w9", label: "W-9 type", className: "w-40", hidden: true, hint: "US tax classification from their W-9 form", value: (c) => (c.w9TaxClassification ? W9[c.w9TaxClassification] ?? c.w9TaxClassification : null), render: (c) => <MutedCell value={c.w9TaxClassification ? W9[c.w9TaxClassification] ?? c.w9TaxClassification : null} /> },
        { key: "backup", label: "Backup withholding", className: "w-36", hidden: true, hint: "You must hold back 24% of payments, usually because their tax ID is missing or wrong", value: (c) => (c.backupWithholding ? "Yes" : "No") },
        { key: "intercompany", label: "Intercompany", className: "w-28", hidden: true, hint: "This contact is another company in your group", value: (c) => (c.linkedOrgId ? "Yes" : "No") },
        { key: "peppol", label: "Peppol ID", className: "w-40", hidden: true, hint: "Their e-invoicing address", value: (c) => c.peppolId, render: (c) => <MutedCell value={c.peppolId} /> },
        { key: "updated", label: "Last changed", className: "w-32", hidden: true, value: (c) => c.updatedAt, render: (c) => <DateCell value={c.updatedAt} /> },
      ],
      metrics: (rows) => {
        const customers = rows.filter(isCustomer);
        const suppliers = rows.filter(isSupplier);
        const owing = customers.filter((c) => (c.owesYou ?? 0) > 0);
        const owed = suppliers.filter((c) => (c.youOwe ?? 0) > 0);
        const late = rows.filter((c) => (c.overdue ?? 0) > 0);
        const now = new Date();
        const inMonth = (c: Contact, offset: number) => {
          const d = parseDay(c.createdAt);
          const ref = new Date(now.getFullYear(), now.getMonth() - offset, 1);
          return d != null && d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
        };
        const added = rows.filter((c) => inMonth(c, 0)).length;
        const addedLast = rows.filter((c) => inMonth(c, 1)).length;
        const noEmail = rows.filter((c) => !c.email);
        const noTax = rows.filter((c) => c.isTaxExempt).length;
        const tracked1099 = rows.filter((c) => c.is1099Vendor).length;
        return [
          { key: "owesYou", label: "Customers owe you", color: "#0EA5E9", status: "customer", value: formatMoney(sum(owing, (c) => c.owesYou)), note: `${customers.length} customer${customers.length === 1 ? "" : "s"} · ${owing.length} with unpaid invoices`, hint: "Everything your customers still have to pay you. Click to see customers only." },
          { key: "youOwe", label: "You owe suppliers", color: "#14B8A6", status: "supplier", value: formatMoney(sum(owed, (c) => c.youOwe)), note: `${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"} · ${owed.length} with unpaid bills`, hint: "Bills from suppliers you haven't paid yet. Click to see suppliers only." },
          { key: "overdue", label: "Overdue", color: "#EF4444", value: formatMoney(sum(late, (c) => c.overdue)), note: late.length ? `${late.length} contact${late.length === 1 ? "" : "s"} past due` : "Nothing is late", hint: "Invoices and bills past their due date, added up across both sides." },
          { key: "added", label: "Added this month", color: "#8B5CF6", value: added.toString(), note: `${addedLast} last month`, hint: "New contacts created since the 1st of this month." },
          { key: "noEmail", label: "Missing email", color: "#F59E0B", value: noEmail.length.toString(), note: noEmail.length ? "Can't email invoices or statements" : "Everyone has an email", hint: "Contacts without an email address. You can't send them documents until you add one." },
          { key: "tax", label: "No tax charged", color: "#A1A1AA", value: noTax.toString(), note: `${tracked1099} tracked for 1099`, hint: "Contacts you don't charge tax to, and US contractors you track for a year-end 1099." },
        ];
      },
      preview: (c, helpers) => {
        const owes = c.owesYou ?? 0;
        const owe = c.youOwe ?? 0;
        const cur = c.currencyCode || "USD";
        return (
          <DocumentPreview
            plainTitle
          number={c.taxNumber ? `Tax no. ${c.taxNumber}` : `Added ${formatDay(c.createdAt)}`}
            status={c.type}
            statusOptions={TYPES}
            party={c.name}
            partySub={c.email}
            amount={owes > 0 ? owes : owe}
            amountLabel={owes > 0 ? "owes you" : owe > 0 ? "you owe" : "nothing owed either way"}
            currency={cur}
            facts={[
              { label: "Owes you", value: formatMoney(owes, cur) },
              { label: "You owe", value: formatMoney(owe, cur) },
              { label: "Overdue", value: (c.overdue ?? 0) > 0 ? <span className="text-red-600 dark:text-red-400">{formatMoney(c.overdue ?? 0, cur)}</span> : "Nothing late" },
              { label: "Credit limit", value: c.creditLimit != null ? formatMoney(c.creditLimit, cur) : "No limit" },
              { label: "Payment terms", value: terms(c) ?? "—" },
              { label: "Currency", value: cur },
              { label: "Phone", value: c.phone || "—" },
              { label: "Email", value: c.email || "—" },
              { label: "Tax", value: c.isTaxExempt ? "No tax charged" : "Tax charged" },
              { label: "1099", value: c.is1099Vendor ? (c.w9TaxClassification ? `Yes · ${W9[c.w9TaxClassification] ?? c.w9TaxClassification}` : "Yes") : "Not tracked" },
              { label: "Billing address", value: addressLine(c.addresses?.billing) ?? "—" },
              { label: "Added", value: formatDay(c.createdAt) },
            ]}
            actions={
              <>
                {isCustomer(c) && c.email && (
                  <ActionButton primary icon={<Mail className="size-3.5" />} run={() => emailStatements([c])}>
                    Email statement
                  </ActionButton>
                )}
                <ActionButton icon={<Download className="size-3.5" />} run={() => downloadStatementPdfs([c])}>
                  Statement PDF
                </ActionButton>
                <Link href={`/contacts/${c.id}/statement`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-[13px] font-medium transition-colors hover:bg-foreground/[0.03]">
                  <ScrollText className="size-3.5" />
                  Full statement
                </Link>
                {isCustomer(c) && (
                  <ActionButton icon={<Globe className="size-3.5" />} run={async () => setInvite(c)}>
                    Invite to portal
                  </ActionButton>
                )}
                <ActionButton
                  icon={<Target className="size-3.5" />}
                  run={async () => openDrawer("deal", { contactId: c.id, contactName: c.name })}
                >
                  Add opportunity
                </ActionButton>
                <ActionButton
                  icon={<Trash2 className="size-3.5" />}
                  className="text-red-600 dark:text-red-400"
                  run={() =>
                    confirm({
                      title: `Delete "${c.name}"?`,
                      description: "This contact and all associated data will be permanently deleted.",
                      confirmLabel: "Delete",
                      destructive: true,
                      onConfirm: async () => {
                        const orgId = localStorage.getItem("activeOrgId");
                        if (!orgId) return;
                        const res = await fetch(`/api/v1/contacts/${c.id}`, { method: "DELETE", headers: { "x-organization-id": orgId } });
                        if (!res.ok) {
                          toast.error("Couldn't delete this contact");
                          throw new Error("delete failed");
                        }
                        toast.success("Contact deleted");
                        helpers.refresh();
                      },
                    })
                  }
                >
                  Delete
                </ActionButton>
              </>
            }
          >
            {c.notes && (
              <div className="mt-6">
                <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{c.notes}</p>
              </div>
            )}
            <RecentActivity contactId={c.id} />
          </DocumentPreview>
        );
      },
      empty: <ContactsEmpty onCreate={() => openDrawer("contact")} />,
    }),
    [openDrawer, confirm]
  );

  return (
    <>
      <Explorer config={config} />
      <PortalInviteDialog open={invite != null} onOpenChange={(o) => !o && setInvite(null)} contact={invite} />
      {confirmDialog}
    </>
  );
}

function ContactsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div className="relative flex min-h-[calc(100vh-8rem)] flex-col">
        {/* Background skeleton table */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-6">
          <div className="w-full max-w-3xl rounded-lg border overflow-hidden">
            {/* Header row matching DataTable */}
            <div className="flex items-center gap-4 border-b bg-muted/50 px-4 h-10">
              <div className="h-2 w-12 rounded bg-muted-foreground/20" />
              <div className="h-2 w-8 rounded bg-muted-foreground/20" />
              <div className="h-2 w-10 rounded bg-muted-foreground/20 hidden sm:block" />
              <div className="ml-auto h-2 w-16 rounded bg-muted-foreground/20 hidden sm:block" />
              <div className="h-2 w-12 rounded bg-muted-foreground/20" />
            </div>
            {/* Data rows */}
            {[
              { badge: "bg-blue-100 text-blue-400 dark:bg-blue-900/40 dark:text-blue-500" },
              { badge: "bg-orange-100 text-orange-400 dark:bg-orange-900/40 dark:text-orange-500" },
              { badge: "bg-blue-100 text-blue-400 dark:bg-blue-900/40 dark:text-blue-500" },
              { badge: "bg-purple-100 text-purple-400 dark:bg-purple-900/40 dark:text-purple-500" },
              { badge: "bg-orange-100 text-orange-400 dark:bg-orange-900/40 dark:text-orange-500" },
              { badge: "bg-blue-100 text-blue-400 dark:bg-blue-900/40 dark:text-blue-500" },
              { badge: "bg-purple-100 text-purple-400 dark:bg-purple-900/40 dark:text-purple-500" },
              { badge: "bg-orange-100 text-orange-400 dark:bg-orange-900/40 dark:text-orange-500" },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-4 border-b last:border-0 px-4 h-12">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className={`h-2.5 rounded bg-muted ${i % 3 === 0 ? "w-28" : i % 3 === 1 ? "w-32" : "w-24"}`} />
                  <div className={`h-2 rounded bg-muted/50 ${i % 2 === 0 ? "w-36" : "w-28"}`} />
                </div>
                <div className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${row.badge} hidden sm:block`}>
                  {i % 3 === 0 ? "customer" : i % 3 === 1 ? "supplier" : "both"}
                </div>
                <div className={`h-2.5 rounded bg-muted/50 hidden sm:block ${i % 2 === 0 ? "w-20" : "w-16"}`} />
                <div className={`h-2.5 rounded bg-muted/40 hidden sm:block ${i % 2 === 0 ? "w-16" : "w-12"}`} />
              </div>
            ))}
          </div>
          {/* Fade to background */}
          <div className="absolute inset-0 bg-gradient-to-b from-content-bg/30 via-content-bg/70 to-content-bg" />
        </div>

        {/* Top section */}
        <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 sm:py-12 text-center">
          <div className="flex size-12 sm:size-14 items-center justify-center rounded-2xl bg-brand-100 dark:bg-brand-950/50">
            <Users className="size-6 sm:size-7 text-brand-600 dark:text-brand-400" />
          </div>
          <h2 className="mt-4 sm:mt-5 text-lg sm:text-xl font-semibold tracking-tight">Manage your contacts</h2>
          <p className="mt-2 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Keep track of everyone you do business with. Add customers, suppliers, or contacts that are both.
          </p>
          <Button onClick={onCreate} size="lg" className="mt-6 bg-brand-600 hover:bg-brand-700">
            <UserPlus className="mr-2 size-4" />
            Add your first contact
          </Button>
        </div>

        {/* Feature cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3 px-4 sm:px-0 pb-6 sm:pb-8">
          {[
            {
              icon: Building2,
              title: "Customers",
              description: "Track who you sell to, their payment terms, and outstanding balances.",
              color: "text-blue-600 dark:text-blue-400",
              bg: "bg-blue-50 dark:bg-blue-950/40",
            },
            {
              icon: Truck,
              title: "Suppliers",
              description: "Manage who you buy from, your purchase history, and what you owe them.",
              color: "text-orange-600 dark:text-orange-400",
              bg: "bg-orange-50 dark:bg-orange-950/40",
            },
            {
              icon: ArrowRight,
              title: "Linked data",
              description: "Contacts connect to their invoices, bills, and bookkeeping entries automatically.",
              color: "text-purple-600 dark:text-purple-400",
              bg: "bg-purple-50 dark:bg-purple-950/40",
            },
          ].map(({ icon: Icon, title, description, color, bg }) => (
            <div key={title} className="group rounded-xl p-4 sm:p-5">
              <div className={`flex size-9 items-center justify-center rounded-lg ${bg}`}>
                <Icon className={`size-4.5 ${color}`} />
              </div>
              <h3 className="mt-3 text-[13px] font-semibold">{title}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </ContentReveal>
  );
}
