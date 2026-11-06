"use client";

import { useMemo } from "react";
import { Plus, ArrowRight, Check, X as XIcon, Warehouse, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, MoneyCell, MutedCell, StatusPill, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import { useRecords } from "@/components/dashboard/explorer/use-records";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface WarehouseInfo {
  id: string;
  name: string;
  code: string;
}

interface TransferLine {
  id: string;
  inventoryItemId: string;
  quantity: number;
  receivedQuantity: number | null;
}

interface Transfer {
  id: string;
  fromWarehouse: WarehouseInfo;
  toWarehouse: WarehouseInfo;
  status: "draft" | "in_transit" | "completed" | "cancelled";
  notes: string | null;
  lines: TransferLine[];
  createdAt: string;
  completedAt: string | null;
}

interface InventoryItemOption {
  id: string;
  name: string;
  code: string;
  purchasePrice: number;
  /** Moving average cost, cents per unit. */
  averageCost: number;
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Draft", color: "#A1A1AA", hint: "Planned. No stock has moved yet" },
  { value: "in_transit", label: "On the way", color: "#0EA5E9", hint: "Sent: the stock has left the source location but isn't marked as arrived" },
  { value: "completed", label: "Arrived", color: "#10B981", hint: "Done. Stock levels at both locations are updated" },
  { value: "cancelled", label: "Cancelled", color: "#D4D4D8", hint: "Called off. Anything on the way went back to the source" },
];

const OPEN = new Set(["draft", "in_transit"]);
const day = (value: string | null | undefined) => (value ? toDayKey(new Date(value)) : null);
const route = (t: Transfer) => `${t.fromWarehouse?.name ?? "?"} → ${t.toWarehouse?.name ?? "?"}`;
const units = (t: Transfer) => t.lines.reduce((s, l) => s + l.quantity, 0);

function daysToArrive(t: Transfer) {
  if (!t.completedAt) return null;
  return Math.max(0, Math.round((new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / 86400000));
}

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

async function patchJson(url: string, body: unknown) {
  const orgId = localStorage.getItem("activeOrgId");
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(orgId ? { "x-organization-id": orgId } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.error === "string" ? data.error : "Failed to cancel transfer");
  }
}

export default function TransfersPage() {
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();
  useDocumentTitle("Inventory · Transfers");

  // Item names and costs for the lines (every page, not just the first 100)
  const { rows: items } = useRecords<InventoryItemOption>("/api/v1/inventory");
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const config = useMemo<ExplorerConfig<Transfer>>(() => {
    const unitCost = (id: string) => {
      const item = itemMap.get(id);
      return item ? item.averageCost || item.purchasePrice : 0;
    };
    const value = (t: Transfer) => t.lines.reduce((s, l) => s + l.quantity * unitCost(l.inventoryItemId), 0);
    return {
      id: "inventory-transfers",
      endpoint: "/api/v1/inventory/transfers",
      noun: { one: "Transfer", many: "Transfers" },
      getId: (t) => t.id,
      status: { get: (t) => t.status, options: STATUSES },
      date: { get: (t) => day(t.createdAt), label: "Created" },
      party: { get: route, label: "Route", many: "Routes" },
      amount: (t) => (t.status === "cancelled" ? 0 : value(t)),
      amountLabel: "Value moved",
      search: (t) => [
        t.fromWarehouse?.name,
        t.fromWarehouse?.code,
        t.toWarehouse?.name,
        t.toWarehouse?.code,
        t.notes,
        ...t.lines.map((l) => itemMap.get(l.inventoryItemId)?.name),
      ],
      defaultSort: { key: "created", dir: "desc" },
      facets: [
        { key: "from", label: "From", value: (t) => t.fromWarehouse?.name },
        { key: "to", label: "To", value: (t) => t.toWarehouse?.name },
      ],
      columns: [
        {
          key: "route",
          label: "Route",
          value: route,
          render: (t) => (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{t.fromWarehouse?.name}</span>
              <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{t.toWarehouse?.name}</span>
            </span>
          ),
        },
        { key: "from", label: "From", className: "w-40", hidden: true, value: (t) => t.fromWarehouse?.name },
        { key: "to", label: "To", className: "w-40", hidden: true, value: (t) => t.toWarehouse?.name },
        { key: "status", label: "Status", className: "w-32", value: (t) => t.status, render: (t) => <StatusPill value={t.status} options={STATUSES} /> },
        { key: "lines", label: "Items", align: "right", className: "w-20", value: (t) => t.lines.length },
        { key: "units", label: "Units", align: "right", className: "w-24", value: units, render: (t) => <span className="tabular-nums">{units(t).toLocaleString()}</span> },
        {
          key: "value",
          label: "Value moved",
          align: "right",
          className: "w-32",
          money: true,
          hint: "Units times each item's current cost",
          value: (t) => (t.status === "cancelled" ? 0 : value(t)),
          render: (t) => <MoneyCell cents={value(t)} className={t.status === "cancelled" ? "text-muted-foreground line-through" : undefined} />,
        },
        { key: "notes", label: "Notes", value: (t) => t.notes, render: (t) => <MutedCell value={t.notes} /> },
        { key: "created", label: "Created", className: "w-32", value: (t) => t.createdAt, render: (t) => <DateCell value={day(t.createdAt)} /> },
        { key: "completed", label: "Arrived", className: "w-32", value: (t) => t.completedAt, render: (t) => <DateCell value={day(t.completedAt)} /> },
        { key: "days", label: "Days to arrive", align: "right", className: "w-28", hidden: true, value: daysToArrive, render: (t) => <span className="tabular-nums">{daysToArrive(t) ?? "—"}</span> },
      ],
      metrics: (rows) => {
        const moving = rows.filter((t) => t.status === "in_transit");
        const drafts = rows.filter((t) => t.status === "draft");
        const done = rows.filter((t) => t.status === "completed");
        const sumUnits = (list: Transfer[]) => list.reduce((s, t) => s + units(t), 0);
        const sumValue = (list: Transfer[]) => list.reduce((s, t) => s + value(t), 0);
        const routes = new Map<string, number>();
        for (const t of rows) if (t.status !== "cancelled") routes.set(route(t), (routes.get(route(t)) ?? 0) + 1);
        const busiest = [...routes.entries()].sort((a, b) => b[1] - a[1])[0];
        const durations = done.map(daysToArrive).filter((d): d is number => d != null);
        const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
        return [
          { key: "moving", label: "On the way", color: "#0EA5E9", status: "in_transit", value: plural(sumUnits(moving), "unit"), note: `${plural(moving.length, "transfer")} · ${formatMoney(sumValue(moving))}`, hint: "Stock that has left one location but isn't marked as arrived. It isn't on either shelf yet." },
          { key: "drafts", label: "Not sent yet", color: "#A1A1AA", status: "draft", value: drafts.length.toString(), note: drafts.length ? plural(sumUnits(drafts), "unit") + " planned" : "Nothing waiting", hint: "Transfers that are planned but haven't moved any stock." },
          { key: "done", label: "Arrived", color: "#10B981", status: "completed", value: done.length.toString(), note: `${plural(sumUnits(done), "unit")} moved`, hint: "Finished transfers. Stock levels at both locations are updated." },
          { key: "value", label: "Value moved", color: "#8B5CF6", value: formatMoney(sumValue(done)), note: "at today's cost", hint: "What the stock you've moved is worth, using each item's current cost." },
          { key: "route", label: "Busiest route", color: "#EC4899", value: busiest ? busiest[0] : "—", note: busiest ? plural(busiest[1], "transfer") : "No transfers yet", hint: "The pair of locations you move stock between most often." },
          { key: "speed", label: "Time to arrive", color: "#14B8A6", value: avg == null ? "—" : avg < 1 ? "Same day" : plural(Math.round(avg), "day"), note: durations.length ? `average over ${plural(durations.length, "transfer")}` : "No arrivals yet", hint: "On average, how long from creating a transfer to marking it as arrived." },
        ];
      },
      preview: (t, helpers) => (
        <DocumentPreview
          number={`${t.fromWarehouse?.code ?? ""} → ${t.toWarehouse?.code ?? ""}`}
          status={t.status}
          statusOptions={STATUSES}
          party={route(t)}
          amount={value(t)}
          amountLabel="at today's cost"
          facts={[
            { label: "From", value: t.fromWarehouse?.name },
            { label: "To", value: t.toWarehouse?.name },
            { label: "Items", value: t.lines.length },
            { label: "Total units", value: units(t).toLocaleString() },
            { label: "Created", value: formatDay(day(t.createdAt)) },
            { label: "Arrived", value: formatDay(day(t.completedAt)) },
          ]}
          actions={
            OPEN.has(t.status) && (
              <>
                {t.status === "draft" && (
                  <ActionButton
                    icon={<Truck className="size-3.5" />}
                    run={async () => {
                      const ok = await confirm({ title: "Mark as on the way?", description: `The stock leaves ${t.fromWarehouse?.name ?? "the source location"} now. It lands at ${t.toWarehouse?.name ?? "the destination"} when you mark the transfer as arrived.`, confirmLabel: "Mark on the way" });
                      if (!ok) return false;
                      await patchJson(`/api/v1/inventory/transfers/${t.id}`, { status: "in_transit" });
                      toast.success("Transfer on the way");
                      helpers.refresh();
                    }}
                  >
                    Mark on the way
                  </ActionButton>
                )}
                <ActionButton
                  primary
                  icon={<Check className="size-3.5" />}
                  run={async () => {
                    const ok = await confirm({ title: "Complete transfer?", description: "The stock is added to the destination location (and taken from the source, if it hasn't left yet). This can't be undone.", confirmLabel: "Complete" });
                    if (!ok) return false;
                    await postJson(`/api/v1/inventory/transfers/${t.id}/complete`);
                    toast.success("Transfer completed");
                    helpers.refresh();
                  }}
                >
                  Complete
                </ActionButton>
                <ActionButton
                  icon={<XIcon className="size-3.5" />}
                  className="text-red-600"
                  run={async () => {
                    const ok = await confirm({ title: "Cancel transfer?", description: t.status === "in_transit" ? "The stock on the way goes back to the source location." : "Nothing has moved yet, so stock levels stay the same.", confirmLabel: "Cancel Transfer", destructive: true });
                    if (!ok) return false;
                    await patchJson(`/api/v1/inventory/transfers/${t.id}`, { status: "cancelled" });
                    toast.success("Transfer cancelled");
                    helpers.refresh();
                  }}
                >
                  Cancel
                </ActionButton>
              </>
            )
          }
        >
          {t.notes && (
            <div className="mt-5">
              <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{t.notes}</p>
            </div>
          )}
          <div className="mt-6">
            <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Line items</p>
            {t.lines.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">No line items</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/80">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="h-8 bg-foreground/[0.025] text-[11.5px] text-muted-foreground">
                      <th className="px-3 text-left font-medium">Item</th>
                      <th className="w-16 px-2 text-right font-medium">Units</th>
                      <th className="w-20 px-2 text-right font-medium">Received</th>
                      <th className="w-28 px-3 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.lines.map((l) => {
                      const item = itemMap.get(l.inventoryItemId);
                      const short = l.receivedQuantity != null && l.receivedQuantity !== l.quantity;
                      return (
                        <tr key={l.id} className="border-t border-border/60">
                          <td className="px-3 py-2">
                            <span className="block truncate">{item?.name ?? "Unknown item"}</span>
                            {item?.code && <span className="block font-mono text-[11px] text-muted-foreground">{item.code}</span>}
                          </td>
                          <td className="px-2 py-2 text-right font-medium tabular-nums">{l.quantity.toLocaleString()}</td>
                          <td className={cn("px-2 py-2 text-right tabular-nums", short ? "text-amber-600" : "text-muted-foreground")}>
                            {l.receivedQuantity != null ? l.receivedQuantity.toLocaleString() : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{item ? formatMoney(l.quantity * unitCost(l.inventoryItemId)) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DocumentPreview>
      ),
      empty: <TransfersEmpty onCreate={() => openDrawer("transfer")} />,
    };
  }, [itemMap, confirm, openDrawer]);

  return (
    <>
      <Explorer config={config} />
      {confirmDialog}
    </>
  );
}

function TransfersEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div className="pt-8 pb-12 space-y-8">
        {/* Header */}
        <div className="text-center max-w-lg mx-auto">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-xs font-medium text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full uppercase tracking-wide">Stock Transfers</span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Move inventory between locations</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Create transfers to track stock as it moves from one warehouse to another.</p>
        </div>

        {/* Visual: Two warehouses with flow between them */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-0 max-w-2xl mx-auto">
          {/* Source warehouse */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40">
                <Warehouse className="size-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Main Warehouse</p>
                <p className="text-[11px] text-muted-foreground">WH-001</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {[
                { name: "Widget A", send: 30 },
                { name: "Sensor B", send: 15 },
                { name: "Cable C", send: 50 },
              ].map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
                  <span className="text-xs">{item.name}</span>
                  <span className="text-xs font-mono text-red-500 dark:text-red-400">-{item.send}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Arrow flow */}
          <div className="flex flex-col items-center gap-1 px-3">
            <div className="w-8 h-px bg-border" />
            <div className="flex size-7 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
              <ArrowRight className="size-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="w-8 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground font-medium">95 units</span>
          </div>

          {/* Destination warehouse */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/40">
                <Warehouse className="size-4 text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <p className="text-sm font-medium">East DC</p>
                <p className="text-[11px] text-muted-foreground">WH-002</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {[
                { name: "Widget A", qty: 30 },
                { name: "Sensor B", qty: 15 },
                { name: "Cable C", qty: 50 },
              ].map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
                  <span className="text-xs">{item.name}</span>
                  <span className="text-xs font-mono text-brand-600 dark:text-brand-400">+{item.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-center">
          <Button onClick={onCreate} className="bg-brand-600 hover:bg-brand-700">
            <Plus className="mr-2 size-4" />
            New Transfer
          </Button>
        </div>

        {/* Status legend - compact horizontal */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {[
            { label: "Draft", color: "bg-slate-400" },
            { label: "On the way", color: "bg-blue-400" },
            { label: "Arrived", color: "bg-brand-400" },
            { label: "Cancelled", color: "bg-red-400" },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`size-2 rounded-full ${color}`} />
              <span className="text-[11px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </ContentReveal>
  );
}
