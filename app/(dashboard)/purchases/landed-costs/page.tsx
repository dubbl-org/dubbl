"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Ship, Layers, FileText, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ContentReveal } from "@/components/ui/content-reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { decimalToCents, formatMoney } from "@/lib/money";
import { AccountPicker } from "@/components/dashboard/account-picker";
import { PurchaseDocumentPicker } from "@/components/dashboard/purchase-document-picker";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, MoneyCell, MutedCell, StatusPill, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface CostComponent {
  description: string;
  amount: string;
  accountId: string;
}

interface LandedCost {
  id: string;
  name: string;
  allocationMethod: string;
  totalCostAmount: number;
  currencyCode: string;
  status: string;
  createdAt: string;
  allocatedAt: string | null;
  purchaseOrderId: string | null;
  billId: string | null;
  components?: { id: string; description: string; amount: number }[];
  purchaseOrder?: { id: string; poNumber: string } | null;
  bill?: { id: string; billNumber: string } | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Not applied", color: "#F59E0B", hint: "Recorded, but not yet added to the cost of your stock" },
  { value: "allocated", label: "Applied", color: "#10B981", hint: "Spread across the items it relates to, so their cost includes it" },
];

const METHODS: Record<string, string> = {
  by_value: "By value",
  by_quantity: "By quantity",
  // Older records only: items have no weight, so this can't be chosen any more.
  by_weight: "By weight",
  manual: "Manual",
};

const METHOD_HINTS: Record<string, string> = {
  by_value: "Each purchase order line gets a share in proportion to its amount.",
  by_quantity: "Each purchase order line gets a share in proportion to its units.",
  manual: "You type the amount for each purchase order line when you apply it.",
};

function linkedTo(c: LandedCost) {
  return c.purchaseOrder?.poNumber || c.bill?.billNumber || null;
}

function sum(rows: LandedCost[]) {
  return rows.reduce((s, c) => s + c.totalCostAmount, 0);
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

async function deleteRecord(url: string) {
  const orgId = localStorage.getItem("activeOrgId");
  const res = await fetch(url, { method: "DELETE", headers: orgId ? { "x-organization-id": orgId } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to delete");
  }
}

export default function LandedCostsPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  useDocumentTitle("Purchases · Landed Costs");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [billId, setBillId] = useState("");
  const [allocationMethod, setAllocationMethod] = useState("by_value");
  const [components, setComponents] = useState<CostComponent[]>([{ description: "", amount: "", accountId: "" }]);

  function resetForm() {
    setName("");
    setPurchaseOrderId("");
    setBillId("");
    setAllocationMethod("by_value");
    setComponents([{ description: "", amount: "", accountId: "" }]);
  }

  function updateComponent(index: number, updates: Partial<CostComponent>) {
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  }

  function addComponent() {
    setComponents((prev) => [...prev, { description: "", amount: "", accountId: "" }]);
  }

  function removeComponent(index: number) {
    if (components.length <= 1) return;
    setComponents((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (components.some((c) => !c.description.trim() || !c.amount)) {
      toast.error("All components need a description and amount");
      return;
    }
    setSaving(true);
    try {
      const res = await postJson<{ allocation?: { id: string } }>("/api/v1/landed-costs", {
        name,
        purchaseOrderId: purchaseOrderId || null,
        billId: billId || null,
        allocationMethod,
        components: components.map((c) => ({
          description: c.description,
          amount: decimalToCents(c.amount || "0"),
          accountId: c.accountId || null,
        })),
      });
      toast.success("Landed cost created");
      if (res.allocation?.id) router.push(`/purchases/landed-costs/${res.allocation.id}`);
      setSheetOpen(false);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  const config = useMemo<ExplorerConfig<LandedCost>>(
    () => ({
      id: "landed-costs",
      endpoint: "/api/v1/landed-costs",
      noun: { one: "Landed cost", many: "Landed costs" },
      getId: (c) => c.id,
      href: (c) => `/purchases/landed-costs/${c.id}`,
      status: { get: (c) => c.status, options: STATUSES },
      date: { get: (c) => (c.createdAt ? toDayKey(new Date(c.createdAt)) : null), label: "Created" },
      amount: (c) => c.totalCostAmount,
      amountLabel: "Extra costs",
      currency: (c) => c.currencyCode,
      search: (c) => [c.name, c.purchaseOrder?.poNumber, c.bill?.billNumber, ...(c.components ?? []).map((x) => x.description)],
      defaultSort: { key: "created", dir: "desc" },
      facets: [
        { key: "method", label: "Split", value: (c) => METHODS[c.allocationMethod] ?? c.allocationMethod },
        { key: "linked", label: "Linked to", value: (c) => (c.purchaseOrder ? "Purchase order" : c.bill ? "Bill" : "Nothing") },
      ],
      columns: [
        { key: "name", label: "Name", value: (c) => c.name, render: (c) => <span className="truncate font-medium">{c.name}</span> },
        { key: "linked", label: "PO / Bill", className: "w-32", value: linkedTo, render: (c) => <span className="font-mono text-[12.5px] text-foreground/80">{linkedTo(c) || "—"}</span> },
        {
          key: "components",
          label: "What it covers",
          hint: "The cost lines, such as freight or duty",
          value: (c) => (c.components ?? []).map((x) => x.description).join(", "),
          render: (c) => <MutedCell value={(c.components ?? []).map((x) => x.description).join(", ") || null} />,
        },
        { key: "method", label: "Split", className: "w-28", hint: "How the cost is spread across the items", value: (c) => METHODS[c.allocationMethod] ?? c.allocationMethod },
        { key: "status", label: "Status", className: "w-32", value: (c) => c.status, render: (c) => <StatusPill value={c.status} options={STATUSES} /> },
        { key: "total", label: "Total cost", align: "right", className: "w-32", money: true, value: (c) => c.totalCostAmount, render: (c) => <MoneyCell cents={c.totalCostAmount} currency={c.currencyCode} className="font-medium" /> },
        { key: "created", label: "Created", className: "w-32", value: (c) => c.createdAt, render: (c) => <DateCell value={c.createdAt ? toDayKey(new Date(c.createdAt)) : null} /> },
        { key: "applied", label: "Applied on", className: "w-32", hidden: true, value: (c) => c.allocatedAt, render: (c) => <DateCell value={c.allocatedAt ? toDayKey(new Date(c.allocatedAt)) : null} /> },
        { key: "lines", label: "Cost lines", align: "right", className: "w-24", hidden: true, value: (c) => c.components?.length ?? 0 },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (c) => c.currencyCode },
      ],
      metrics: (rows) => {
        const pending = rows.filter((c) => c.status === "draft");
        const applied = rows.filter((c) => c.status === "allocated");
        const byType = new Map<string, number>();
        for (const c of rows) for (const x of c.components ?? []) {
          const key = x.description.trim().toLowerCase();
          byType.set(key, (byType.get(key) ?? 0) + x.amount);
        }
        const top = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
        const total = sum(rows);
        const year = String(new Date().getFullYear());
        const thisYear = rows.filter((c) => c.createdAt?.startsWith(year));
        const unlinked = rows.filter((c) => !c.purchaseOrder && !c.bill);
        return [
          { key: "total", label: "Extra costs", color: "#14B8A6", value: formatMoney(total), note: plural(rows.length, "allocation"), hint: "Freight, duty and other costs on top of what you paid suppliers." },
          { key: "pending", label: "Not applied yet", color: "#F59E0B", status: "draft", value: formatMoney(sum(pending)), note: pending.length ? `${plural(pending.length, "allocation")} · apply them` : "Everything is applied", hint: "Costs recorded but not yet added to your stock's cost. Until you apply them, your profit per item looks better than it is." },
          { key: "applied", label: "Applied", color: "#10B981", status: "allocated", value: formatMoney(sum(applied)), note: plural(applied.length, "allocation"), hint: "Costs already spread across the items they relate to." },
          { key: "year", label: "This year", color: "#8B5CF6", value: formatMoney(sum(thisYear)), note: plural(thisYear.length, "allocation"), hint: "Extra costs recorded since January 1st." },
          {
            key: "top",
            label: "Biggest cost type",
            color: "#0EA5E9",
            value: top ? <span className="capitalize">{top[0]}</span> : "—",
            note: top ? `${formatMoney(top[1])}${total ? ` · ${Math.round((top[1] / total) * 100)}% of the total` : ""}` : "No cost lines yet",
            hint: "The kind of extra cost you spend the most on, by cost line name.",
          },
          { key: "unlinked", label: "Not linked", color: "#A1A1AA", value: unlinked.length.toString(), note: "to a purchase order or bill", hint: "Allocations that aren't tied to a purchase order or bill, so they can't be spread across items." },
        ];
      },
      preview: (c, helpers) => (
        <DocumentPreview
          url={`/api/v1/landed-costs/${c.id}`}
          pick={(json) => {
            const doc = json as unknown as LandedCost;
            return {
              lines: (doc?.components ?? []).map((x) => ({ description: x.description, amount: x.amount })),
              totals: [{ label: "Total cost", cents: doc?.totalCostAmount, strong: true }],
            };
          }}
          number={c.name}
          status={c.status}
          statusOptions={STATUSES}
          amount={c.totalCostAmount}
          amountLabel="extra cost"
          currency={c.currencyCode}
          facts={[
            { label: "Purchase order", value: c.purchaseOrder?.poNumber || "—" },
            { label: "Bill", value: c.bill?.billNumber || "—" },
            { label: "Split", value: METHODS[c.allocationMethod] ?? c.allocationMethod },
            { label: "Cost lines", value: c.components?.length ?? 0 },
            { label: "Created", value: formatDay(c.createdAt ? toDayKey(new Date(c.createdAt)) : null) },
            { label: "Applied on", value: formatDay(c.allocatedAt ? toDayKey(new Date(c.allocatedAt)) : null) },
          ]}
          actions={
            <>
              {c.status === "draft" && (
                <>
                  {c.allocationMethod === "manual" ? (
                    <ActionButton primary icon={<Layers className="size-3.5" />} run={async () => router.push(`/purchases/landed-costs/${c.id}`)}>
                      Apply
                    </ActionButton>
                  ) : (
                    <ActionButton
                      primary
                      icon={<Layers className="size-3.5" />}
                      success="Costs applied to the stock"
                      run={async () => {
                        if (!c.purchaseOrderId) throw new Error("Link a purchase order first");
                        const ok = await confirm({ title: `Apply ${c.name}?`, description: "The costs are spread across the purchase order's lines and posted. Stock still on hand gets more expensive; the share for units already sold goes to cost of sales. This can't be undone.", confirmLabel: "Apply" });
                        if (!ok) return false;
                        await postJson(`/api/v1/landed-costs/${c.id}/allocate`);
                        helpers.refresh();
                      }}
                    >
                      Apply
                    </ActionButton>
                  )}
                  <ActionButton
                    icon={<Trash2 className="size-3.5" />}
                    className="text-red-600"
                    run={async () => {
                      const ok = await confirm({ title: `Delete ${c.name}?`, description: "This removes the allocation and its cost lines.", confirmLabel: "Delete", destructive: true });
                      if (!ok) return false;
                      await deleteRecord(`/api/v1/landed-costs/${c.id}`);
                      toast.success("Allocation deleted");
                      helpers.refresh();
                    }}
                  >
                    Delete
                  </ActionButton>
                </>
              )}
              {c.purchaseOrder && (
                <ActionButton icon={<ShoppingCart className="size-3.5" />} run={async () => router.push(`/purchases/orders/${c.purchaseOrder!.id}`)}>
                  View purchase order
                </ActionButton>
              )}
              {c.bill && (
                <ActionButton icon={<FileText className="size-3.5" />} run={async () => router.push(`/purchases/${c.bill!.id}`)}>
                  View bill
                </ActionButton>
              )}
            </>
          }
        />
      ),
      create: { label: "New landed cost", onClick: () => setSheetOpen(true) },
      empty: <LandedCostsEmpty onCreate={() => setSheetOpen(true)} />,
    }),
    [router, confirm]
  );

  return (
    <>
      <Explorer config={config} />

      {/* New Allocation Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(v) => {
          if (!v) resetForm();
          setSheetOpen(v);
        }}
      >
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b">
            <SheetTitle>New landed cost</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleCreate} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name *</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shipping costs for PO-001" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Purchase order</label>
                    <PurchaseDocumentPicker kind="purchase_order" value={purchaseOrderId} onChange={(id) => setPurchaseOrderId(id)} placeholder="The goods these costs are for" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Bill</label>
                    <PurchaseDocumentPicker kind="bill" value={billId} onChange={(id) => setBillId(id)} placeholder="The freight or duty bill (optional)" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  The costs are spread across the purchase order&apos;s lines. Link its lines to stock items so the costs reach your stock.
                </p>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Split</label>
                  <Select value={allocationMethod} onValueChange={setAllocationMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="by_value">By value</SelectItem>
                      <SelectItem value="by_quantity">By quantity</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{METHOD_HINTS[allocationMethod]}</p>
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Costs *</label>
                  <Button type="button" variant="outline" size="sm" onClick={addComponent}>
                    <Plus className="mr-2 size-3.5" />
                    Add
                  </Button>
                </div>
                {components.map((comp, index) => (
                  <div key={index} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Cost {index + 1}</span>
                      {components.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeComponent(index)} className="text-red-600 hover:text-red-700">
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Description *</label>
                      <Input value={comp.description} onChange={(e) => updateComponent(index, { description: e.target.value })} placeholder="e.g. Freight charges" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Amount *</label>
                        <Input type="number" step="0.01" min="0" value={comp.amount} onChange={(e) => updateComponent(index, { amount: e.target.value })} placeholder="0.00" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Booked to</label>
                        <AccountPicker value={comp.accountId} onChange={(accountId) => updateComponent(index, { accountId })} placeholder="Landed Costs Clearing (2160)" />
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  &quot;Booked to&quot; is the account the bill for this cost was coded to, so applying moves the cost from there into your stock. Leave it empty to use Landed Costs Clearing (2160), then code the freight bill to 2160 too.
                </p>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-4 py-3 sm:px-6 sm:py-4 backdrop-blur-sm">
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700">
                {saving ? "Creating..." : "Create landed cost"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {confirmDialog}
    </>
  );
}

function LandedCostsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <EmptyState
        icon={Ship}
        title="No landed costs yet"
        description="Extra costs like freight & duty added to the cost of stock. Record them here so each item's true cost includes them."
      >
        <Button onClick={onCreate} className="bg-brand-600 hover:bg-brand-700">
          <Plus className="mr-2 size-4" />
          New landed cost
        </Button>
      </EmptyState>
    </ContentReveal>
  );
}
