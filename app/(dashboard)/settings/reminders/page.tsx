"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Mail, Clock, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
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
  SheetDescription,
} from "@/components/ui/sheet";

interface ReminderRule {
  id: string;
  name: string;
  triggerType: "before_due" | "on_due" | "after_due";
  triggerDays: number;
  enabled: boolean;
  subjectTemplate: string;
  bodyTemplate: string;
  documentType: "invoice" | "bill";
  recipientType: "contact_email" | "contact_persons" | "custom";
  customEmails: string[] | null;
  createdAt: string;
}

interface ReminderLog {
  id: string;
  documentType: string;
  documentId: string;
  recipientEmail: string;
  subject: string;
  status: "sent" | "failed" | "skipped";
  errorMessage: string | null;
  sentAt: string;
  reminderRule: ReminderRule | null;
}

const TRIGGER_LABELS: Record<string, string> = {
  before_due: "Before due date",
  on_due: "On due date",
  after_due: "After due date",
};

const TEMPLATE_VARIABLES = [
  { label: "Contact Name", value: "{{contactName}}" },
  { label: "Document #", value: "{{documentNumber}}" },
  { label: "Amount Due", value: "{{amountDue}}" },
  { label: "Due Date", value: "{{dueDate}}" },
  { label: "Organization", value: "{{organizationName}}" },
  { label: "Days Overdue", value: "{{daysOverdue}}" },
];

const emptyForm: {
  name: string;
  triggerType: "before_due" | "on_due" | "after_due";
  triggerDays: number;
  enabled: boolean;
  subjectTemplate: string;
  bodyTemplate: string;
  documentType: "invoice" | "bill";
  recipientType: "contact_email" | "contact_persons" | "custom";
  customEmails: string;
} = {
  name: "",
  triggerType: "before_due",
  triggerDays: 3,
  enabled: false,
  subjectTemplate: "",
  bodyTemplate: "",
  documentType: "invoice",
  recipientType: "contact_email",
  customEmails: "",
};

export default function RemindersPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [logs, setLogs] = useState<ReminderLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [logStatus, setLogStatus] = useState<string>("");
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  useDocumentTitle("Settings · Reminders");

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/reminders", { headers: getHeaders() });
      const data = await res.json();
      setRules(data.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams({ page: String(logPage), limit: "10" });
    if (logStatus) params.set("status", logStatus);
    const res = await fetch(`/api/v1/reminders/logs?${params}`, {
      headers: getHeaders(),
    });
    const data = await res.json();
    setLogs(data.data || []);
    setLogTotal(data.total || 0);
  }, [logPage, logStatus]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setSheetOpen(true);
  }

  function openEdit(rule: ReminderRule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      triggerType: rule.triggerType,
      triggerDays: rule.triggerDays,
      enabled: rule.enabled,
      subjectTemplate: rule.subjectTemplate,
      bodyTemplate: rule.bodyTemplate,
      documentType: rule.documentType,
      recipientType: rule.recipientType,
      customEmails: rule.customEmails?.join(", ") || "",
    });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.subjectTemplate.trim() || !form.bodyTemplate.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        triggerType: form.triggerType,
        triggerDays: form.triggerDays,
        enabled: form.enabled,
        subjectTemplate: form.subjectTemplate,
        bodyTemplate: form.bodyTemplate,
        documentType: form.documentType,
        recipientType: form.recipientType,
        customEmails:
          form.recipientType === "custom" && form.customEmails.trim()
            ? form.customEmails.split(",").map((e) => e.trim()).filter(Boolean)
            : null,
      };

      if (editingId) {
        const res = await fetch(`/api/v1/reminders/${editingId}`, {
          method: "PUT",
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to update");
        toast.success("Reminder rule updated");
      } else {
        const res = await fetch("/api/v1/reminders", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to create");
        toast.success("Reminder rule created");
      }
      setSheetOpen(false);
      await fetchRules();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await confirm({
      title: "Delete reminder rule?",
      description: "This rule will be permanently removed.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await fetch(`/api/v1/reminders/${id}`, {
          method: "DELETE",
          headers: getHeaders(),
        });
        await fetchRules();
        toast.success("Reminder rule deleted");
      },
    });
  }

  async function handleToggle(rule: ReminderRule) {
    const res = await fetch(`/api/v1/reminders/${rule.id}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    if (res.ok) {
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
      );
    }
  }

  function insertVariable(variable: string, field: "subjectTemplate" | "bodyTemplate") {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field] + variable,
    }));
  }

  if (loading) return <BrandLoader />;

  const logTotalPages = Math.ceil(logTotal / 10);

  return (
    <ContentReveal>
      <div className="space-y-8">
        {/* Reminder Rules */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Payment Reminders</h2>
              <p className="text-sm text-muted-foreground">
                Configure automated dunning rules for overdue invoices and bills.
              </p>
            </div>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={openCreate}>
              <Plus className="size-3" /> New Rule
            </Button>
          </div>

          {rules.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center">
              <Mail className="size-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No reminder rules yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create your first rule to start sending automated payment reminders.
              </p>
              <Button size="sm" className="h-7 text-xs gap-1 mt-4" onClick={openCreate}>
                <Plus className="size-3" /> New Rule
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Trigger</TableHead>
                    <TableHead className="text-xs">Document</TableHead>
                    <TableHead className="text-xs">Enabled</TableHead>
                    <TableHead className="text-xs w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow
                      key={rule.id}
                      className="cursor-pointer"
                      onClick={() => openEdit(rule)}
                    >
                      <TableCell className="text-sm font-medium">{rule.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {TRIGGER_LABELS[rule.triggerType]}
                        {rule.triggerType !== "on_due" && (
                          <span> · {rule.triggerDays} day{rule.triggerDays !== 1 ? "s" : ""}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {rule.documentType}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={() => handleToggle(rule)}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-red-600"
                          onClick={() => handleDelete(rule.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Reminder Log */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Reminder Log</h2>
              <p className="text-sm text-muted-foreground">
                History of sent, failed, and skipped reminders.
              </p>
            </div>
            <Select value={logStatus} onValueChange={(v) => { setLogStatus(v === "all" ? "" : v); setLogPage(1); }}>
              <SelectTrigger className="h-7 w-[130px] text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-lg border bg-card p-6 text-center">
              <Clock className="size-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No reminder logs yet</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Rule</TableHead>
                      <TableHead className="text-xs">Recipient</TableHead>
                      <TableHead className="text-xs">Subject</TableHead>
                      <TableHead className="text-xs">Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          {log.status === "sent" && (
                            <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200">
                              <CheckCircle2 className="size-3" /> Sent
                            </Badge>
                          )}
                          {log.status === "failed" && (
                            <Badge variant="outline" className="text-[10px] gap-1 text-red-600 border-red-200">
                              <XCircle className="size-3" /> Failed
                            </Badge>
                          )}
                          {log.status === "skipped" && (
                            <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-200">
                              <AlertCircle className="size-3" /> Skipped
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.reminderRule?.name || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.recipientEmail}
                        </TableCell>
                        <TableCell className="text-sm truncate max-w-[200px]">
                          {log.subject}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.sentAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {logTotalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Page {logPage} of {logTotalPages} · {logTotal} entries
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={logPage <= 1}
                      onClick={() => setLogPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={logPage >= logTotalPages}
                      onClick={() => setLogPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit Rule" : "New Reminder Rule"}</SheetTitle>
            <SheetDescription>
              {editingId
                ? "Update the reminder rule configuration."
                : "Configure when and how payment reminders are sent."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4 pb-6">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                placeholder="e.g. 7 days before due"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-8 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Trigger Type</Label>
                <Select
                  value={form.triggerType}
                  onValueChange={(v) =>
                    setForm({ ...form, triggerType: v as typeof form.triggerType })
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before_due">Before due date</SelectItem>
                    <SelectItem value="on_due">On due date</SelectItem>
                    <SelectItem value="after_due">After due date</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.triggerType !== "on_due" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Days</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.triggerDays}
                    onChange={(e) =>
                      setForm({ ...form, triggerDays: Number(e.target.value) || 0 })
                    }
                    className="h-8 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Document Type</Label>
                <Select
                  value={form.documentType}
                  onValueChange={(v) =>
                    setForm({ ...form, documentType: v as typeof form.documentType })
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="bill">Bill</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Recipient</Label>
                <Select
                  value={form.recipientType}
                  onValueChange={(v) =>
                    setForm({ ...form, recipientType: v as typeof form.recipientType })
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contact_email">Contact email</SelectItem>
                    <SelectItem value="contact_persons">Contact persons</SelectItem>
                    <SelectItem value="custom">Custom emails</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.recipientType === "custom" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Custom Emails</Label>
                <Input
                  placeholder="email1@example.com, email2@example.com"
                  value={form.customEmails}
                  onChange={(e) => setForm({ ...form, customEmails: e.target.value })}
                  className="h-8 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Separate multiple emails with commas.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Subject Template</Label>
              <Input
                placeholder="Payment reminder for {{documentNumber}}"
                value={form.subjectTemplate}
                onChange={(e) => setForm({ ...form, subjectTemplate: e.target.value })}
                className="h-8 text-sm"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <Button
                    key={v.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-5 text-[10px] px-1.5"
                    onClick={() => insertVariable(v.value, "subjectTemplate")}
                  >
                    {v.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Body Template</Label>
              <Textarea
                placeholder="Dear {{contactName}}, this is a reminder..."
                value={form.bodyTemplate}
                onChange={(e) => setForm({ ...form, bodyTemplate: e.target.value })}
                className="text-sm min-h-[120px]"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <Button
                    key={v.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-5 text-[10px] px-1.5"
                    onClick={() => insertVariable(v.value, "bodyTemplate")}
                  >
                    {v.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Enable rule</p>
                <p className="text-xs text-muted-foreground">
                  Reminders will be sent automatically when enabled.
                </p>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSheetOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
              >
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {confirmDialog}
    </ContentReveal>
  );
}
