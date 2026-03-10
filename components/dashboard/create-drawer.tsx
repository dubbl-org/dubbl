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
  Receipt,
  Building2,
  Target,
  Trash2,
  Plus,
  CreditCard,
  RefreshCw,
  Landmark,
  Warehouse,
  ClipboardList,
  Tag,
  ArrowLeftRight,
  Briefcase,
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
import { AccountPicker } from "@/components/dashboard/account-picker";
import { FileUploader } from "@/components/dashboard/file-uploader";
import { CurrencySelect } from "@/components/ui/currency-select";
import { InventoryItemPicker } from "@/components/dashboard/inventory-item-picker";
import { WarehousePicker } from "@/components/dashboard/warehouse-picker";
import { CategoryPicker } from "@/components/dashboard/category-picker";
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatMoney, decimalToCents } from "@/lib/money";

type DrawerType = "contact" | "project" | "invoice" | "bill" | "entry" | "inventory" | "quote" | "purchaseOrder" | "expense" | "fixedAsset" | "budget" | "employee" | "creditNote" | "recurring" | "account" | "bankAccount" | "warehouse" | "stockTake" | "category" | "transfer" | "contractor";

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
      <QuoteDrawer open={activeType === "quote"} onClose={close} />
      <PurchaseOrderDrawer open={activeType === "purchaseOrder"} onClose={close} />
      <ExpenseDrawer open={activeType === "expense"} onClose={close} />
      <FixedAssetDrawer open={activeType === "fixedAsset"} onClose={close} />
      <BudgetDrawer open={activeType === "budget"} onClose={close} />
      <EmployeeDrawer open={activeType === "employee"} onClose={close} />
      <CreditNoteDrawer open={activeType === "creditNote"} onClose={close} />
      <RecurringDrawer open={activeType === "recurring"} onClose={close} />
      <AccountDrawer open={activeType === "account"} onClose={close} />
      <BankAccountDrawer open={activeType === "bankAccount"} onClose={close} />
      <WarehouseDrawer open={activeType === "warehouse"} onClose={close} />
      <StockTakeDrawer open={activeType === "stockTake"} onClose={close} />
      <CategoryDrawer open={activeType === "category"} onClose={close} />
      <TransferDrawer open={activeType === "transfer"} onClose={close} />
      <ContractorDrawer open={activeType === "contractor"} onClose={close} />
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
    <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-4 py-3 sm:px-6 sm:py-4 backdrop-blur-sm">
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
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Users className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Contact</SheetTitle>
              <SheetDescription>Add a customer or supplier to your organization.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
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

  const PROJECT_COLORS = [
    "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444",
    "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  ];

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
      const tagsRaw = (form.get("tags") as string || "").trim();
      const tags = tagsRaw ? tagsRaw.split(",").map((t: string) => t.trim()).filter(Boolean) : [];

      const res = await fetch("/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description") || null,
          contactId: contactId || null,
          status: form.get("status") || "active",
          priority: form.get("priority") || "medium",
          billingType: form.get("billingType") || "hourly",
          color: form.get("color") || "#10b981",
          budget: Math.round(parseFloat(form.get("budget") as string || "0") * 100),
          hourlyRate: Math.round(parseFloat(form.get("hourlyRate") as string || "0") * 100),
          fixedPrice: Math.round(parseFloat(form.get("fixedPrice") as string || "0") * 100),
          estimatedHours: Math.round(parseFloat(form.get("estimatedHours") as string || "0") * 60),
          category: form.get("category") || null,
          tags,
          startDate: startDate || null,
          endDate: endDate || null,
          enableTasks: true,
          enableTimeTracking: true,
          enableMilestones: false,
          enableNotes: true,
          enableBilling: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create project");
      }
      const data = await res.json();
      toast.success("Project created");
      window.dispatchEvent(new Event("projects-changed"));
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
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><FolderKanban className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Project</SheetTitle>
              <SheetDescription>Create a project to track tasks, time, and billing.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
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
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select name="priority" defaultValue="medium">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input name="category" placeholder="e.g. Development" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2">
                  {PROJECT_COLORS.map(c => (
                    <label key={c} className="cursor-pointer">
                      <input type="radio" name="color" value={c} defaultChecked={c === "#10b981"} className="sr-only peer" />
                      <div className="size-6 rounded-full ring-2 ring-transparent peer-checked:ring-offset-2 peer-checked:ring-gray-400 transition-all" style={{ backgroundColor: c }} />
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tags</Label>
                <Input name="tags" placeholder="Comma separated tags" />
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Financials</SectionLabel>
              <div className="space-y-2">
                <Label>Billing Type</Label>
                <Select name="billingType" defaultValue="hourly">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="fixed">Fixed Price</SelectItem>
                    <SelectItem value="milestone">Milestone</SelectItem>
                    <SelectItem value="non_billable">Non-Billable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fixed Price</Label>
                  <Input name="fixedPrice" type="number" step="0.01" min={0} defaultValue="0.00" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label>Estimated Hours</Label>
                  <Input name="estimatedHours" type="number" step="0.5" min={0} placeholder="0" />
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
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><FileText className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Invoice</SheetTitle>
              <SheetDescription>Create a sales invoice for your customer.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
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
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><ShoppingCart className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Bill</SheetTitle>
              <SheetDescription>Record a purchase bill from a supplier.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
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
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><BookOpen className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Journal Entry</SheetTitle>
              <SheetDescription>Create a balanced double-entry journal entry.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
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
  const [categoryId, setCategoryId] = useState("");

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
          categoryId: categoryId || null,
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
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Package className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Inventory Item</SheetTitle>
              <SheetDescription>Add a product or item to track stock.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <CategoryPicker value={categoryId} onChange={setCategoryId} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="drawer-inv-sku">SKU</Label>
                  <Input id="drawer-inv-sku" name="sku" placeholder="Stock keeping unit" />
                </div>
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

// ---------------------------------------------------------------------------
// Quote Drawer
// ---------------------------------------------------------------------------
function QuoteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [expiryDate, setExpiryDate] = useState(() => {
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
      setExpiryDate(d.toISOString().split("T")[0]);
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
      const res = await fetch("/api/v1/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          contactId, issueDate, expiryDate,
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
        throw new Error(data.error || "Failed to create quote");
      }
      const data = await res.json();
      toast.success("Quote created");
      onClose();
      router.push(`/sales/quotes/${data.quote.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create quote");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><FileText className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Quote</SheetTitle>
              <SheetDescription>Create a sales quote for your customer.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Quote Details</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Customer *</Label>
                  <ContactPicker value={contactId} onChange={setContactId} type="customer" />
                </div>
                <div className="space-y-2">
                  <Label>Reference</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Quote reference" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Issue Date</Label>
                  <DatePicker value={issueDate} onChange={setIssueDate} placeholder="Issue date" />
                </div>
                <div className="space-y-2">
                  <Label>Expiry Date</Label>
                  <DatePicker value={expiryDate} onChange={setExpiryDate} placeholder="Expiry date" />
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
          <DrawerFooter onClose={onClose} saving={saving} label="Create Quote" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Purchase Order Drawer
// ---------------------------------------------------------------------------
function PurchaseOrderDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([
    { description: "", quantity: "1", unitPrice: "", accountId: "", taxRateId: "" },
  ]);

  useEffect(() => {
    if (!open) {
      setContactId(""); setReference(""); setNotes(""); setDeliveryDate("");
      setIssueDate(new Date().toISOString().split("T")[0]);
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
      const res = await fetch("/api/v1/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          contactId, issueDate,
          deliveryDate: deliveryDate || null,
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
        throw new Error(data.error || "Failed to create purchase order");
      }
      const data = await res.json();
      toast.success("Purchase order created");
      onClose();
      router.push(`/purchases/orders/${data.purchaseOrder.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create purchase order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Receipt className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Purchase Order</SheetTitle>
              <SheetDescription>Create a purchase order for your supplier.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Order Details</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Supplier *</Label>
                  <ContactPicker value={contactId} onChange={setContactId} type="supplier" />
                </div>
                <div className="space-y-2">
                  <Label>Reference</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO reference" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Issue Date</Label>
                  <DatePicker value={issueDate} onChange={setIssueDate} placeholder="Issue date" />
                </div>
                <div className="space-y-2">
                  <Label>Delivery Date</Label>
                  <DatePicker value={deliveryDate} onChange={setDeliveryDate} placeholder="Expected delivery" />
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
          <DrawerFooter onClose={onClose} saving={saving} label="Create PO" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Expense Drawer
// ---------------------------------------------------------------------------
interface ExpenseItemForm {
  date: string;
  description: string;
  amount: string;
  category: string;
  accountId: string;
  receiptFileKey: string;
  receiptFileName: string;
}

const emptyExpenseItem = (): ExpenseItemForm => ({
  date: new Date().toISOString().split("T")[0],
  description: "",
  amount: "",
  category: "",
  accountId: "",
  receiptFileKey: "",
  receiptFileName: "",
});

function ExpenseDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<ExpenseItemForm[]>([emptyExpenseItem()]);

  useEffect(() => {
    if (!open) {
      setTitle(""); setDescription("");
      setItems([emptyExpenseItem()]);
    }
  }, [open]);

  function updateItem(index: number, updates: Partial<ExpenseItemForm>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  }

  const total = items.reduce((sum, item) => sum + decimalToCents(parseFloat(item.amount) || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error("Please enter a title"); return; }
    if (items.some((item) => !item.description.trim() || !item.amount)) {
      toast.error("Please fill in all item descriptions and amounts"); return;
    }
    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          title,
          description: description || null,
          items: items.map((item) => ({
            date: item.date,
            description: item.description,
            amount: parseFloat(item.amount) || 0,
            category: item.category || null,
            accountId: item.accountId || null,
            receiptFileKey: item.receiptFileKey || null,
            receiptFileName: item.receiptFileName || null,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create expense claim");
      }
      const data = await res.json();
      toast.success("Expense claim created");
      onClose();
      router.push(`/purchases/expenses/${data.expenseClaim.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create expense claim");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-3xl w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Receipt className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Expense Claim</SheetTitle>
              <SheetDescription>Submit expenses for reimbursement.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Claim Info</SectionLabel>
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Business trip to NYC" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description" />
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <SectionLabel>Expense Items</SectionLabel>
                <Button type="button" variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, emptyExpenseItem()])}>
                  <Plus className="mr-2 size-3.5" />Add Item
                </Button>
              </div>
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Item {index + 1}</span>
                      {items.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))} className="text-red-600 hover:text-red-700">
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-2">
                        <Label>Date</Label>
                        <DatePicker value={item.date} onChange={(val) => updateItem(index, { date: val })} placeholder="Expense date" />
                      </div>
                      <div className="space-y-2">
                        <Label>Description *</Label>
                        <Input value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="What was this for?" />
                      </div>
                      <div className="space-y-2">
                        <Label>Amount *</Label>
                        <Input type="number" step="0.01" min="0" value={item.amount} onChange={(e) => updateItem(index, { amount: e.target.value })} placeholder="0.00" />
                      </div>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Input value={item.category} onChange={(e) => updateItem(index, { category: e.target.value })} placeholder="e.g. Travel" />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Account</Label>
                        <AccountPicker value={item.accountId} onChange={(val) => updateItem(index, { accountId: val })} typeFilter={["expense"]} />
                      </div>
                      <div className="space-y-2">
                        <Label>Receipt</Label>
                        <FileUploader accept="image/*,.pdf" onUpload={(fileKey, fileName) => updateItem(index, { receiptFileKey: fileKey, receiptFileName: fileName })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3">
              <span className="text-sm font-medium">Total</span>
              <span className="text-lg font-bold font-mono tabular-nums">{formatMoney(total)}</span>
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Expense Claim" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Fixed Asset Drawer
// ---------------------------------------------------------------------------
interface FixedAssetAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

function FixedAssetDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<FixedAssetAccount[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assetNumber, setAssetNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [residualValue, setResidualValue] = useState("");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState("60");
  const [depreciationMethod, setDepreciationMethod] = useState("straight_line");
  const [assetAccountId, setAssetAccountId] = useState("");
  const [depreciationAccountId, setDepreciationAccountId] = useState("");
  const [accumulatedDepAccountId, setAccumulatedDepAccountId] = useState("");

  useEffect(() => {
    if (!open) {
      setName(""); setDescription(""); setAssetNumber("");
      setPurchaseDate(new Date().toISOString().split("T")[0]);
      setPurchasePrice(""); setResidualValue(""); setUsefulLifeMonths("60");
      setDepreciationMethod("straight_line");
      setAssetAccountId(""); setDepreciationAccountId(""); setAccumulatedDepAccountId("");
      return;
    }
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/accounts", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => { if (data.accounts) setAccounts(data.accounts); });
  }, [open]);

  const assetAccounts = accounts.filter((a) => a.type === "asset");
  const expenseAccounts = accounts.filter((a) => a.type === "expense");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !assetNumber || !purchasePrice) { toast.error("Please fill in required fields"); return; }
    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/fixed-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name,
          description: description || null,
          assetNumber,
          purchaseDate,
          purchasePrice: Math.round(parseFloat(purchasePrice) * 100),
          residualValue: residualValue ? Math.round(parseFloat(residualValue) * 100) : 0,
          usefulLifeMonths: parseInt(usefulLifeMonths) || 60,
          depreciationMethod,
          assetAccountId: assetAccountId || null,
          depreciationAccountId: depreciationAccountId || null,
          accumulatedDepAccountId: accumulatedDepAccountId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create asset");
      }
      const data = await res.json();
      toast.success("Fixed asset created");
      onClose();
      router.push(`/accounting/fixed-assets/${data.asset.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create asset");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Building2 className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Fixed Asset</SheetTitle>
              <SheetDescription>Add a capital asset to track depreciation.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Asset Info</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Asset Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Office Equipment" />
                </div>
                <div className="space-y-2">
                  <Label>Asset Number *</Label>
                  <Input value={assetNumber} onChange={(e) => setAssetNumber(e.target.value)} placeholder="FA-001" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description of the asset..." rows={2} />
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Purchase</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Purchase Date *</Label>
                  <DatePicker value={purchaseDate} onChange={setPurchaseDate} placeholder="Purchase date" />
                </div>
                <div className="space-y-2">
                  <Label>Purchase Price *</Label>
                  <Input type="number" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="10000.00" />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Depreciation</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Residual Value</Label>
                  <Input type="number" step="0.01" value={residualValue} onChange={(e) => setResidualValue(e.target.value)} placeholder="500.00" />
                </div>
                <div className="space-y-2">
                  <Label>Useful Life (months)</Label>
                  <Input type="number" value={usefulLifeMonths} onChange={(e) => setUsefulLifeMonths(e.target.value)} placeholder="60" />
                </div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select value={depreciationMethod} onValueChange={setDepreciationMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="straight_line">Straight Line</SelectItem>
                      <SelectItem value="declining_balance">Declining Balance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Accounts</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Asset Account</Label>
                  <Select value={assetAccountId} onValueChange={setAssetAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {assetAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Depreciation Expense</Label>
                  <Select value={depreciationAccountId} onValueChange={setDepreciationAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {expenseAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Accumulated Dep.</Label>
                  <Select value={accumulatedDepAccountId} onValueChange={setAccumulatedDepAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {assetAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Asset" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Budget Drawer
// ---------------------------------------------------------------------------
import { generatePeriods, distributeAmount } from "@/lib/budget-periods";
import type { PeriodType } from "@/lib/budget-periods";

interface BudgetPeriodInput {
  label: string;
  startDate: string;
  endDate: string;
  amount: number;
  sortOrder: number;
}

interface BudgetLineInput {
  accountId: string;
  total: number;
  periods: BudgetPeriodInput[];
}

const PERIOD_TYPE_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

function emptyBudgetLine(periodType: PeriodType, startDate: string, endDate: string): BudgetLineInput {
  const periods = generatePeriods(periodType, startDate, endDate).map((p) => ({ ...p, amount: 0 }));
  return { accountId: "", total: 0, periods };
}

interface BudgetAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

function BudgetDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [budgetName, setBudgetName] = useState("");
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [budgetLines, setBudgetLines] = useState<BudgetLineInput[]>([emptyBudgetLine("monthly", `${new Date().getFullYear()}-01-01`, `${new Date().getFullYear()}-12-31`)]);
  const [annualAmounts, setAnnualAmounts] = useState<Record<number, string>>({});
  const [budgetAccounts, setBudgetAccounts] = useState<BudgetAccount[]>([]);
  const [expandedLine, setExpandedLine] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      const yr = new Date().getFullYear();
      setBudgetName(""); setPeriodType("monthly");
      setBudgetLines([emptyBudgetLine("monthly", `${yr}-01-01`, `${yr}-12-31`)]);
      setAnnualAmounts({}); setExpandedLine(null);
      setStartDate(`${yr}-01-01`);
      setEndDate(`${yr}-12-31`);
      return;
    }
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/accounts?limit=500", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => { if (data.accounts) setBudgetAccounts(data.accounts); else if (data.data) setBudgetAccounts(data.data); });
  }, [open]);

  function regenerateAllPeriods(newType: PeriodType, newStart: string, newEnd: string) {
    setBudgetLines((prev) =>
      prev.map((line) => {
        const newPeriods = generatePeriods(newType, newStart, newEnd).map((p) => ({ ...p, amount: 0 }));
        const amounts = distributeAmount(line.total, newPeriods.length);
        return {
          ...line,
          periods: newPeriods.map((p, i) => ({ ...p, amount: amounts[i] })),
        };
      })
    );
  }

  function handlePeriodTypeChange(newType: PeriodType) {
    setPeriodType(newType);
    regenerateAllPeriods(newType, startDate, endDate);
  }

  function handleStartDateChange(v: string) {
    setStartDate(v);
    regenerateAllPeriods(periodType, v, endDate);
  }

  function handleEndDateChange(v: string) {
    setEndDate(v);
    regenerateAllPeriods(periodType, startDate, v);
  }

  function handleAnnualChange(index: number, value: string) {
    setAnnualAmounts((prev) => ({ ...prev, [index]: value }));
    const cents = Math.round(parseFloat(value || "0") * 100);
    if (cents >= 0) {
      setBudgetLines((prev) => {
        const copy = [...prev];
        const line = copy[index];
        const amounts = distributeAmount(cents, line.periods.length);
        copy[index] = {
          ...line,
          total: cents,
          periods: line.periods.map((p, i) => ({ ...p, amount: amounts[i] })),
        };
        return copy;
      });
    }
  }

  function updatePeriodAmount(lineIndex: number, periodIndex: number, value: string) {
    const cents = Math.round(parseFloat(value || "0") * 100);
    setBudgetLines((prev) => {
      const copy = [...prev];
      const line = { ...copy[lineIndex] };
      const periods = [...line.periods];
      periods[periodIndex] = { ...periods[periodIndex], amount: cents };
      line.periods = periods;
      line.total = periods.reduce((s, p) => s + p.amount, 0);
      copy[lineIndex] = line;
      return copy;
    });
    setAnnualAmounts((prev) => {
      const copy = { ...prev };
      delete copy[lineIndex];
      return copy;
    });
  }

  function removeLine(index: number) {
    setBudgetLines((prev) => prev.filter((_, i) => i !== index));
    setAnnualAmounts((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    if (expandedLine === index) setExpandedLine(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validLines = budgetLines.filter((l) => l.accountId);
    if (validLines.length === 0) { toast.error("Add at least one budget line with an account"); return; }
    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: budgetName,
          startDate,
          endDate,
          periodType,
          lines: validLines.map((l) => ({
            accountId: l.accountId,
            total: l.total,
            periods: l.periods,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create budget");
      }
      toast.success("Budget created");
      onClose();
      window.dispatchEvent(new Event("budgets-changed"));
      router.push("/accounting/budgets");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create budget");
    } finally {
      setSaving(false);
    }
  }

  const grandTotal = budgetLines.reduce((s, l) => s + l.total, 0);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Target className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Budget</SheetTitle>
              <SheetDescription>Plan spending by account with flexible period types.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Budget Info</SectionLabel>
              <div className="space-y-2">
                <Label>Budget Name *</Label>
                <Input value={budgetName} onChange={(e) => setBudgetName(e.target.value)} placeholder="FY 2026 Operating Budget" required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <DatePicker value={startDate} onChange={handleStartDateChange} placeholder="Start date" />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <DatePicker value={endDate} onChange={handleEndDateChange} placeholder="End date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Period Type</Label>
                <Select value={periodType} onValueChange={(v) => handlePeriodTypeChange(v as PeriodType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIOD_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <SectionLabel>Budget Lines</SectionLabel>
                <Button type="button" variant="outline" size="sm" onClick={() => setBudgetLines((prev) => [...prev, emptyBudgetLine(periodType, startDate, endDate)])}>
                  <Plus className="mr-2 size-3.5" />Add Line
                </Button>
              </div>

              {budgetLines.map((line, i) => {
                const isExpanded = expandedLine === i;
                return (
                  <div key={i} className="space-y-2.5">
                    {/* Account + remove */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <Select
                          value={line.accountId || undefined}
                          onValueChange={(val) => {
                            setBudgetLines((prev) => {
                              const copy = [...prev];
                              copy[i] = { ...copy[i], accountId: val };
                              return copy;
                            });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
                          <SelectContent>
                            {budgetAccounts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-red-600 shrink-0 p-1">
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {/* Annual amount + per-period info */}
                    <div className="flex items-center gap-3">
                      <Label className="text-xs text-muted-foreground shrink-0 w-16">Annual</Label>
                      <CurrencyInput
                        prefix="$"
                        value={annualAmounts[i] ?? (line.total > 0 ? (line.total / 100).toFixed(2) : "")}
                        onChange={(v) => handleAnnualChange(i, v)}
                        placeholder="0.00"
                        className="flex-1"
                      />
                      {line.total > 0 && line.periods.length > 0 && (
                        <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                          {formatMoney(Math.floor(line.total / line.periods.length))}/period
                        </span>
                      )}
                    </div>

                    {/* Customize periods toggle */}
                    {line.total > 0 && line.periods.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedLine(isExpanded ? null : i)}
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                      >
                        {isExpanded ? "Hide period breakdown" : `Customize period amounts (${line.periods.length} periods)`}
                      </button>
                    )}

                    {/* Period grid */}
                    {isExpanded && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {line.periods.map((p, pi) => (
                          <div key={pi} className="space-y-1">
                            <label className="text-[10px] text-muted-foreground pl-0.5">{p.label}</label>
                            <CurrencyInput
                              size="sm"
                              value={(p.amount / 100).toFixed(2)}
                              onChange={(v) => updatePeriodAmount(i, pi, v)}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {i < budgetLines.length - 1 && <div className="h-px bg-border" />}
                  </div>
                );
              })}

              {budgetLines.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No lines yet. Add one to start planning.</p>
              )}
            </div>
          </div>

          {grandTotal > 0 && (
            <div className="flex items-center justify-between border-t px-4 py-2.5 sm:px-6 text-sm">
              <span className="text-muted-foreground">Total budget</span>
              <span className="font-mono font-semibold tabular-nums">{formatMoney(grandTotal)}</span>
            </div>
          )}
          <DrawerFooter onClose={onClose} saving={saving} label="Create Budget" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Employee Drawer
// ---------------------------------------------------------------------------
function EmployeeDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [empName, setEmpName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [position, setPosition] = useState("");
  const [salary, setSalary] = useState("");
  const [payFrequency, setPayFrequency] = useState("monthly");
  const [taxRate, setTaxRate] = useState("20");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [empStartDate, setEmpStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [empCurrency, setEmpCurrency] = useState("USD");

  useEffect(() => {
    if (!open) {
      setEmpName(""); setEmail(""); setEmployeeNumber(""); setPosition("");
      setSalary(""); setPayFrequency("monthly"); setTaxRate("20");
      setBankAccountNumber(""); setEmpStartDate(new Date().toISOString().split("T")[0]);
      setEmpCurrency("USD");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!empName || !employeeNumber || !salary) { toast.error("Please fill in required fields"); return; }
    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/payroll/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: empName,
          email: email || null,
          employeeNumber,
          position: position || null,
          salary: Math.round(parseFloat(salary) * 100),
          payFrequency,
          taxRate: Math.round(parseFloat(taxRate) * 100),
          bankAccountNumber: bankAccountNumber || null,
          startDate: empStartDate,
          currency: empCurrency,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add employee");
      }
      const data = await res.json();
      toast.success("Employee added");
      onClose();
      router.push(`/payroll/employees/${data.employee.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add employee");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Users className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Employee</SheetTitle>
              <SheetDescription>Add an employee to the payroll.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Personal Info</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input value={empName} onChange={(e) => setEmpName(e.target.value)} placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label>Employee Number *</Label>
                  <Input value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} placeholder="EMP-001" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Software Engineer" />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Compensation</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Annual Salary *</Label>
                  <Input type="number" step="0.01" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="75000.00" />
                </div>
                <div className="space-y-2">
                  <Label>Pay Frequency</Label>
                  <Select value={payFrequency} onValueChange={setPayFrequency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Biweekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tax Rate (%)</Label>
                  <Input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="20.00" />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <CurrencySelect value={empCurrency} onValueChange={setEmpCurrency} />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Details</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Bank Account Number</Label>
                  <Input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="Account number" />
                </div>
                <div className="space-y-2">
                  <Label>Start Date *</Label>
                  <DatePicker value={empStartDate} onChange={setEmpStartDate} placeholder="Start date" />
                </div>
              </div>
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Add Employee" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Credit Note Drawer
// ---------------------------------------------------------------------------
function CreditNoteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([
    { description: "", quantity: "1", unitPrice: "", accountId: "", taxRateId: "" },
  ]);

  useEffect(() => {
    if (!open) {
      setContactId(""); setReference(""); setNotes("");
      setIssueDate(new Date().toISOString().split("T")[0]);
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
      const res = await fetch("/api/v1/credit-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          contactId, issueDate,
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
        throw new Error(data.error || "Failed to create credit note");
      }
      const data = await res.json();
      toast.success("Credit note created");
      onClose();
      router.push(`/sales/credit-notes/${data.creditNote.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create credit note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><CreditCard className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Credit Note</SheetTitle>
              <SheetDescription>Issue a credit note to reduce a customer&apos;s balance.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Credit Note Details</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Customer *</Label>
                  <ContactPicker value={contactId} onChange={setContactId} type="customer" />
                </div>
                <div className="space-y-2">
                  <Label>Reference</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Original invoice, etc." />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Issue Date</Label>
                  <DatePicker value={issueDate} onChange={setIssueDate} placeholder="Issue date" />
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
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for credit..." rows={3} />
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Credit Note" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Recurring Template Drawer
// ---------------------------------------------------------------------------
function RecurringDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [contactId, setContactId] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([
    { description: "", quantity: "1", unitPrice: "", accountId: "", taxRateId: "" },
  ]);

  useEffect(() => {
    if (!open) {
      setName(""); setContactId(""); setFrequency("monthly"); setReference(""); setNotes(""); setEndDate("");
      setStartDate(new Date().toISOString().split("T")[0]);
      setLines([{ description: "", quantity: "1", unitPrice: "", accountId: "", taxRateId: "" }]);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactId) { toast.error("Please select a customer"); return; }
    if (!name.trim()) { toast.error("Please enter a template name"); return; }
    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name, type: "invoice", contactId, frequency, startDate,
          endDate: endDate || null,
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
        throw new Error(data.error || "Failed to create recurring template");
      }
      toast.success("Recurring template created");
      onClose();
      router.push("/sales/recurring");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><RefreshCw className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Recurring Invoice</SheetTitle>
              <SheetDescription>Set up a template to automatically generate invoices.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Template Details</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Template Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly Retainer" />
                </div>
                <div className="space-y-2">
                  <Label>Customer *</Label>
                  <ContactPicker value={contactId} onChange={setContactId} type="customer" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="fortnightly">Fortnightly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="semi_annual">Semi-Annual</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reference</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional reference" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <DatePicker value={startDate} onChange={setStartDate} placeholder="Start date" />
                </div>
                <div className="space-y-2">
                  <Label>End Date (optional)</Label>
                  <DatePicker value={endDate} onChange={setEndDate} placeholder="No end date" />
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
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for generated invoices..." rows={3} />
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Template" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Account Drawer
// ---------------------------------------------------------------------------
function AccountDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          code: form.get("code"),
          name: form.get("name"),
          type: form.get("type") || "asset",
          subType: form.get("subType") || null,
          description: form.get("description") || null,
          currencyCode: form.get("currencyCode") || "USD",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create account");
      }
      toast.success("Account created");
      onClose();
      window.dispatchEvent(new CustomEvent("accounts-changed"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><BookOpen className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Account</SheetTitle>
              <SheetDescription>Add an account to your chart of accounts.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Account Details</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="drawer-account-code">Code *</Label>
                  <Input id="drawer-account-code" name="code" required placeholder="1000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="drawer-account-name">Name *</Label>
                  <Input id="drawer-account-name" name="name" required placeholder="Cash" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select name="type" defaultValue="asset">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asset">Asset</SelectItem>
                      <SelectItem value="liability">Liability</SelectItem>
                      <SelectItem value="equity">Equity</SelectItem>
                      <SelectItem value="revenue">Revenue</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="drawer-account-currency">Currency</Label>
                  <Input id="drawer-account-currency" name="currencyCode" defaultValue="USD" placeholder="USD" maxLength={3} />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Optional</SectionLabel>
              <div className="space-y-2">
                <Label htmlFor="drawer-account-description">Description</Label>
                <Textarea id="drawer-account-description" name="description" placeholder="Account description..." rows={2} />
              </div>
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Account" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Bank Account Drawer
// ---------------------------------------------------------------------------
const BANK_ACCOUNT_COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

function BankAccountDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState("checking");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [countryCode, setCountryCode] = useState("");
  const [color, setColor] = useState(BANK_ACCOUNT_COLORS[0]);

  useEffect(() => {
    if (!open) {
      setAccountName(""); setBankName(""); setAccountNumber("");
      setAccountType("checking"); setCurrencyCode("USD"); setCountryCode("");
      setColor(BANK_ACCOUNT_COLORS[0]);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountName.trim()) { toast.error("Please enter an account name"); return; }
    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          accountName,
          accountNumber: accountNumber || null,
          bankName: bankName || null,
          currencyCode,
          countryCode: countryCode || null,
          accountType,
          color,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create bank account");
      }
      const data = await res.json();
      toast.success("Bank account created");
      onClose();
      window.dispatchEvent(new CustomEvent("bank-accounts-changed"));
      router.push(`/accounting/banking/${data.bankAccount.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create bank account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Landmark className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Bank Account</SheetTitle>
              <SheetDescription>Add an account to track transactions and import statements.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Account Details</SectionLabel>
              <div className="space-y-2">
                <Label>Account Name *</Label>
                <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Global Operating Account" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Revolut Business" />
                </div>
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <Select value={accountType} onValueChange={setAccountType}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checking">Checking</SelectItem>
                      <SelectItem value="savings">Savings</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="loan">Loan</SelectItem>
                      <SelectItem value="investment">Investment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Account Number / IBAN</Label>
                <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="1234 or GB29NWBK..." />
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Region & Currency</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Input value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())} placeholder="USD" maxLength={3} />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} placeholder="US" maxLength={2} />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Accent Color</SectionLabel>
              <div className="flex gap-2">
                {BANK_ACCOUNT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`size-6 rounded-full ring-2 ring-transparent transition-all ${color === c ? "ring-offset-2 ring-gray-400" : ""}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Account" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Warehouse Drawer
// ---------------------------------------------------------------------------
function WarehouseDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: form.get("name"),
          code: form.get("code"),
          address: form.get("address") || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create warehouse");
      }
      toast.success("Warehouse created");
      onClose();
      window.dispatchEvent(new CustomEvent("refetch-warehouses"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create warehouse");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Warehouse className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Warehouse</SheetTitle>
              <SheetDescription>Add a warehouse location for inventory tracking.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Warehouse Info</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="drawer-wh-name">Name *</Label>
                  <Input id="drawer-wh-name" name="name" required placeholder="Main Warehouse" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="drawer-wh-code">Code *</Label>
                  <Input id="drawer-wh-code" name="code" required placeholder="WH-001" />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Location</SectionLabel>
              <div className="space-y-2">
                <Label htmlFor="drawer-wh-address">Address</Label>
                <Textarea id="drawer-wh-address" name="address" placeholder="Street address, city, country..." rows={3} />
              </div>
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Warehouse" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Stock Take Drawer
// ---------------------------------------------------------------------------
function StockTakeDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/stock-takes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: form.get("name"),
          warehouseId: warehouseId || null,
          notes: form.get("notes") || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create stock take");
      }
      toast.success("Stock take created");
      onClose();
      window.dispatchEvent(new CustomEvent("refetch-stock-takes"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create stock take");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { onClose(); setWarehouseId(""); } }}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><ClipboardList className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Stock Take</SheetTitle>
              <SheetDescription>Create a physical inventory count to reconcile stock levels.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Details</SectionLabel>
              <div className="space-y-2">
                <Label htmlFor="drawer-st-name">Name *</Label>
                <Input id="drawer-st-name" name="name" required placeholder="e.g. Q1 2026 Full Count" />
              </div>
              <div className="space-y-1.5">
                <Label>Warehouse (optional)</Label>
                <WarehousePicker value={warehouseId} onChange={setWarehouseId} placeholder="All warehouses" />
                <p className="text-xs text-muted-foreground">Leave empty to count all items across all warehouses.</p>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Notes</SectionLabel>
              <Textarea name="notes" placeholder="Optional notes about this stock take..." rows={3} />
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Stock Take" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Category Drawer
// ---------------------------------------------------------------------------
const CATEGORY_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

function CategoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [color, setColor] = useState(CATEGORY_COLORS[0]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/inventory/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: form.get("name"),
          color: color || null,
          description: form.get("description") || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create category");
      }
      toast.success("Category created");
      onClose();
      window.dispatchEvent(new CustomEvent("refetch-categories"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Tag className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Category</SheetTitle>
              <SheetDescription>Organize inventory items with categories.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Category Info</SectionLabel>
              <div className="space-y-2">
                <Label htmlFor="drawer-cat-name">Name *</Label>
                <Input id="drawer-cat-name" name="name" required placeholder="e.g. Electronics" />
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Details</SectionLabel>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORY_COLORS.map((c) => (
                    <label key={c} className="cursor-pointer">
                      <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} className="sr-only peer" />
                      <div className="size-6 rounded-full ring-2 ring-transparent peer-checked:ring-offset-2 peer-checked:ring-gray-400 transition-all" style={{ backgroundColor: c }} />
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="drawer-cat-desc">Description</Label>
                <Textarea id="drawer-cat-desc" name="description" placeholder="Optional description..." rows={2} />
              </div>
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Category" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Transfer Drawer
// ---------------------------------------------------------------------------
function TransferDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<{ inventoryItemId: string; quantity: number }[]>([{ inventoryItemId: "", quantity: 1 }]);
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");

  function resetState() {
    setLines([{ inventoryItemId: "", quantity: 1 }]);
    setFromWarehouseId("");
    setToWarehouseId("");
  }

  function addLine() {
    setLines((prev) => [...prev, { inventoryItemId: "", quantity: 1 }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, field: "inventoryItemId" | "quantity", value: string | number) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    if (!fromWarehouseId || !toWarehouseId) {
      toast.error("Select both warehouses");
      setSaving(false);
      return;
    }

    const validLines = lines.filter((l) => l.inventoryItemId && l.quantity > 0);
    if (validLines.length === 0) {
      toast.error("Add at least one item");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/v1/inventory/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          fromWarehouseId,
          toWarehouseId,
          notes: (e.currentTarget.elements.namedItem("notes") as HTMLTextAreaElement)?.value || null,
          lines: validLines,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create transfer");
      }
      toast.success("Transfer created");
      onClose();
      resetState();
      window.dispatchEvent(new CustomEvent("refetch-transfers"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create transfer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { onClose(); resetState(); } }}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><ArrowLeftRight className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Transfer</SheetTitle>
              <SheetDescription>Move inventory between warehouses.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            {/* Warehouses */}
            <div className="space-y-3">
              <SectionLabel>Warehouses</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">From *</Label>
                  <WarehousePicker value={fromWarehouseId} onChange={setFromWarehouseId} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To *</Label>
                  <WarehousePicker value={toWarehouseId} onChange={setToWarehouseId} />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Line items */}
            <div className="space-y-3">
              <SectionLabel>Items</SectionLabel>
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <InventoryItemPicker
                        value={line.inventoryItemId}
                        onChange={(v) => updateLine(idx, "inventoryItemId", v)}
                      />
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, "quantity", parseInt(e.target.value) || 1)}
                      className="w-20 shrink-0"
                      placeholder="Qty"
                    />
                    {lines.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" onClick={() => removeLine(idx)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="text-xs" onClick={addLine}>
                <Plus className="size-3 mr-1.5" />Add Item
              </Button>
            </div>

            <div className="h-px bg-border" />

            {/* Notes */}
            <div className="space-y-3">
              <SectionLabel>Notes</SectionLabel>
              <Textarea name="notes" placeholder="Optional notes about this transfer..." rows={2} />
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Create Transfer" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ContractorDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cCompany, setCCompany] = useState("");
  const [cRate, setCRate] = useState("");
  const [cCurrency, setCCurrency] = useState("USD");

  useEffect(() => {
    if (!open) {
      setCName(""); setCEmail(""); setCCompany(""); setCRate(""); setCCurrency("USD");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cName) { toast.error("Name is required"); return; }
    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/payroll/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: cName,
          email: cEmail || null,
          company: cCompany || null,
          defaultRate: cRate ? Math.round(parseFloat(cRate) * 100) : null,
          currency: cCurrency,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add contractor");
      }
      const data = await res.json();
      toast.success("Contractor added");
      onClose();
      router.push(`/payroll/contractors/${data.contractor.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add contractor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Briefcase className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">New Contractor</SheetTitle>
              <SheetDescription>Add a contractor for payments.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Contractor Info</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Jane Smith" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="jane@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input value={cCompany} onChange={(e) => setCCompany(e.target.value)} placeholder="Acme LLC" />
                </div>
                <div className="space-y-2">
                  <Label>Default Rate ($)</Label>
                  <Input type="number" step="0.01" value={cRate} onChange={(e) => setCRate(e.target.value)} placeholder="150.00" />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <CurrencySelect value={cCurrency} onValueChange={setCCurrency} />
                </div>
              </div>
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Add Contractor" />
        </form>
      </SheetContent>
    </Sheet>
  );
}
