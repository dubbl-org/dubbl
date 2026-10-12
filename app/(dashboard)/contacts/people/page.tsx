"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Copy, Loader2, Mail, Phone, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, MutedCell, PartyCell, StatusPill, formatDay, parseDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";
import { copyText } from "@/components/dashboard/contacts/actions";

/** One row of GET /api/v1/contacts/people. */
interface Person {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  contactId: string;
  contactName: string;
  contactType: "customer" | "supplier" | "both";
  contactEmail: string | null;
}

const COMPANY_TYPES: ExplorerStatus[] = [
  { value: "customer", label: "At a customer", color: "#0EA5E9", hint: "Works at someone you sell to" },
  { value: "supplier", label: "At a supplier", color: "#14B8A6", hint: "Works at someone you buy from" },
  { value: "both", label: "At customer & supplier", color: "#8B5CF6", hint: "Works at a contact you both sell to and buy from" },
];

const TYPE_LABEL: Record<Person["contactType"], string> = { customer: "Customer", supplier: "Supplier", both: "Customer & supplier" };

function PrimaryBadge() {
  return (
    <span title="The main person you deal with at this company" className="rounded bg-foreground/[0.055] px-1.5 py-px text-[11px] font-medium text-foreground/75">
      Primary
    </span>
  );
}

export default function PeoplePage() {
  useDocumentTitle("Contacts · People");
  const [adding, setAdding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const config = useMemo<ExplorerConfig<Person>>(
    () => ({
      id: "contact-people",
      endpoint: "/api/v1/contacts/people",
      noun: { one: "Person", many: "People" },
      getId: (p) => p.id,
      href: (p) => `/contacts/${p.contactId}/people`,
      status: { get: (p) => p.contactType, options: COMPANY_TYPES },
      date: { get: (p) => p.createdAt, label: "Date added" },
      chart: false,
      search: (p) => [p.name, p.email, p.phone, p.jobTitle, p.contactName],
      defaultSort: { key: "company", dir: "asc" },
      party: { get: (p) => p.contactName, label: "Company", many: "Companies" },
      facets: [
        { key: "primary", label: "Primary", value: (p) => (p.isPrimary ? "Primary person" : "Other people") },
        { key: "role", label: "Role", value: (p) => p.jobTitle },
        { key: "reach", label: "Reachable by", value: (p) => (p.email && p.phone ? "Email and phone" : p.email ? "Email only" : p.phone ? "Phone only" : "No email or phone") },
      ],
      columns: [
        {
          key: "name",
          label: "Name",
          value: (p) => p.name,
          render: (p) => (
            <span className="flex min-w-0 items-center gap-2">
              <PartyCell name={p.name} sub={p.jobTitle} />
              {p.isPrimary && <PrimaryBadge />}
            </span>
          ),
        },
        { key: "company", label: "Company", className: "w-52", value: (p) => p.contactName, render: (p) => <span className="truncate text-foreground/85">{p.contactName}</span> },
        { key: "type", label: "Company type", className: "w-48", value: (p) => p.contactType, render: (p) => <StatusPill value={p.contactType} options={COMPANY_TYPES} /> },
        { key: "email", label: "Email", className: "w-56", value: (p) => p.email, render: (p) => <MutedCell value={p.email} /> },
        { key: "phone", label: "Phone", className: "w-40", value: (p) => p.phone, render: (p) => <MutedCell value={p.phone} /> },
        { key: "role", label: "Role", className: "w-40", hidden: true, value: (p) => p.jobTitle, render: (p) => <MutedCell value={p.jobTitle} /> },
        { key: "primary", label: "Primary", className: "w-24", hidden: true, value: (p) => (p.isPrimary ? "Yes" : "No") },
        { key: "added", label: "Added", className: "w-32", value: (p) => p.createdAt, render: (p) => <DateCell value={p.createdAt} /> },
      ],
      metrics: (rows) => {
        const companies = new Set(rows.map((p) => p.contactId));
        const withPrimary = new Set(rows.filter((p) => p.isPrimary).map((p) => p.contactId));
        const noEmail = rows.filter((p) => !p.email).length;
        const noPhone = rows.filter((p) => !p.phone).length;
        const now = new Date();
        const added = rows.filter((p) => {
          const d = parseDay(p.createdAt);
          return d != null && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }).length;
        const atCustomers = rows.filter((p) => p.contactType !== "supplier").length;
        return [
          { key: "people", label: "People", color: "#0EA5E9", value: rows.length.toString(), note: `At ${companies.size} compan${companies.size === 1 ? "y" : "ies"}`, hint: "Everyone you've saved at your customers and suppliers." },
          { key: "customers", label: "At customers", color: "#0EA5E9", status: "customer", value: atCustomers.toString(), note: `${rows.length - atCustomers} at suppliers`, hint: "People who work at a customer. Click to show only them." },
          { key: "primary", label: "Primary people", color: "#10B981", value: withPrimary.size.toString(), note: `${companies.size - withPrimary.size} compan${companies.size - withPrimary.size === 1 ? "y has" : "ies have"} none set`, hint: "Companies where you've marked who your main person is." },
          { key: "noEmail", label: "Missing email", color: "#F59E0B", value: noEmail.toString(), note: noEmail ? "Add one to reach them" : "Everyone has an email", hint: "People without an email address." },
          { key: "noPhone", label: "Missing phone", color: "#A1A1AA", value: noPhone.toString(), note: noPhone ? "No number to call" : "Everyone has a phone", hint: "People without a phone number." },
          { key: "added", label: "Added this month", color: "#8B5CF6", value: added.toString(), note: "Since the 1st", hint: "People saved since the 1st of this month." },
        ];
      },
      bulkActions: (selected) => {
        const emails = selected.map((p) => p.email).filter(Boolean) as string[];
        return (
          <>
            <ActionButton icon={<Copy className="size-3.5" />} run={() => copyText(emails.join(", "), `Copied ${emails.length} email${emails.length === 1 ? "" : "s"}`)} className={emails.length ? undefined : "pointer-events-none opacity-40"}>
              Copy emails
            </ActionButton>
            <ActionButton icon={<Mail className="size-3.5" />} run={async () => void window.open(`mailto:?bcc=${encodeURIComponent(emails.join(","))}`)} className={emails.length ? undefined : "pointer-events-none opacity-40"}>
              Email them
            </ActionButton>
          </>
        );
      },
      preview: (p) => (
        <DocumentPreview
          plainTitle
          number={p.jobTitle || "Contact person"}
          party={p.name}
          partySub={p.email}
          facts={[
            { label: "Company", value: <Link href={`/contacts/${p.contactId}`} className="underline-offset-2 hover:underline">{p.contactName}</Link> },
            { label: "Company type", value: TYPE_LABEL[p.contactType] },
            { label: "Role", value: p.jobTitle || "—" },
            { label: "Primary", value: p.isPrimary ? "Yes, main person" : "No" },
            { label: "Email", value: p.email ? <a href={`mailto:${p.email}`} className="underline-offset-2 hover:underline">{p.email}</a> : "—" },
            { label: "Phone", value: p.phone ? <a href={`tel:${p.phone}`} className="tabular-nums underline-offset-2 hover:underline">{p.phone}</a> : "—" },
            { label: "Company email", value: p.contactEmail || "—" },
            { label: "Added", value: formatDay(p.createdAt) },
          ]}
          actions={
            <>
              {p.email && (
                <a href={`mailto:${p.email}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-medium text-background hover:opacity-90">
                  <Mail className="size-3.5" />
                  Email
                </a>
              )}
              {p.phone && (
                <a href={`tel:${p.phone}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-[13px] font-medium hover:bg-foreground/[0.03]">
                  <Phone className="size-3.5" />
                  Call
                </a>
              )}
              {p.email && (
                <ActionButton icon={<Copy className="size-3.5" />} run={() => copyText(p.email!, "Email copied")}>
                  Copy email
                </ActionButton>
              )}
              <Link href={`/contacts/${p.contactId}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-[13px] font-medium hover:bg-foreground/[0.03]">
                <Building2 className="size-3.5" />
                Open company
              </Link>
            </>
          }
        >
          {p.notes && (
            <div className="mt-6">
              <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{p.notes}</p>
            </div>
          )}
        </DocumentPreview>
      ),
      create: { label: "Add person", onClick: () => setAdding(true) },
      empty: <PeopleEmpty onAdd={() => setAdding(true)} />,
    }),
    []
  );

  return (
    <>
      <Explorer config={config} refreshKey={refreshKey} />
      <AddPersonDialog open={adding} onOpenChange={setAdding} onAdded={() => setRefreshKey((k) => k + 1)} />
    </>
  );
}

function AddPersonDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => void }) {
  const [contactId, setContactId] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contactId) {
      toast.error("Pick the company they work at");
      return;
    }
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? "").trim() || null;
    setBusy(true);
    try {
      await postJson(`/api/v1/contacts/${contactId}/people`, {
        name: text("name"),
        email: text("email"),
        phone: text("phone"),
        jobTitle: text("jobTitle"),
        isPrimary,
      });
      toast.success("Person added");
      onAdded();
      setContactId("");
      setIsPrimary(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add this person");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a person</DialogTitle>
          <DialogDescription>Someone you deal with at one of your customers or suppliers.</DialogDescription>
        </DialogHeader>
        <form id="add-person" onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Company</Label>
            <ContactPicker value={contactId} onChange={setContactId} placeholder="Which contact do they work at?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-name">Name</Label>
            <Input id="person-name" name="name" required placeholder="Full name" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="person-email">Email</Label>
              <Input id="person-email" name="email" type="email" placeholder="name@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-phone">Phone</Label>
              <Input id="person-phone" name="phone" placeholder="+1 555 000 0000" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-role">Role</Label>
            <Input id="person-role" name="jobTitle" placeholder="e.g. Accounts payable, CFO" />
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={isPrimary} onCheckedChange={(v) => setIsPrimary(v === true)} />
            Main person at this company
          </label>
        </form>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" type="submit" form="add-person" disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Add person
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PeopleEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-foreground/[0.05]">
        <UserRound className="size-6 text-foreground/70" />
      </div>
      <h2 className="mt-4 text-[17px] font-semibold tracking-tight">No people saved yet</h2>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
        Save the actual humans at your customers and suppliers — who approves invoices, who chases payments — so you always know who to email.
      </p>
      <Button size="sm" className="mt-5 gap-1.5" onClick={onAdd}>
        <UserPlus className="size-3.5" />
        Add a person
      </Button>
    </div>
  );
}
