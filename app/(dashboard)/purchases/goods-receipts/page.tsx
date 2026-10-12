"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageCheck, Truck, ArrowRight, FileText, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, MoneyCell, MutedCell, NumberCell, PartyCell, StatusPill, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface GoodsReceiptLine {
  description: string;
  /** Stored x100, like every quantity. */
  quantityReceived: number;
  /** Cents per unit. */
  unitCost: number;
}

interface GoodsReceipt {
  id: string;
  receiptNumber: string;
  date: string;
  status: string;
  notes: string | null;
  purchaseOrderId: string | null;
  createdAt: string;
  contact: { name: string; email?: string | null } | null;
  lines?: GoodsReceiptLine[];
}

interface ReceiptDetail extends GoodsReceipt {
  purchaseOrder?: { id: string; poNumber: string } | null;
  lines?: (GoodsReceiptLine & { inventoryItem?: { name: string } | null; warehouse?: { name: string } | null })[];
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Draft", color: "#A1A1AA", hint: "Started but not booked into stock yet" },
  { value: "received", label: "Waiting for bill", color: "#0EA5E9", hint: "In stock. The supplier's bill hasn't been recorded yet" },
  { value: "billed", label: "Billed", color: "#10B981", hint: "Received and the supplier's bill is recorded" },
  { value: "void", label: "Cancelled", color: "#D4D4D8", hint: "Cancelled, so it no longer counts" },
];

/** Value of goods received: quantity (stored x100) times unit cost, in cents. */
function receivedValue(r: GoodsReceipt) {
  return Math.round((r.lines ?? []).reduce((s, l) => s + (l.quantityReceived / 100) * l.unitCost, 0));
}

function units(r: GoodsReceipt) {
  return (r.lines ?? []).reduce((s, l) => s + l.quantityReceived, 0) / 100;
}

function formatUnits(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function sum(rows: GoodsReceipt[]) {
  return rows.reduce((s, r) => s + receivedValue(r), 0);
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function GoodsReceiptsPage() {
  const router = useRouter();
  useDocumentTitle("Purchases · Goods Received");

  const config = useMemo<ExplorerConfig<GoodsReceipt>>(
    () => ({
      id: "goods-receipts",
      endpoint: "/api/v1/goods-receipts",
      noun: { one: "Goods receipt", many: "Goods received" },
      getId: (r) => r.id,
      href: (r) => `/purchases/goods-receipts/${r.id}`,
      status: { get: (r) => r.status, options: STATUSES },
      date: { get: (r) => r.date, label: "Received on" },
      party: { get: (r) => r.contact?.name, label: "Supplier", many: "Suppliers" },
      amount: (r) => (r.status === "void" ? 0 : receivedValue(r)),
      amountLabel: "Value received",
      search: (r) => [r.receiptNumber, r.contact?.name, r.notes, ...(r.lines ?? []).map((l) => l.description)],
      defaultSort: { key: "date", dir: "desc" },
      facets: [{ key: "source", label: "Source", value: (r) => (r.purchaseOrderId ? "From a purchase order" : "No purchase order") }],
      columns: [
        { key: "number", label: "Number", className: "w-32", value: (r) => r.receiptNumber, render: (r) => <NumberCell value={r.receiptNumber} /> },
        { key: "supplier", label: "Supplier", value: (r) => r.contact?.name, render: (r) => <PartyCell name={r.contact?.name} /> },
        {
          key: "items",
          label: "What arrived",
          hint: "The first item on the delivery",
          value: (r) => r.lines?.[0]?.description,
          render: (r) => {
            const first = r.lines?.[0]?.description;
            const more = (r.lines?.length ?? 0) - 1;
            return <MutedCell value={first ? (more > 0 ? `${first} +${more} more` : first) : null} />;
          },
        },
        { key: "date", label: "Received", className: "w-32", value: (r) => r.date, render: (r) => <DateCell value={r.date} /> },
        { key: "status", label: "Status", className: "w-40", value: (r) => r.status, render: (r) => <StatusPill value={r.status} options={STATUSES} /> },
        { key: "lines", label: "Lines", align: "right", className: "w-20", value: (r) => r.lines?.length ?? 0 },
        { key: "units", label: "Units", align: "right", className: "w-24", value: units, render: (r) => <span className="tabular-nums">{formatUnits(units(r))}</span> },
        {
          key: "value",
          label: "Value received",
          align: "right",
          className: "w-36",
          money: true,
          hint: "Units received times what you agreed to pay for each",
          value: (r) => (r.status === "void" ? 0 : receivedValue(r)),
          render: (r) => <MoneyCell cents={receivedValue(r)} className={r.status === "void" ? "text-muted-foreground line-through" : "font-medium"} />,
        },
        { key: "notes", label: "Notes", hidden: true, value: (r) => r.notes, render: (r) => <MutedCell value={r.notes} /> },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (r) => r.createdAt, render: (r) => <DateCell value={r.createdAt} /> },
      ],
      metrics: (rows) => {
        const live = rows.filter((r) => r.status !== "void");
        const waiting = rows.filter((r) => r.status === "received");
        const billed = rows.filter((r) => r.status === "billed");
        const month = toDayKey(new Date()).slice(0, 7);
        const thisMonth = live.filter((r) => r.date?.slice(0, 7) === month);
        const suppliers = new Set(live.map((r) => r.contact?.name).filter(Boolean));
        const cancelled = rows.filter((r) => r.status === "void");
        return [
          { key: "value", label: "Value received", color: "#14B8A6", value: formatMoney(sum(live)), note: `${plural(live.length, "delivery", "deliveries")} · ${formatUnits(live.reduce((s, r) => s + units(r), 0))} units`, hint: "Everything you've booked into stock from suppliers, at the price you agreed." },
          { key: "waiting", label: "Waiting for a bill", color: "#0EA5E9", status: "received", value: formatMoney(sum(waiting)), note: waiting.length ? `${plural(waiting.length, "delivery", "deliveries")} · bills to expect` : "Every delivery is billed", hint: "Goods you have but haven't recorded the supplier's bill for. That's money you will owe." },
          { key: "billed", label: "Billed", color: "#10B981", status: "billed", value: formatMoney(sum(billed)), note: plural(billed.length, "receipt"), hint: "Deliveries the supplier has billed you for." },
          { key: "month", label: "Received this month", color: "#8B5CF6", value: formatMoney(sum(thisMonth)), note: plural(thisMonth.length, "receipt"), hint: "Goods that arrived since the 1st of this month." },
          { key: "suppliers", label: "Suppliers", color: "#EC4899", value: suppliers.size.toString(), note: "delivered to you", hint: "How many different suppliers these deliveries came from." },
          { key: "cancelled", label: "Cancelled", color: "#D4D4D8", status: "void", value: cancelled.length.toString(), note: formatMoney(sum(cancelled)), hint: "Receipts that were cancelled and no longer count." },
        ];
      },
      preview: (r, helpers) => (
        <DocumentPreview
          url={`/api/v1/goods-receipts/${r.id}`}
          pick={(json) => {
            const doc = json.goodsReceipt as ReceiptDetail | undefined;
            const value = doc ? receivedValue(doc) : 0;
            return {
              lines: doc?.lines?.map((l) => ({
                description: [l.description, l.warehouse?.name && `→ ${l.warehouse.name}`].filter(Boolean).join(" "),
                quantity: l.quantityReceived,
                unitPrice: l.unitCost,
                amount: Math.round((l.quantityReceived / 100) * l.unitCost),
              })),
              notes: doc?.notes,
              totals: [{ label: "Value received", cents: value, strong: true }],
              extra: doc?.purchaseOrder && (
                <Link
                  href={`/purchases/orders/${doc.purchaseOrder.id}`}
                  className="mt-4 flex items-center gap-3 rounded-xl border border-border/80 px-3 py-2.5 text-[13px] transition-colors hover:bg-foreground/[0.02]"
                >
                  <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                    <ShoppingCart className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">Received against {doc.purchaseOrder.poNumber}</span>
                    <span className="block text-[12px] text-muted-foreground">Open the purchase order</span>
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                </Link>
              ),
            };
          }}
          number={r.receiptNumber}
          status={r.status}
          statusOptions={STATUSES}
          party={r.contact?.name}
          partySub={r.contact?.email}
          amount={receivedValue(r)}
          amountLabel="received"
          facts={[
            { label: "Received", value: formatDay(r.date) },
            { label: "Units", value: formatUnits(units(r)) },
            { label: "Lines", value: r.lines?.length ?? 0 },
            { label: "Recorded", value: formatDay(r.createdAt) },
          ]}
          actions={
            <>
              {r.status === "received" && (
                <ActionButton
                  primary
                  icon={<FileText className="size-3.5" />}
                  success="Bill created"
                  run={async () => {
                    const data = await postJson<{ bill?: { id: string } }>(`/api/v1/goods-receipts/${r.id}/create-bill`);
                    helpers.refresh();
                    if (data.bill?.id) router.push(`/purchases/${data.bill.id}`);
                  }}
                >
                  Create bill
                </ActionButton>
              )}
              {r.purchaseOrderId && (
                <ActionButton icon={<ShoppingCart className="size-3.5" />} run={async () => router.push(`/purchases/orders/${r.purchaseOrderId}`)}>
                  View purchase order
                </ActionButton>
              )}
            </>
          }
        />
      ),
      empty: <GoodsReceiptsEmpty />,
    }),
    [router]
  );

  return <Explorer config={config} />;
}

function GoodsReceiptsEmpty() {
  return (
    <ContentReveal>
      <div className="pt-12 pb-12 space-y-10">
        {/* Top: title + hint (no "new" — goods are received from a purchase order) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Goods Received</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              The stock you&apos;ve received from suppliers against a purchase order. Record what arrived so your inventory stays accurate.
            </p>
          </div>
          <Button variant="outline" asChild className="shrink-0">
            <Link href="/purchases/orders">
              Go to purchase orders
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
          {/* Left: how it works */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How receiving goods works</p>
            </div>
            <div className="divide-y">
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                    <Truck className="size-3.5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Order placed</p>
                    <p className="text-[11px] text-muted-foreground">PO-0042</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium">$1,200.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 bg-brand-50/30 dark:bg-brand-950/10">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-950/40">
                    <PackageCheck className="size-3.5 text-brand-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-700 dark:text-brand-300">Goods received</p>
                    <p className="text-[11px] text-muted-foreground">GRN-0001</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium text-brand-600 dark:text-brand-400">+$1,200.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="size-7" />
                  <p className="text-sm font-semibold">Stock on hand</p>
                </div>
                <span className="font-mono text-sm font-bold">Updated</span>
              </div>
            </div>
          </div>

          {/* Right: how to record one */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How to record goods you&apos;ve received</p>
            {[
              { title: "Open the purchase order", desc: "Goods are always received against an order you sent to a supplier — start there.", color: "border-l-blue-400" },
              { title: "Mark what arrived", desc: "Enter the quantity received for each item — receive it all at once or in part deliveries.", color: "border-l-brand-400" },
              { title: "Stock updates automatically", desc: "Received items are added to your inventory on hand straight away.", color: "border-l-amber-400" },
              { title: "Bill it later", desc: "When the supplier's invoice arrives, create a bill from the same order.", color: "border-l-purple-400" },
            ].map(({ title, desc, color }) => (
              <div key={title} className={`rounded-lg border border-l-[3px] ${color} bg-card px-4 py-3`}>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ContentReveal>
  );
}
