"use client";

import { useState, useEffect, useCallback } from "react";
import { ContentReveal } from "@/components/ui/content-reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Webhook,
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  Send,
  ToggleLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface WebhookItem {
  id: string;
  url: string;
  events: string[];
  secret: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

interface DeliveryItem {
  id: string;
  event: string;
  status: string;
  responseStatus: number | null;
  attempts: number;
  createdAt: string;
}

const EVENT_GROUPS: Record<string, { label: string; events: string[] }> = {
  invoices: {
    label: "Invoices",
    events: ["invoice.created", "invoice.paid", "invoice.overdue"],
  },
  payments: {
    label: "Payments",
    events: ["payment.received"],
  },
  expenses: {
    label: "Expenses",
    events: ["expense.created"],
  },
  bills: {
    label: "Bills",
    events: ["bill.created", "bill.due"],
  },
  contacts: {
    label: "Contacts",
    events: ["contact.created"],
  },
  accounting: {
    label: "Accounting",
    events: ["journal.posted"],
  },
  approvals: {
    label: "Approvals",
    events: ["approval.requested", "approval.completed"],
  },
};

function getOrgId() {
  return localStorage.getItem("activeOrgId") || "";
}

function orgHeaders(extra?: Record<string, string>) {
  return { "x-organization-id": getOrgId(), ...extra };
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookItem | null>(
    null
  );
  const [saving, setSaving] = useState(false);

  // Form state
  const [formUrl, setFormUrl] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);

  // Expanded delivery log
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const fetchWebhooks = useCallback(() => {
    const orgId = getOrgId();
    if (!orgId) return;

    fetch("/api/v1/webhooks", { headers: orgHeaders() })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setWebhooks(data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const fetchDeliveries = useCallback((webhookId: string) => {
    setDeliveriesLoading(true);
    fetch(`/api/v1/webhooks/${webhookId}/deliveries?limit=20`, {
      headers: orgHeaders(),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setDeliveries(data.data);
      })
      .finally(() => setDeliveriesLoading(false));
  }, []);

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDeliveries([]);
    } else {
      setExpandedId(id);
      fetchDeliveries(id);
    }
  };

  const openCreate = () => {
    setEditingWebhook(null);
    setFormUrl("");
    setFormDescription("");
    setFormEvents([]);
    setSheetOpen(true);
  };

  const openEdit = (wh: WebhookItem) => {
    setEditingWebhook(wh);
    setFormUrl(wh.url);
    setFormDescription(wh.description || "");
    setFormEvents(wh.events || []);
    setSheetOpen(true);
  };

  const toggleEvent = (event: string) => {
    setFormEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event]
    );
  };

  const handleSave = async () => {
    if (!formUrl.trim() || formEvents.length === 0) return;
    setSaving(true);

    const url = editingWebhook
      ? `/api/v1/webhooks/${editingWebhook.id}`
      : "/api/v1/webhooks";
    const method = editingWebhook ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: orgHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          url: formUrl.trim(),
          events: formEvents,
          description: formDescription.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save webhook");
        return;
      }

      toast.success(editingWebhook ? "Webhook updated" : "Webhook created");
      setSheetOpen(false);
      fetchWebhooks();
    } catch {
      toast.error("Failed to save webhook");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/webhooks/${id}`, {
        method: "DELETE",
        headers: orgHeaders(),
      });

      if (res.ok) {
        toast.success("Webhook deleted");
        fetchWebhooks();
      } else {
        toast.error("Failed to delete webhook");
      }
    } catch {
      toast.error("Failed to delete webhook");
    }
  };

  const handleToggleActive = async (wh: WebhookItem) => {
    try {
      const res = await fetch(`/api/v1/webhooks/${wh.id}`, {
        method: "PATCH",
        headers: orgHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ isActive: !wh.isActive }),
      });

      if (res.ok) {
        toast.success(wh.isActive ? "Webhook disabled" : "Webhook enabled");
        fetchWebhooks();
      } else {
        toast.error("Failed to update webhook");
      }
    } catch {
      toast.error("Failed to update webhook");
    }
  };

  const handleSendTest = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/webhooks/${id}/test`, {
        method: "POST",
        headers: orgHeaders(),
      });

      if (res.ok) {
        toast.success("Test delivery sent");
        if (expandedId === id) fetchDeliveries(id);
      } else {
        toast.error("Test delivery failed");
      }
    } catch {
      toast.error("Test delivery failed");
    }
  };

  const getSuccessRate = (wh: WebhookItem): string | null => {
    // Success rate is shown from deliveries when expanded; we show a placeholder here
    return null;
  };

  return (
    <ContentReveal>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Webhooks</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Send real-time event notifications to external services
              {webhooks.length > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  {webhooks.length} configured
                </span>
              )}
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 size-3.5" />
            Add Webhook
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : webhooks.length === 0 ? (
          <EmptyState
            icon={Webhook}
            title="No webhooks yet"
            description="Webhooks let you receive real-time notifications when events happen in your organization."
          >
            <Button
              size="sm"
              className="mt-3"
              onClick={openCreate}
            >
              <Plus className="mr-1.5 size-3.5" />
              Create your first webhook
            </Button>
          </EmptyState>
        ) : (
          <div className="rounded-xl border">
            {webhooks.map((wh, i) => (
              <div key={wh.id}>
                <div
                  className={`flex items-center gap-4 px-5 py-4 ${
                    i !== webhooks.length - 1 && expandedId !== wh.id
                      ? "border-b"
                      : ""
                  }`}
                >
                  {/* Icon */}
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                    <Webhook className="size-4 text-emerald-600 dark:text-emerald-400" />
                  </div>

                  {/* URL + description (clickable to expand) */}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => toggleExpand(wh.id)}
                  >
                    <p className="text-sm font-medium truncate">
                      {wh.url.length > 50
                        ? wh.url.slice(0, 50) + "..."
                        : wh.url}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {wh.description || "-"}
                    </p>
                  </button>

                  {/* Badges */}
                  <div className="hidden items-center gap-2 sm:flex">
                    <Badge variant="secondary" className="text-xs">
                      {wh.events.length} event
                      {wh.events.length !== 1 ? "s" : ""}
                    </Badge>
                    <Badge
                      variant={wh.isActive ? "default" : "outline"}
                      className={`text-xs ${
                        wh.isActive
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : ""
                      }`}
                    >
                      {wh.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  {/* Expand indicator */}
                  <button
                    type="button"
                    className="hidden size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted sm:flex"
                    onClick={() => toggleExpand(wh.id)}
                  >
                    {expandedId === wh.id ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </button>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(wh)}>
                        <Pencil className="mr-2 size-3.5" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSendTest(wh.id)}>
                        <Send className="mr-2 size-3.5" />
                        Send Test
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleToggleActive(wh)}
                      >
                        <ToggleLeft className="mr-2 size-3.5" />
                        {wh.isActive ? "Disable" : "Enable"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleDelete(wh.id)}
                      >
                        <Trash2 className="mr-2 size-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Expanded delivery log */}
                {expandedId === wh.id && (
                  <div
                    className={`border-t bg-muted/30 px-5 py-4 ${
                      i !== webhooks.length - 1 ? "border-b" : ""
                    }`}
                  >
                    <h4 className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Recent Deliveries
                    </h4>
                    {deliveriesLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : deliveries.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No deliveries yet
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {deliveries.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center gap-3 rounded-lg border bg-background px-4 py-2.5 text-sm"
                          >
                            {d.status === "success" ? (
                              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                            ) : (
                              <XCircle className="size-4 shrink-0 text-red-500" />
                            )}
                            <span className="flex-1 truncate font-mono text-xs">
                              {d.event}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {d.responseStatus
                                ? `HTTP ${d.responseStatus}`
                                : "-"}
                            </span>
                            <Badge
                              variant={
                                d.status === "success"
                                  ? "default"
                                  : "destructive"
                              }
                              className="text-[10px]"
                            >
                              {d.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {d.attempts} attempt{d.attempts !== 1 ? "s" : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sheet form */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {editingWebhook ? "Edit Webhook" : "New Webhook"}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-5 px-4 py-4">
            {/* URL */}
            <div className="space-y-2">
              <Label>Endpoint URL</Label>
              <Input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://example.com/webhooks"
                type="url"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>

            {/* Events */}
            <div className="space-y-3">
              <Label>Events</Label>
              {Object.entries(EVENT_GROUPS).map(([key, group]) => (
                <div key={key} className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.events.map((event) => (
                      <label
                        key={event}
                        className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs cursor-pointer hover:bg-muted transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={formEvents.includes(event)}
                          onChange={() => toggleEvent(event)}
                          className="size-3.5 rounded border-gray-300"
                        />
                        {event}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formUrl.trim() || formEvents.length === 0}
            >
              {saving
                ? "Saving..."
                : editingWebhook
                  ? "Update"
                  : "Create"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}
