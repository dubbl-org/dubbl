"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ClipboardCheck, Loader2, Trash2, Check, X as XIcon, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, DueCell, MoneyCell, MutedCell, NumberCell, PartyCell, StatusPill, daysUntil, formatDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerHelpers, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface RequisitionLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface Requisition {
  id: string;
  requisitionNumber: string;
  requestDate: string;
  requiredDate: string | null;
  status: string;
  reference: string | null;
  notes: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  currencyCode: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  convertedPoId: string | null;
  createdAt: string;
  contact: { name: string; email?: string | null } | null;
  lines: RequisitionLine[];
}

interface LineInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Draft", color: "#A1A1AA", hint: "Started but not sent for approval yet" },
  { value: "submitted", label: "Waiting for approval", color: "#6366F1", hint: "Sent to a manager who needs to approve or reject it" },
  { value: "approved", label: "Approved", color: "#10B981", hint: "Approved. Turn it into a purchase order to buy it" },
  { value: "converted", label: "Ordered", color: "#8B5CF6", hint: "Already turned into a purchase order" },
  { value: "rejected", label: "Rejected", color: "#EF4444", hint: "A manager said no" },
];

/** Still heading towards a purchase: the "needed by" date matters for these. */
const OPEN = new Set(["draft", "submitted", "approved"]);

const emptyLine = (): LineInput => ({ description: "", quantity: 1, unitPrice: 0 });

function sum(rows: Requisition[]) {
  return rows.reduce((s, r) => s + r.total, 0);
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** What was asked for, in a few words: the first line plus a count of the rest. */
function summary(r: Requisition) {
  const first = r.lines?.[0]?.description;
  if (!first) return null;
  const more = (r.lines?.length ?? 0) - 1;
  return more > 0 ? `${first} +${more} more` : first;
}

export default function RequisitionsPage() {
  const router = useRouter();
  useDocumentTitle("Purchases · Requisitions");
  const [version, setVersion] = useState(0);

  // New requisition sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formRequestDate, setFormRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [formRequiredDate, setFormRequiredDate] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLines, setFormLines] = useState<LineInput[]>([emptyLine()]);

  // Reject dialog
  const [rejecting, setRejecting] = useState<{ row: Requisition; helpers: ExplorerHelpers } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);

  function updateLine(idx: number, field: keyof LineInput, value: string | number) {
    setFormLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  function removeLine(idx: number) {
    setFormLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function resetForm() {
    setFormRequestDate(new Date().toISOString().split("T")[0]);
    setFormRequiredDate("");
    setFormReference("");
    setFormNotes("");
    setFormLines([emptyLine()]);
  }

  async function handleCreate() {
    const validLines = formLines.filter((l) => l.description.trim());
    if (validLines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    setCreating(true);
    try {
      await postJson("/api/v1/purchase-requisitions", {
        requestDate: formRequestDate,
        requiredDate: formRequiredDate || null,
        reference: formReference || null,
        notes: formNotes || null,
        lines: validLines,
      });
      toast.success("Requisition created");
      setSheetOpen(false);
      resetForm();
      setVersion((v) => v + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create requisition");
    } finally {
      setCreating(false);
    }
  }

  async function handleReject() {
    if (!rejecting) return;
    setRejectBusy(true);
    try {
      await postJson(`/api/v1/purchase-requisitions/${rejecting.row.id}/reject`, { reason: rejectReason || undefined });
      toast.success("Requisition rejected");
      rejecting.helpers.refresh();
      setRejecting(null);
      setRejectReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setRejectBusy(false);
    }
  }

  const config = useMemo<ExplorerConfig<Requisition>>(
    () => ({
      id: "purchase-requisitions",
      endpoint: "/api/v1/purchase-requisitions",
      noun: { one: "Requisition", many: "Requisitions" },
      getId: (r) => r.id,
      href: (r) => `/purchases/requisitions/${r.id}`,
      status: { get: (r) => r.status, options: STATUSES },
      date: { get: (r) => r.requestDate, label: "Request date" },
      party: { get: (r) => r.contact?.name, label: "Supplier", many: "Suppliers" },
      amount: (r) => r.total,
      amountLabel: "Requested",
      currency: (r) => r.currencyCode,
      search: (r) => [r.requisitionNumber, r.contact?.name, r.reference, r.notes, ...(r.lines ?? []).map((l) => l.description)],
      defaultSort: { key: "requested", dir: "desc" },
      facets: [
        {
          key: "needed",
          label: "Needed by",
          value: (r) => {
            if (!OPEN.has(r.status)) return "Done";
            const d = daysUntil(r.requiredDate);
            if (d == null) return "No date";
            if (d < 0) return "Past due";
            if (d <= 7) return "This week";
            if (d <= 30) return "This month";
            return "Later";
          },
        },
        { key: "currency", label: "Currency", value: (r) => r.currencyCode },
      ],
      columns: [
        { key: "number", label: "Number", className: "w-32", value: (r) => r.requisitionNumber, render: (r) => <NumberCell value={r.requisitionNumber} /> },
        { key: "what", label: "What's needed", hint: "The first item on the request", value: (r) => summary(r), render: (r) => <MutedCell value={summary(r)} /> },
        { key: "supplier", label: "Supplier", value: (r) => r.contact?.name, render: (r) => <PartyCell name={r.contact?.name} /> },
        { key: "requested", label: "Requested", className: "w-32", value: (r) => r.requestDate, render: (r) => <DateCell value={r.requestDate} /> },
        {
          key: "needed",
          label: "Needed by",
          className: "w-44",
          hint: "When the person asking needs it",
          value: (r) => r.requiredDate,
          render: (r) => <DueCell value={r.requiredDate} open={OPEN.has(r.status)} />,
        },
        { key: "status", label: "Status", className: "w-44", value: (r) => r.status, render: (r) => <StatusPill value={r.status} options={STATUSES} /> },
        { key: "lines", label: "Lines", align: "right", className: "w-20", value: (r) => r.lines?.length ?? 0 },
        { key: "reference", label: "Reference", hidden: true, value: (r) => r.reference, render: (r) => <MutedCell value={r.reference} /> },
        { key: "subtotal", label: "Before tax", align: "right", className: "w-32", money: true, hidden: true, value: (r) => r.subtotal },
        { key: "tax", label: "Tax", align: "right", className: "w-28", money: true, hidden: true, value: (r) => r.taxTotal },
        { key: "total", label: "Total", align: "right", className: "w-32", money: true, value: (r) => r.total, render: (r) => <MoneyCell cents={r.total} currency={r.currencyCode} className="font-medium" /> },
        { key: "approvedOn", label: "Approved on", className: "w-32", hidden: true, value: (r) => r.approvedAt, render: (r) => <DateCell value={r.approvedAt} /> },
        { key: "rejectedOn", label: "Rejected on", className: "w-32", hidden: true, value: (r) => r.rejectedAt, render: (r) => <DateCell value={r.rejectedAt} /> },
        { key: "reason", label: "Why rejected", hidden: true, value: (r) => r.rejectionReason, render: (r) => <MutedCell value={r.rejectionReason} /> },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (r) => r.currencyCode },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (r) => r.createdAt, render: (r) => <DateCell value={r.createdAt} /> },
      ],
      metrics: (rows) => {
        const waiting = rows.filter((r) => r.status === "submitted");
        const approved = rows.filter((r) => r.status === "approved");
        const ordered = rows.filter((r) => r.status === "converted");
        const rejected = rows.filter((r) => r.status === "rejected");
        const decided = approved.length + ordered.length + rejected.length;
        const urgent = rows.filter((r) => {
          if (!OPEN.has(r.status)) return false;
          const d = daysUntil(r.requiredDate);
          return d != null && d <= 7;
        });
        const late = urgent.filter((r) => (daysUntil(r.requiredDate) ?? 0) < 0).length;
        const drafts = rows.filter((r) => r.status === "draft");
        return [
          { key: "waiting", label: "Waiting for approval", color: "#6366F1", status: "submitted", value: formatMoney(sum(waiting)), note: plural(waiting.length, "request"), hint: "Requests someone needs to approve or reject before anything is bought." },
          { key: "approved", label: "Approved, not ordered", color: "#10B981", status: "approved", value: formatMoney(sum(approved)), note: approved.length ? `${plural(approved.length, "request")} · create the POs` : "Nothing waiting", hint: "Approved requests that haven't been turned into purchase orders yet." },
          { key: "urgent", label: "Needed this week", color: "#F59E0B", value: formatMoney(sum(urgent)), note: urgent.length ? `${plural(urgent.length, "request")}${late ? ` · ${late} past due` : ""}` : "Nothing urgent", hint: "Open requests whose needed-by date is in the next 7 days or already passed." },
          { key: "ordered", label: "Ordered", color: "#8B5CF6", status: "converted", value: formatMoney(sum(ordered)), note: plural(ordered.length, "purchase order"), hint: "Requests that became purchase orders." },
          { key: "rate", label: "Approval rate", color: "#14B8A6", value: decided ? `${Math.round(((approved.length + ordered.length) / decided) * 100)}%` : "—", note: decided ? `${rejected.length} rejected of ${decided} decided` : "Nothing decided yet", hint: "Of the requests a manager has answered, how many were approved." },
          { key: "drafts", label: "Drafts", color: "#A1A1AA", status: "draft", value: drafts.length.toString(), note: formatMoney(sum(drafts)), hint: "Requests started but not sent for approval." },
        ];
      },
      bulkActions: (selected, helpers) => {
        const approvable = selected.filter((r) => r.status === "submitted");
        return (
          <ActionButton
            icon={<Check className="size-3.5" />}
            className={approvable.length ? undefined : "pointer-events-none opacity-40"}
            run={async () => {
              let ok = 0;
              for (const r of approvable) {
                try {
                  await postJson(`/api/v1/purchase-requisitions/${r.id}/approve`);
                  ok++;
                } catch {
                  // keep going: report the failures together below
                }
              }
              const failed = approvable.length - ok;
              (failed ? toast.error : toast.success)(
                [ok && `${plural(ok, "request")} approved`, failed && `${failed} failed`].filter(Boolean).join(", ") || "Nothing to approve"
              );
              helpers.clearSelection();
              if (ok) helpers.refresh();
            }}
          >
            Approve{approvable.length ? ` (${approvable.length})` : ""}
          </ActionButton>
        );
      },
      preview: (r, helpers) => (
        <DocumentPreview
          url={`/api/v1/purchase-requisitions/${r.id}`}
          pick={(json) => {
            const doc = json as unknown as Requisition;
            return {
              lines: doc?.lines,
              notes: doc?.notes,
              totals: [
                { label: "Before tax", cents: doc?.subtotal },
                { label: "Tax", cents: doc?.taxTotal },
                { label: "Total", cents: doc?.total, strong: true },
              ],
            };
          }}
          number={r.requisitionNumber}
          status={r.status}
          statusOptions={STATUSES}
          party={r.contact?.name}
          amount={r.total}
          currency={r.currencyCode}
          facts={[
            { label: "Requested", value: formatDay(r.requestDate) },
            { label: "Needed by", value: <DueCell value={r.requiredDate} open={OPEN.has(r.status)} /> },
            { label: r.status === "rejected" ? "Rejected on" : "Approved on", value: formatDay(r.status === "rejected" ? r.rejectedAt : r.approvedAt) },
            { label: "Lines", value: r.lines?.length ?? 0 },
            { label: "Reference", value: r.reference || "—" },
            { label: r.status === "rejected" ? "Why rejected" : "Currency", value: r.status === "rejected" ? r.rejectionReason || "No reason given" : r.currencyCode },
          ]}
          actions={
            <>
              {r.status === "submitted" && (
                <>
                  <ActionButton
                    primary
                    icon={<Check className="size-3.5" />}
                    success="Requisition approved"
                    run={async () => {
                      await postJson(`/api/v1/purchase-requisitions/${r.id}/approve`);
                      helpers.refresh();
                    }}
                  >
                    Approve
                  </ActionButton>
                  <ActionButton icon={<XIcon className="size-3.5" />} run={async () => setRejecting({ row: r, helpers })}>
                    Reject
                  </ActionButton>
                </>
              )}
              {r.status === "approved" && (
                <ActionButton
                  primary
                  icon={<FileText className="size-3.5" />}
                  success="Purchase order created from this request"
                  run={async () => {
                    const data = await postJson<{ purchaseOrder?: { id: string } }>(`/api/v1/purchase-requisitions/${r.id}/convert`);
                    if (data.purchaseOrder?.id) router.push(`/purchases/orders/${data.purchaseOrder.id}`);
                  }}
                >
                  Create a purchase order
                </ActionButton>
              )}
              {r.status === "draft" && (
                <ActionButton primary icon={<Send className="size-3.5" />} run={async () => router.push(`/purchases/requisitions/${r.id}`)}>
                  Review and submit
                </ActionButton>
              )}
              {r.convertedPoId && (
                <ActionButton icon={<FileText className="size-3.5" />} run={async () => router.push(`/purchases/orders/${r.convertedPoId}`)}>
                  View purchase order
                </ActionButton>
              )}
            </>
          }
        />
      ),
      create: { label: "New requisition", onClick: () => setSheetOpen(true) },
      empty: <RequisitionsEmpty onCreate={() => setSheetOpen(true)} />,
    }),
    [router]
  );

  return (
    <>
      <Explorer key={version} config={config} />

      {/* New requisition */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="max-h-[85vh]">
          <SheetHeader>
            <SheetTitle>New Purchase Requisition</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Request Date</Label>
                <Input type="date" value={formRequestDate} onChange={(e) => setFormRequestDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Required By</Label>
                <Input type="date" value={formRequiredDate} onChange={(e) => setFormRequiredDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Reference</Label>
              <Input value={formReference} onChange={(e) => setFormReference(e.target.value)} placeholder="Optional reference" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Optional notes" rows={2} />
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Line Items</Label>
              {formLines.map((line, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-lg border p-3">
                  <div className="flex-1 space-y-2">
                    <Input placeholder="Description" value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Qty</Label>
                        <Input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Unit Price</Label>
                        <Input type="number" min={0} step={0.01} value={line.unitPrice} onChange={(e) => updateLine(idx, "unitPrice", Number(e.target.value))} />
                      </div>
                    </div>
                  </div>
                  {formLines.length > 1 && (
                    <Button variant="ghost" size="icon" className="shrink-0 size-8 text-muted-foreground hover:text-red-600" onClick={() => removeLine(idx)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full" onClick={() => setFormLines((prev) => [...prev, emptyLine()])}>
                <Plus className="mr-2 size-3.5" />
                Add Line
              </Button>
            </div>

            <Button onClick={handleCreate} disabled={creating} className="w-full bg-brand-600 hover:bg-brand-700">
              {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              Create Requisition
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Reject with a reason */}
      <Dialog
        open={Boolean(rejecting)}
        onOpenChange={(open) => {
          if (!open) {
            setRejecting(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.row.requisitionNumber}?</DialogTitle>
            <DialogDescription>The person who asked will see that it was rejected. Add a reason so they know what to change.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Optional, e.g. over budget this month" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Keep it
            </Button>
            <Button onClick={handleReject} disabled={rejectBusy} className="bg-red-600 text-white hover:bg-red-700">
              {rejectBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RequisitionsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div>
        {/* Pipeline steps */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-0 rounded-lg border overflow-hidden mb-8">
          {[
            { label: "Draft", desc: "Create requisition", color: "bg-gray-400", bg: "bg-gray-50 dark:bg-gray-900/30" },
            { label: "Submitted", desc: "Submit for approval", color: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20" },
            { label: "Approved", desc: "Manager approves", color: "bg-brand-500", bg: "bg-brand-50 dark:bg-brand-900/20" },
            { label: "Rejected", desc: "Request denied", color: "bg-red-500", bg: "bg-red-50 dark:bg-red-900/20" },
            { label: "Converted", desc: "Becomes a PO", color: "bg-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20" },
          ].map(({ label, desc, color, bg }, i) => (
            <div key={label} className={`relative flex flex-col items-center py-6 px-3 text-center border-r last:border-r-0 ${bg}`}>
              <div className={`absolute top-0 left-0 right-0 h-1 ${color} opacity-30`} />
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-muted-foreground/50 tabular-nums">{i + 1}</span>
                <div className={`size-2.5 rounded-full ${color}`} />
              </div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
            </div>
          ))}
        </div>

        {/* Skeleton table + CTA overlay */}
        <div className="relative">
          <div className="pointer-events-none w-full rounded-lg border overflow-hidden">
            <div className="flex items-center gap-4 border-b bg-muted/50 px-4 h-10">
              <div className="h-2 w-28 rounded bg-muted-foreground/20" />
              <div className="h-2 w-20 rounded bg-muted-foreground/20" />
              <div className="h-2 w-16 rounded bg-muted-foreground/20 hidden sm:block" />
              <div className="ml-auto h-2 w-16 rounded bg-muted-foreground/20" />
              <div className="h-2 w-16 rounded bg-muted-foreground/20" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b last:border-0 px-4 h-12">
                <div className={`h-2.5 rounded bg-muted flex-1 max-w-[200px] ${i % 2 === 0 ? "max-w-[180px]" : "max-w-[220px]"}`} />
                <div className={`h-2.5 rounded bg-muted/60 ${i % 2 === 0 ? "w-24" : "w-20"} hidden sm:block`} />
                <div className="h-2.5 w-20 rounded bg-muted/50 hidden sm:block" />
                <div
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium hidden sm:block ${
                    i % 3 === 0
                      ? "bg-blue-100 text-blue-400 dark:bg-blue-900/40 dark:text-blue-500"
                      : i % 3 === 1
                        ? "bg-brand-100 text-brand-400 dark:bg-brand-900/40 dark:text-brand-500"
                        : "bg-purple-100 text-purple-400 dark:bg-purple-900/40 dark:text-purple-500"
                  }`}
                >
                  {i % 3 === 0 ? "submitted" : i % 3 === 1 ? "approved" : "converted"}
                </div>
                <div className={`h-2.5 rounded bg-muted/40 ${i % 2 === 0 ? "w-16" : "w-14"}`} />
              </div>
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-content-bg/20 via-content-bg/70 to-content-bg" />

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-950/50">
              <ClipboardCheck className="size-7 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-tight">No purchase requisitions yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
              Create purchase requisitions to request purchases that require approval before ordering.
            </p>
            <Button onClick={onCreate} size="lg" className="mt-6 bg-brand-600 hover:bg-brand-700">
              <Plus className="mr-2 size-4" />
              New Requisition
            </Button>
          </div>
        </div>
      </div>
    </ContentReveal>
  );
}
