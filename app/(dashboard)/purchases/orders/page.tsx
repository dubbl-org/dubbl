"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, ClipboardList, Package, Truck, FileText, Send, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { apiGet } from "@/lib/query/api";
import { useApi } from "@/lib/query/use-api";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, DueCell, MoneyCell, MutedCell, NumberCell, PartyCell, StatusPill, daysUntil, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface PO {
  id: string;
  poNumber: string;
  issueDate: string;
  deliveryDate: string | null;
  status: string;
  reference: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  currencyCode: string;
  convertedBillId: string | null;
  sentAt: string | null;
  createdAt: string;
  contact: { name: string; email: string | null } | null;
}

interface POLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  quantityReceived: number;
  quantityBilled: number;
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Draft", color: "#A1A1AA", hint: "Not sent to the supplier yet" },
  { value: "sent", label: "Ordered", color: "#0EA5E9", hint: "Sent to the supplier. Nothing has arrived yet" },
  { value: "partial", label: "Partly done", color: "#F59E0B", hint: "Some items have arrived or been billed, the rest is still to come" },
  { value: "received", label: "All items in", color: "#14B8A6", hint: "Everything arrived. Turn it into a bill when the supplier invoices you" },
  { value: "closed", label: "Fully billed", color: "#10B981", hint: "Everything on the order has been turned into bills" },
  { value: "void", label: "Cancelled", color: "#D4D4D8", hint: "Cancelled, so it no longer counts" },
];

/** Still expecting goods from the supplier. */
const AWAITING = new Set(["sent", "partial"]);
/** Money you've agreed to spend that isn't fully billed yet. */
const COMMITTED = new Set(["sent", "partial", "received"]);

const isLate = (po: PO) => AWAITING.has(po.status) && (daysUntil(po.deliveryDate) ?? 0) < 0;
const canBill = (po: PO) => COMMITTED.has(po.status) && !po.convertedBillId;

function sum(rows: PO[]) {
  return rows.reduce((s, p) => s + p.total, 0);
}

type OrderJson = { purchaseOrder?: { lines?: POLine[] } };

/** "Mark items received" in the preview: reads the order's lines from the same cached answer the preview shows. */
function ReceiveAllButton({ po, primary, confirm, onDone }: { po: PO; primary: boolean; confirm: ReturnType<typeof useConfirm>["confirm"]; onDone: () => void }) {
  const url = `/api/v1/purchase-orders/${po.id}`;
  const { data } = useApi<OrderJson>(url);
  return (
    <ActionButton
      primary={primary}
      icon={<PackageCheck className="size-3.5" />}
      run={async () => {
        const order =
          data ??
          (await apiGet<OrderJson>(url).catch(() => {
            throw new Error("Couldn't load this order");
          }));
        const lines = (order.purchaseOrder?.lines ?? [])
          .map((l) => ({ purchaseOrderLineId: l.id, quantity: (l.quantity - l.quantityReceived) / 100 }))
          .filter((l) => l.quantity > 0);
        if (lines.length === 0) {
          toast.info("All items on this order are already marked as received");
          return;
        }
        const ok = await confirm({
          title: "Mark all items as received?",
          description: "Records that everything still outstanding on this order has arrived. Anything you track as stock is added to your inventory.",
          confirmLabel: "Mark items as received",
        });
        if (!ok) return;
        await postJson("/api/v1/goods-receipts", { purchaseOrderId: po.id, date: toDayKey(new Date()), lines });
        toast.success("Items marked as received");
        onDone();
      }}
    >
      Mark items received
    </ActionButton>
  );
}

function Progress({ label, done, of, color }: { label: string; done: number; of: number; color: string }) {
  const pct = of > 0 ? Math.min(100, Math.round((done / of) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[12.5px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{pct}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();
  useDocumentTitle("Purchases · Purchase Orders");

  const config = useMemo<ExplorerConfig<PO>>(
    () => ({
      id: "purchase-orders",
      endpoint: "/api/v1/purchase-orders",
      noun: { one: "Purchase order", many: "Purchase orders" },
      getId: (p) => p.id,
      href: (p) => `/purchases/orders/${p.id}`,
      status: { get: (p) => p.status, options: STATUSES },
      date: { get: (p) => p.issueDate, label: "Order date" },
      party: { get: (p) => p.contact?.name, label: "Supplier", many: "Suppliers" },
      amount: (p) => p.total,
      amountLabel: "Ordered",
      currency: (p) => p.currencyCode,
      search: (p) => [p.poNumber, p.contact?.name, p.contact?.email, p.reference],
      defaultSort: { key: "issued", dir: "desc" },
      facets: [
        { key: "delivery", label: "Delivery", value: (p) => (!AWAITING.has(p.status) ? null : isLate(p) ? "Late" : p.deliveryDate ? "On schedule" : "No date set") },
        { key: "currency", label: "Currency", value: (p) => p.currencyCode },
      ],
      columns: [
        { key: "number", label: "Number", className: "w-32", value: (p) => p.poNumber, render: (p) => <NumberCell value={p.poNumber} /> },
        { key: "supplier", label: "Supplier", value: (p) => p.contact?.name, render: (p) => <PartyCell name={p.contact?.name} /> },
        { key: "issued", label: "Ordered on", className: "w-32", value: (p) => p.issueDate, render: (p) => <DateCell value={p.issueDate} /> },
        {
          key: "delivery",
          label: "Expected",
          className: "w-44",
          hint: "When the supplier said the goods would arrive",
          value: (p) => p.deliveryDate,
          render: (p) => <DueCell value={p.deliveryDate} open={AWAITING.has(p.status)} />,
        },
        { key: "status", label: "Status", className: "w-36", value: (p) => p.status, render: (p) => <StatusPill value={p.status} options={STATUSES} /> },
        { key: "reference", label: "Reference", hidden: true, value: (p) => p.reference, render: (p) => <MutedCell value={p.reference} /> },
        { key: "subtotal", label: "Before tax", align: "right", className: "w-32", money: true, hidden: true, value: (p) => p.subtotal },
        { key: "tax", label: "Tax", align: "right", className: "w-28", money: true, hidden: true, value: (p) => p.taxTotal },
        { key: "total", label: "Total", align: "right", className: "w-32", money: true, value: (p) => p.total, render: (p) => <MoneyCell cents={p.total} currency={p.currencyCode} className="font-medium" /> },
        {
          key: "committed",
          label: "Committed",
          align: "right",
          className: "w-32",
          money: true,
          hint: "Value of orders you've placed that aren't fully billed yet",
          value: (p) => (COMMITTED.has(p.status) ? p.total : 0),
          render: (p) => <MoneyCell cents={COMMITTED.has(p.status) ? p.total : 0} currency={p.currencyCode} />,
        },
        { key: "billed", label: "Billed", className: "w-24", hidden: true, hint: "Whether a bill has been created from this order", value: (p) => (p.convertedBillId ? "Yes" : "No") },
        { key: "sent", label: "Sent on", className: "w-32", hidden: true, value: (p) => p.sentAt, render: (p) => <DateCell value={p.sentAt} /> },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (p) => p.currencyCode },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (p) => p.createdAt, render: (p) => <DateCell value={p.createdAt} /> },
      ],
      metrics: (rows) => {
        const committed = rows.filter((p) => COMMITTED.has(p.status));
        const awaiting = rows.filter((p) => AWAITING.has(p.status));
        const late = awaiting.filter(isLate);
        const inNotBilled = rows.filter((p) => p.status === "received");
        const closed = rows.filter((p) => p.status === "closed");
        const drafts = rows.filter((p) => p.status === "draft");
        return [
          { key: "committed", label: "Open commitments", color: "#F59E0B", value: formatMoney(sum(committed)), note: `${committed.length} order${committed.length === 1 ? "" : "s"} not fully billed`, hint: "Money you've agreed to spend with suppliers that hasn't become a bill yet." },
          { key: "awaiting", label: "Waiting for delivery", color: "#0EA5E9", value: formatMoney(sum(awaiting)), note: `${awaiting.length} order${awaiting.length === 1 ? "" : "s"} with items to come`, hint: "Orders where some or all items haven't arrived yet." },
          { key: "late", label: "Late deliveries", color: "#EF4444", value: formatMoney(sum(late)), note: late.length ? `${late.length} past the expected date` : "Nothing is late", hint: "Orders still waiting on goods after the expected delivery date. Chase these suppliers." },
          { key: "toBill", label: "Received, not billed", color: "#14B8A6", status: "received", value: formatMoney(sum(inNotBilled)), note: `${inNotBilled.length} order${inNotBilled.length === 1 ? "" : "s"} to turn into bills`, hint: "Everything arrived but no bill yet. Expect the supplier's invoice soon." },
          { key: "closed", label: "Fully billed", color: "#10B981", status: "closed", value: formatMoney(sum(closed)), note: `${closed.length} order${closed.length === 1 ? "" : "s"} done`, hint: "Orders that have been completely turned into bills." },
          { key: "drafts", label: "Drafts", color: "#A1A1AA", status: "draft", value: drafts.length.toString(), note: formatMoney(sum(drafts)), hint: "Orders you started but haven't sent to the supplier." },
        ];
      },
      preview: (p, helpers) => (
        <DocumentPreview
          url={`/api/v1/purchase-orders/${p.id}`}
          pick={(json) => {
            const doc = json.purchaseOrder as (PO & { lines?: POLine[]; notes?: string | null }) | undefined;
            const lines = doc?.lines ?? [];
            const ordered = lines.reduce((s, l) => s + l.quantity, 0);
            const received = lines.reduce((s, l) => s + l.quantityReceived, 0);
            const billed = lines.reduce((s, l) => s + l.quantityBilled, 0);
            return {
              lines,
              notes: doc?.notes,
              totals: [
                { label: "Before tax", cents: doc?.subtotal },
                { label: "Tax", cents: doc?.taxTotal },
                { label: "Total", cents: doc?.total, strong: true },
              ],
              extra: ordered > 0 && (
                <div className="mt-5 space-y-3 rounded-xl border border-border/80 p-4">
                  <Progress label="Items received" done={received} of={ordered} color="#14B8A6" />
                  <Progress label="Items billed" done={billed} of={ordered} color="#10B981" />
                </div>
              ),
            };
          }}
          number={p.poNumber}
          status={p.status}
          statusOptions={STATUSES}
          party={p.contact?.name}
          partySub={p.contact?.email}
          amount={p.total}
          currency={p.currencyCode}
          facts={[
            { label: "Ordered on", value: formatDay(p.issueDate) },
            { label: "Expected", value: <DueCell value={p.deliveryDate} open={AWAITING.has(p.status)} /> },
            { label: "Sent on", value: formatDay(p.sentAt) },
            { label: "Billed", value: p.convertedBillId ? "Yes" : "Not yet" },
            { label: "Reference", value: p.reference || "—" },
            { label: "Currency", value: p.currencyCode },
          ]}
          actions={
            <>
              {p.status === "draft" && (
                <ActionButton primary icon={<Send className="size-3.5" />} run={async () => router.push(`/purchases/orders/${p.id}`)}>
                  Review and send
                </ActionButton>
              )}
              {AWAITING.has(p.status) && (
                <ReceiveAllButton po={p} primary={!canBill(p)} confirm={confirm} onDone={helpers.refresh} />
              )}
              {canBill(p) && (
                <ActionButton
                  primary
                  icon={<FileText className="size-3.5" />}
                  success="Bill created from this order"
                  run={async () => {
                    const data = await postJson<{ bill?: { id: string } }>(`/api/v1/purchase-orders/${p.id}/convert`);
                    if (data.bill?.id) router.push(`/purchases/${data.bill.id}`);
                  }}
                >
                  Turn into bill
                </ActionButton>
              )}
              {p.convertedBillId && (
                <ActionButton icon={<FileText className="size-3.5" />} run={async () => router.push(`/purchases/${p.convertedBillId}`)}>
                  View bill
                </ActionButton>
              )}
            </>
          }
        />
      ),
      empty: <OrdersEmpty onCreate={() => openDrawer("purchaseOrder")} />,
    }),
    [openDrawer, router, confirm]
  );

  return (
    <>
      <Explorer config={config} />
      {confirmDialog}
    </>
  );
}

function OrdersEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div>
        {/* Full-width 3-step process */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 rounded-lg border overflow-hidden mb-8">
          {[
            {
              icon: ClipboardList,
              step: "1",
              label: "Create",
              desc: "Draft a purchase order with items, quantities, and pricing",
              color: "text-blue-600 dark:text-blue-400",
              bg: "bg-blue-50 dark:bg-blue-950/40",
              top: "bg-blue-500",
            },
            {
              icon: Truck,
              step: "2",
              label: "Send to Supplier",
              desc: "Send the purchase order directly to your supplier for fulfillment",
              color: "text-amber-600 dark:text-amber-400",
              bg: "bg-amber-50 dark:bg-amber-950/40",
              top: "bg-amber-500",
            },
            {
              icon: Package,
              step: "3",
              label: "Receive Goods",
              desc: "Mark items as received and track delivery against the order",
              color: "text-brand-600 dark:text-brand-400",
              bg: "bg-brand-50 dark:bg-brand-950/40",
              top: "bg-brand-500",
            },
          ].map(({ icon: Icon, step, label, desc, color, bg, top }) => (
            <div key={step} className="relative flex flex-col items-center py-6 px-3 sm:py-8 sm:px-5 text-center border-b sm:border-b-0 border-r-0 sm:border-r last:border-b-0 sm:last:border-r-0">
              <div className={`absolute top-0 left-0 right-0 h-1 ${top} opacity-30`} />
              <div className={`flex size-11 items-center justify-center rounded-xl ${bg}`}>
                <Icon className={`size-5 ${color}`} />
              </div>
              <p className="mt-3 text-sm font-semibold">{label}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-[200px]">{desc}</p>
            </div>
          ))}
        </div>

        {/* Skeleton card grid + CTA overlay */}
        <div className="relative">
          <div className="pointer-events-none grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className={`h-2.5 rounded bg-muted ${i % 2 === 0 ? "w-20" : "w-24"}`} />
                    <div className={`h-2 rounded bg-muted/60 ${i % 2 === 0 ? "w-32" : "w-28"}`} />
                  </div>
                  <div className="h-2.5 w-16 rounded bg-muted/40" />
                </div>
              </div>
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-content-bg/10 via-content-bg/60 to-content-bg" />

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <h2 className="text-lg sm:text-xl font-semibold tracking-tight">No purchase orders yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
              Create purchase orders to track what you&apos;re buying from suppliers and when you expect delivery.
            </p>
            <Button onClick={onCreate} size="lg" className="mt-6 bg-brand-600 hover:bg-brand-700">
              <Plus className="mr-2 size-4" />
              New Purchase Order
            </Button>
          </div>
        </div>
      </div>
    </ContentReveal>
  );
}
