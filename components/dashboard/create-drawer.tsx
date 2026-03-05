"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Users,
  FolderKanban,
  FileText,
  ShoppingCart,
  BookOpen,
  Package,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { LineItemsEditor, type LineItem } from "@/components/dashboard/line-items-editor";
import { EntryForm } from "@/components/dashboard/entry-form";

type DrawerType = "contact" | "project" | "invoice" | "bill" | "entry" | "inventory";

interface CreateDrawerContextValue {
  open: (type: DrawerType) => void;
  close: () => void;
}

const CreateDrawerContext = createContext<CreateDrawerContextValue | null>(null);

export function useCreateDrawer() {
  const ctx = useContext(CreateDrawerContext);
  if (!ctx) throw new Error("useCreateDrawer must be used within CreateDrawerProvider");
  return ctx;
}

export function CreateDrawerProvider({ children }: { children: React.ReactNode }) {
  const [activeType, setActiveType] = useState<DrawerType | null>(null);

  const open = useCallback((type: DrawerType) => setActiveType(type), []);
  const close = useCallback(() => setActiveType(null), []);

  return (
    <CreateDrawerContext.Provider value={{ open, close }}>
      {children}
      <ContactDrawer open={activeType === "contact"} onClose={close} />
      <ProjectDrawer open={activeType === "project"} onClose={close} />
      <InvoiceDrawer open={activeType === "invoice"} onClose={close} />
      <BillDrawer open={activeType === "bill"} onClose={close} />
      <EntryDrawer open={activeType === "entry"} onClose={close} />
      <InventoryDrawer open={activeType === "inventory"} onClose={close} />
    </CreateDrawerContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Shared drawer chrome
// ---------------------------------------------------------------------------
function DrawerIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function DrawerFooter({
  onClose,
  saving,
  label,
}: {
  onClose: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
      <Button type="button" variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        disabled={saving}
        className="bg-emerald-600 hover:bg-emerald-700"
      >
        {saving ? "Creating..." : label}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact Drawer
// ---------------------------------------------------------------------------
function ContactDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email") || null,
          phone: form.get("phone") || null,
          taxNumber: form.get("taxNumber") || null,
          type: form.get("type") || "customer",
          paymentTermsDays: parseInt(form.get("paymentTermsDays") as string) || 30,
          notes: form.get("notes") || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create contact");
      }
      const data = await res.json();
      toast.success("Contact created");
      onClose();
      router.push(`/contacts/${data.contact.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Users className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Contact</SheetTitle>
              <SheetDescription>Add a customer or supplier to your organization.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            <div className="space-y-4">
              <SectionLabel>Basic Info</SectionLabel>
              <div className="space-y-2">
                <Label htmlFor="drawer-contact-name">Name *</Label>
                <Input id="drawer-contact-name" name="name" required placeholder="Contact name" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="drawer-contact-email">Email</Label>
                  <Input id="drawer-contact-email" name="email" type="email" placeholder="email@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="drawer-contact-phone">Phone</Label>
                  <Input id="drawer-contact-phone" name="phone" placeholder="+1 (555) 000-0000" />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Details</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select name="type" defaultValue="customer">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="drawer-contact-terms">Payment Terms (days)</Label>
                  <Input id="drawer-contact-terms" name="paymentTermsDays" type="number" min={0} defaultValue={30} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="drawer-contact-tax">Tax Number</Label>
                <Input id="drawer-contact-tax" name="taxNumber" placeholder="Tax ID / VAT number" />
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Notes</SectionLabel>
              <Textarea name="notes" placeholder="Internal notes about this contact..." rows={3} />
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Contact" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Project Drawer
// ---------------------------------------------------------------------------
function ProjectDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (!open) { setContactId(""); setStartDate(""); setEndDate(""); }
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description") || null,
          contactId: contactId || null,
          status: form.get("status") || "active",
          budget: Math.round(parseFloat(form.get("budget") as string || "0") * 100),
          hourlyRate: Math.round(parseFloat(form.get("hourlyRate") as string || "0") * 100),
          startDate: startDate || null,
          endDate: endDate || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create project");
      }
      const data = await res.json();
      toast.success("Project created");
      onClose();
      router.push(`/projects/${data.project.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><FolderKanban className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Project</SheetTitle>
              <SheetDescription>Create a project to track time and billing.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            <div className="space-y-4">
              <SectionLabel>Project Info</SectionLabel>
              <div className="space-y-2">
                <Label htmlFor="drawer-project-name">Project Name *</Label>
                <Input id="drawer-project-name" name="name" required placeholder="Project name" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <ContactPicker value={contactId} onChange={setContactId} type="customer" />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select name="status" defaultValue="active">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Financials</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="drawer-project-budget">Budget</Label>
                  <Input id="drawer-project-budget" name="budget" type="number" step="0.01" min={0} defaultValue="0.00" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="drawer-project-rate">Hourly Rate</Label>
                  <Input id="drawer-project-rate" name="hourlyRate" type="number" step="0.01" min={0} defaultValue="0.00" placeholder="0.00" />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Timeline</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <DatePicker value={startDate} onChange={setStartDate} placeholder="Select start date" />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <DatePicker value={endDate} onChange={setEndDate} placeholder="Select end date" />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Description</SectionLabel>
              <Textarea name="description" placeholder="Project description..." rows={3} />
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Project" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Invoice Drawer
// ---------------------------------------------------------------------------
function InvoiceDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0];
  });
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([
    { description: "", quantity: "1", unitPrice: "", accountId: "", taxRateId: "" },
  ]);

  useEffect(() => {
    if (!open) {
      setContactId(""); setReference(""); setNotes("");
      setIssueDate(new Date().toISOString().split("T")[0]);
      const d = new Date(); d.setDate(d.getDate() + 30);
      setDueDate(d.toISOString().split("T")[0]);
      setLines([{ description: "", quantity: "1", unitPrice: "", accountId: "", taxRateId: "" }]);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactId) { toast.error("Please select a customer"); return; }
    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          contactId, issueDate, dueDate,
          reference: reference || null,
          notes: notes || null,
          lines: lines.map((l) => ({
            description: l.description,
            quantity: parseFloat(l.quantity) || 1,
            unitPrice: parseFloat(l.unitPrice) || 0,
            accountId: l.accountId || null,
            taxRateId: l.taxRateId || null,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create invoice");
      }
      const data = await res.json();
      toast.success("Invoice created");
      onClose();
      router.push(`/sales/${data.invoice.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><FileText className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Invoice</SheetTitle>
              <SheetDescription>Create a sales invoice for your customer.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            <div className="space-y-4">
              <SectionLabel>Invoice Details</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Customer *</Label>
                  <ContactPicker value={contactId} onChange={setContactId} type="customer" />
                </div>
                <div className="space-y-2">
                  <Label>Reference</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO number, etc." />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Issue Date</Label>
                  <DatePicker value={issueDate} onChange={setIssueDate} placeholder="Issue date" />
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <DatePicker value={dueDate} onChange={setDueDate} placeholder="Due date" />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Line Items</SectionLabel>
              <LineItemsEditor lines={lines} onChange={setLines} accountTypeFilter={["revenue"]} />
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Notes</SectionLabel>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes to customer..." rows={3} />
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Invoice" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Bill Drawer
// ---------------------------------------------------------------------------
function BillDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0];
  });
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([
    { description: "", quantity: "1", unitPrice: "", accountId: "", taxRateId: "" },
  ]);

  useEffect(() => {
    if (!open) {
      setContactId(""); setReference(""); setNotes("");
      setIssueDate(new Date().toISOString().split("T")[0]);
      const d = new Date(); d.setDate(d.getDate() + 30);
      setDueDate(d.toISOString().split("T")[0]);
      setLines([{ description: "", quantity: "1", unitPrice: "", accountId: "", taxRateId: "" }]);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactId) { toast.error("Please select a supplier"); return; }
    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          contactId, issueDate, dueDate,
          reference: reference || null,
          notes: notes || null,
          lines: lines.map((l) => ({
            description: l.description,
            quantity: parseFloat(l.quantity) || 1,
            unitPrice: parseFloat(l.unitPrice) || 0,
            accountId: l.accountId || null,
            taxRateId: l.taxRateId || null,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create bill");
      }
      const data = await res.json();
      toast.success("Bill created");
      onClose();
      router.push(`/purchases/${data.bill.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create bill");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><ShoppingCart className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Bill</SheetTitle>
              <SheetDescription>Record a purchase bill from a supplier.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            <div className="space-y-4">
              <SectionLabel>Bill Details</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Supplier *</Label>
                  <ContactPicker value={contactId} onChange={setContactId} type="supplier" />
                </div>
                <div className="space-y-2">
                  <Label>Reference</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bill reference" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Issue Date</Label>
                  <DatePicker value={issueDate} onChange={setIssueDate} placeholder="Issue date" />
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <DatePicker value={dueDate} onChange={setDueDate} placeholder="Due date" />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Line Items</SectionLabel>
              <LineItemsEditor lines={lines} onChange={setLines} accountTypeFilter={["expense"]} />
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Notes</SectionLabel>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." rows={3} />
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Bill" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Entry Drawer
// ---------------------------------------------------------------------------
interface Account {
  id: string;
  code: string;
  name: string;
}

function EntryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.accounts) setAccounts(data.accounts);
      });
  }, [open]);

  async function handleSubmit(data: {
    date: string;
    description: string;
    reference: string;
    lines: { accountId: string; description: string; debitAmount: number; creditAmount: number }[];
  }) {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          date: data.date,
          description: data.description,
          reference: data.reference || null,
          lines: data.lines.map((l) => ({
            accountId: l.accountId,
            description: l.description || null,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create entry");
      }
      const { entry } = await res.json();
      toast.success("Journal entry created");
      onClose();
      router.push(`/accounting/${entry.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create entry");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-3xl w-full p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><BookOpen className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Journal Entry</SheetTitle>
              <SheetDescription>Create a balanced double-entry journal entry.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <EntryForm
            accounts={accounts}
            onSubmit={handleSubmit}
            loading={loading}
            onCancel={onClose}
            submitLabel="Create Entry"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Inventory Drawer
// ---------------------------------------------------------------------------
function InventoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          code: form.get("code"),
          name: form.get("name"),
          description: form.get("description") || null,
          sku: form.get("sku") || null,
          purchasePrice: Math.round(parseFloat(form.get("purchasePrice") as string || "0") * 100),
          salePrice: Math.round(parseFloat(form.get("salePrice") as string || "0") * 100),
          quantityOnHand: parseInt(form.get("quantityOnHand") as string) || 0,
          reorderPoint: parseInt(form.get("reorderPoint") as string) || 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create item");
      }
      const data = await res.json();
      toast.success("Inventory item created");
      onClose();
      router.push(`/inventory/${data.inventoryItem.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Package className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Inventory Item</SheetTitle>
              <SheetDescription>Add a product or item to track stock.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            <div className="space-y-4">
              <SectionLabel>Item Info</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="drawer-inv-code">Code *</Label>
                  <Input id="drawer-inv-code" name="code" required placeholder="ITEM-001" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="drawer-inv-name">Name *</Label>
                  <Input id="drawer-inv-name" name="name" required placeholder="Item name" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="drawer-inv-sku">SKU</Label>
                <Input id="drawer-inv-sku" name="sku" placeholder="Stock keeping unit" />
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Pricing</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="drawer-inv-purchase">Purchase Price</Label>
                  <Input id="drawer-inv-purchase" name="purchasePrice" type="number" step="0.01" min={0} defaultValue="0.00" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="drawer-inv-sale">Sale Price</Label>
                  <Input id="drawer-inv-sale" name="salePrice" type="number" step="0.01" min={0} defaultValue="0.00" placeholder="0.00" />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Stock</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="drawer-inv-qty">Initial Quantity</Label>
                  <Input id="drawer-inv-qty" name="quantityOnHand" type="number" min={0} defaultValue={0} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="drawer-inv-reorder">Reorder Point</Label>
                  <Input id="drawer-inv-reorder" name="reorderPoint" type="number" min={0} defaultValue={0} />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Description</SectionLabel>
              <Textarea name="description" placeholder="Item description..." rows={3} />
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Item" />
        </form>
      </SheetContent>
    </Sheet>
  );
}
