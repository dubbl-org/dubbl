"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useApi, useApiCache } from "@/lib/query/use-api";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { LineItemsEditor, type LineItem } from "@/components/dashboard/line-items-editor";

interface RecurringTemplate {
  id: string;
  name: string;
  frequency: string;
  status: string;
  nextRunDate: string | null;
  reference: string | null;
  contact: { name: string } | null;
}

/** GET /api/v1/recurring/:id (unitPrice in cents, quantity x100). */
interface TemplateDetail extends RecurringTemplate {
  contactId: string;
  endDate: string | null;
  maxOccurrences: number | null;
  lines: {
    description: string;
    quantity: number;
    unitPrice: number;
    accountId: string | null;
    taxRateId: string | null;
    discountPercent: number;
  }[];
}

const statusColors: Record<string, string> = {
  active:
    "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300",
  paused:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  completed:
    "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Finished",
};

const frequencyLabels: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-Annual",
  annual: "Annual",
};

const emptyLine = (): LineItem => ({
  description: "",
  quantity: "1",
  unitPrice: "",
  accountId: "",
  taxRateId: "",
});

export default function RecurringBillsPage() {
  const { data, loading } = useApi<{ data?: RecurringTemplate[] }>("/api/v1/recurring?type=bill");
  const templates = data?.data || [];
  const cache = useApiCache();
  const refresh = () => cache.invalidate("/api/v1/recurring");
  const { confirm, dialog: confirmDialog } = useConfirm();

  useDocumentTitle("Purchases · Recurring Bills");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Set while editing an existing recurring bill; null when creating one.
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [contactId, setContactId] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxOccurrences, setMaxOccurrences] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  const orgHeaders = useCallback(
    () => ({
      "x-organization-id": localStorage.getItem("activeOrgId") || "",
    }),
    []
  );

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setContactId("");
    setFrequency("monthly");
    setStartDate("");
    setEndDate("");
    setMaxOccurrences("");
    setReference("");
    setLines([emptyLine()]);
  };

  const handleSubmit = async () => {
    if (!name || !contactId || !startDate || lines.length === 0) return;

    const validLines = lines.filter((l) => l.description && l.unitPrice);
    if (validLines.length === 0) {
      toast.error("Add at least one line with a description and price");
      return;
    }

    const shared = {
      name,
      contactId,
      frequency,
      endDate: endDate || null,
      maxOccurrences: maxOccurrences ? parseInt(maxOccurrences, 10) : null,
      reference: reference || null,
      lines: validLines.map((l) => ({
        description: l.description,
        quantity: parseFloat(l.quantity) || 1,
        unitPrice: parseFloat(l.unitPrice) || 0,
        accountId: l.accountId || null,
        taxRateId: l.taxRateId || null,
      })),
    };

    setSubmitting(true);
    try {
      // On edit the date field is the next bill date; on create it's the start.
      const res = await fetch(editingId ? `/api/v1/recurring/${editingId}` : "/api/v1/recurring", {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...orgHeaders(),
        },
        body: JSON.stringify(
          editingId ? { ...shared, nextRunDate: startDate } : { ...shared, type: "bill", startDate }
        ),
      });

      if (res.ok) {
        toast.success(editingId ? "Recurring bill updated" : "Recurring bill created");
        setDrawerOpen(false);
        resetForm();
        refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(typeof err.error === "string" ? err.error : "Couldn't save the recurring bill");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openCreate = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const openEdit = async (id: string) => {
    const res = await fetch(`/api/v1/recurring/${id}`, { headers: orgHeaders() });
    if (!res.ok) {
      toast.error("Couldn't load this recurring bill");
      return;
    }
    const { template: t } = (await res.json()) as { template: TemplateDetail };
    setEditingId(t.id);
    setName(t.name);
    setContactId(t.contactId);
    setFrequency(t.frequency);
    setStartDate(t.nextRunDate || "");
    setEndDate(t.endDate || "");
    setMaxOccurrences(t.maxOccurrences ? String(t.maxOccurrences) : "");
    setReference(t.reference || "");
    setLines(
      t.lines.length
        ? t.lines.map((l) => ({
            description: l.description,
            quantity: String(l.quantity / 100),
            unitPrice: (l.unitPrice / 100).toFixed(2),
            accountId: l.accountId || "",
            taxRateId: l.taxRateId || "",
          }))
        : [emptyLine()]
    );
    setDrawerOpen(true);
  };

  const togglePause = async (t: RecurringTemplate) => {
    const res = await fetch(`/api/v1/recurring/${t.id}/pause`, { method: "POST", headers: orgHeaders() });
    if (res.ok) {
      toast.success(t.status === "active" ? `${t.name} paused` : `${t.name} resumed`);
      refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(typeof err.error === "string" ? err.error : "Couldn't change the status");
    }
  };

  const remove = async (t: RecurringTemplate) => {
    const ok = await confirm({
      title: `Delete ${t.name}?`,
      description: "No more bills will be created from it. Bills it already created stay as they are.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/v1/recurring/${t.id}`, { method: "DELETE", headers: orgHeaders() });
    if (res.ok) {
      toast.success("Recurring bill deleted");
      refresh();
    } else {
      toast.error("Couldn't delete the recurring bill");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Recurring Bills
          </h1>
          <p className="text-sm text-muted-foreground">
            Set up supplier bills that get created automatically on a schedule,
            so you never have to re-key the same monthly bill.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-brand-600 hover:bg-brand-700"
        >
          <Plus className="mr-2 size-4" />
          New Recurring Bill
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Next Bill</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-8 text-sm text-muted-foreground"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : templates.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-8 text-sm text-muted-foreground"
                >
                  No recurring bills yet. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              templates.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => openEdit(t.id)}>
                  <TableCell className="text-sm font-medium">
                    {t.name}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.contact?.name || "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {frequencyLabels[t.frequency] || t.frequency}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.nextRunDate || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusColors[t.status] || ""}
                    >
                      {statusLabels[t.status] || t.status}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="size-8" title="Edit" onClick={() => openEdit(t.id)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      {t.status !== "completed" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title={t.status === "active" ? "Pause" : "Resume"}
                          onClick={() => togglePause(t)}
                        >
                          {t.status === "active" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-red-600" title="Delete" onClick={() => remove(t)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={drawerOpen} onOpenChange={(o) => { setDrawerOpen(o); if (!o) resetForm(); }}>
        <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col overflow-y-auto">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b">
            <SheetTitle>{editingId ? "Edit Recurring Bill" : "New Recurring Bill"}</SheetTitle>
          </SheetHeader>

          <div className="px-4 pb-6 pt-4 sm:px-6 space-y-4 flex-1 overflow-y-auto">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="e.g. Monthly Software Subscription"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Supplier</label>
              <ContactPicker
                value={contactId}
                onChange={setContactId}
                type="supplier"
                placeholder="Select supplier..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reference</label>
              <Input
                placeholder="Optional bill reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Frequency</label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">{editingId ? "Next Bill Date" : "Start Date"}</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Max Occurrences</label>
              <Input
                type="number"
                min="1"
                placeholder="Unlimited"
                value={maxOccurrences}
                onChange={(e) => setMaxOccurrences(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Line Items</label>
              <LineItemsEditor lines={lines} onChange={setLines} accountTypeFilter={["expense"]} taxContext="purchase" />
            </div>

            <Button
              className="w-full bg-brand-600 hover:bg-brand-700"
              onClick={handleSubmit}
              disabled={submitting || !name || !contactId || !startDate}
            >
              {submitting ? "Saving..." : editingId ? "Save Changes" : "Create Recurring Bill"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </div>
  );
}
