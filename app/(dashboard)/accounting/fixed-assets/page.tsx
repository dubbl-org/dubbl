"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Play, ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useTopbarAction } from "@/components/dashboard/topbar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton } from "@/components/dashboard/explorer/action-button";
import { DateCell, MoneyCell, MutedCell, NumberCell, StatusPill, formatDay, parseDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface FixedAsset {
  id: string;
  name: string;
  description: string | null;
  assetNumber: string;
  categoryId: string | null;
  purchaseDate: string;
  inServiceDate: string | null;
  purchasePrice: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  convention: string;
  accumulatedDepreciation: number;
  netBookValue: number;
  isCwip: boolean;
  revaluedAmount: number | null;
  status: string;
  disposalDate: string | null;
  disposalAmount: number | null;
  createdAt: string;
}

interface DepreciationRow {
  id: string;
  date: string;
  amount: number;
  journalEntryId: string | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "in_progress", label: "Not in use yet", color: "#A1A1AA", hint: "Still being built or set up, so its value isn't dropping yet" },
  { value: "active", label: "In use", color: "#0EA5E9", hint: "In use, and its value drops a little each month" },
  { value: "fully_depreciated", label: "Fully written down", color: "#10B981", hint: "Its whole cost has been spread out, so there's nothing left to write down" },
  { value: "disposed", label: "Sold or written off", color: "#D4D4D8", hint: "No longer yours: sold, scrapped or written off" },
];

const METHODS: Record<string, string> = {
  straight_line: "Evenly each month",
  declining_balance: "More at the start",
  sum_of_years_digits: "Faster early on",
  units_of_production: "Based on usage",
};

const OWNED = (a: FixedAsset) => a.status !== "disposed";

function usedPct(a: FixedAsset) {
  return a.purchasePrice > 0 ? Math.min(100, Math.max(0, Math.round(((a.purchasePrice - a.netBookValue) / a.purchasePrice) * 100))) : 0;
}

function lifeLabel(months: number) {
  if (!months) return "—";
  if (months % 12 === 0) return `${months / 12} yr${months === 12 ? "" : "s"}`;
  return months > 12 ? `${(months / 12).toFixed(1)} yrs` : `${months} mo`;
}

function lifeBucket(months: number) {
  if (months < 36) return "Under 3 years";
  if (months <= 60) return "3 to 5 years";
  if (months <= 120) return "5 to 10 years";
  return "Over 10 years";
}

/** The date the cost will have been fully spread out, if it runs to plan. */
function writtenDownBy(a: FixedAsset) {
  const start = parseDay(a.inServiceDate ?? a.purchaseDate);
  if (!start || !a.usefulLifeMonths) return null;
  return toDayKey(new Date(start.getFullYear(), start.getMonth() + a.usefulLifeMonths, start.getDate()));
}

const sumBy = (rows: FixedAsset[], pick: (a: FixedAsset) => number) => rows.reduce((s, a) => s + pick(a), 0);

function DepreciationBar({ cost, nbv, className }: { cost: number; nbv: number; className?: string }) {
  if (cost === 0) return null;
  const depPct = Math.min(((cost - nbv) / cost) * 100, 100);
  return (
    <div className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full bg-brand-500 transition-all" style={{ width: `${100 - depPct}%` }} />
      <div className={cn("h-full transition-all", depPct >= 100 ? "bg-red-500" : "bg-amber-400")} style={{ width: `${depPct}%` }} />
    </div>
  );
}

export default function FixedAssetsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [running, setRunning] = useState(false);

  useDocumentTitle("Accounting · Fixed Assets");

  // Category names, so assets can be grouped and filtered by them
  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/asset-categories?limit=100", { headers: { "x-organization-id": orgId } })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const list = (json?.data ?? []) as { id: string; name: string }[];
        setCategories(Object.fromEntries(list.map((c) => [c.id, c.name])));
      })
      .catch(() => {});
  }, []);

  useTopbarAction(
    useMemo(() => {
      async function runDepreciation() {
        const orgId = localStorage.getItem("activeOrgId");
        if (!orgId) return;
        setRunning(true);
        try {
          const res = await fetch("/api/v1/fixed-assets/run-depreciation", { method: "POST", headers: { "x-organization-id": orgId } });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            toast.success(`Value drops recorded for ${data.processed} item${data.processed === 1 ? "" : "s"}`);
            setVersion((v) => v + 1);
          } else {
            toast.error(typeof data.error === "string" ? data.error : "Couldn't record this period's value drops");
          }
        } catch {
          toast.error("Couldn't record this period's value drops");
        } finally {
          setRunning(false);
        }
      }
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 rounded-lg px-3 text-[13px]"
          onClick={runDepreciation}
          disabled={running}
          title="Record this period's drop in value across all your items at once. Safe to run twice: items already done this month are skipped"
        >
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          <span className="hidden sm:inline">{running ? "Recording..." : "Record value drops"}</span>
        </Button>
      );
    }, [running])
  );

  const config = useMemo<ExplorerConfig<FixedAsset>>(() => {
    const categoryOf = (a: FixedAsset) => (a.categoryId ? categories[a.categoryId] : undefined) ?? null;
    return {
      id: "fixed-assets",
      endpoint: "/api/v1/fixed-assets",
      noun: { one: "Asset", many: "Fixed assets" },
      getId: (a) => a.id,
      href: (a) => `/accounting/fixed-assets/${a.id}`,
      status: { get: (a) => a.status, options: STATUSES },
      date: { get: (a) => a.purchaseDate, label: "Purchase date" },
      party: { get: categoryOf, label: "Category", many: "Categories" },
      amount: (a) => a.purchasePrice,
      amountLabel: "What you paid",
      search: (a) => [a.name, a.assetNumber, a.description, categoryOf(a), METHODS[a.depreciationMethod]],
      defaultSort: { key: "purchased", dir: "desc" },
      facets: [
        { key: "method", label: "How value is spread", value: (a) => METHODS[a.depreciationMethod] ?? a.depreciationMethod },
        { key: "life", label: "Useful life", value: (a) => lifeBucket(a.usefulLifeMonths) },
      ],
      columns: [
        { key: "number", label: "Asset #", className: "w-28", value: (a) => a.assetNumber, render: (a) => <NumberCell value={a.assetNumber} /> },
        { key: "name", label: "Name", value: (a) => a.name, render: (a) => <span className="block truncate font-medium">{a.name}</span> },
        { key: "category", label: "Category", className: "w-40", value: categoryOf, render: (a) => <MutedCell value={categoryOf(a)} /> },
        { key: "purchased", label: "Purchased", className: "w-32", value: (a) => a.purchaseDate, render: (a) => <DateCell value={a.purchaseDate} /> },
        {
          key: "method",
          label: "How value is spread",
          className: "w-40",
          hint: "How the cost is spread over the item's life (its depreciation method)",
          value: (a) => METHODS[a.depreciationMethod] ?? a.depreciationMethod,
          render: (a) => <MutedCell value={METHODS[a.depreciationMethod] ?? a.depreciationMethod} />,
        },
        { key: "cost", label: "What you paid", align: "right", className: "w-32", money: true, value: (a) => a.purchasePrice },
        {
          key: "usedUp",
          label: "Value used up",
          className: "w-44",
          money: true,
          hint: "How much of the cost has been written off so far (accumulated depreciation)",
          value: (a) => a.accumulatedDepreciation,
          render: (a) => (
            <span className="block space-y-1">
              <span className="flex items-center justify-between text-[11.5px] tabular-nums">
                <span className="text-muted-foreground">{usedPct(a)}%</span>
                <span className="text-red-600 dark:text-red-400">-{formatMoney(a.accumulatedDepreciation)}</span>
              </span>
              <DepreciationBar cost={a.purchasePrice} nbv={a.netBookValue} />
            </span>
          ),
        },
        {
          key: "nbv",
          label: "Current value",
          align: "right",
          className: "w-32",
          money: true,
          hint: "What the item is worth in your books today (net book value)",
          value: (a) => a.netBookValue,
          render: (a) => <MoneyCell cents={a.netBookValue} className="font-medium" />,
        },
        { key: "status", label: "Status", className: "w-40", value: (a) => a.status, render: (a) => <StatusPill value={a.status} options={STATUSES} /> },
        { key: "inService", label: "In use since", className: "w-32", hidden: true, value: (a) => a.inServiceDate ?? a.purchaseDate, render: (a) => <DateCell value={a.inServiceDate ?? a.purchaseDate} /> },
        { key: "life", label: "Useful life", align: "right", className: "w-28", hidden: true, value: (a) => a.usefulLifeMonths, render: (a) => <span className="tabular-nums">{lifeLabel(a.usefulLifeMonths)}</span> },
        { key: "doneBy", label: "Written down by", className: "w-36", hidden: true, hint: "When the cost will be fully spread out if nothing changes", value: writtenDownBy, render: (a) => <DateCell value={writtenDownBy(a)} /> },
        { key: "residual", label: "Worth at the end", align: "right", className: "w-32", money: true, hidden: true, hint: "What you expect it to be worth when you're done with it (residual value)", value: (a) => a.residualValue },
        { key: "disposed", label: "Sold on", className: "w-32", hidden: true, value: (a) => a.disposalDate, render: (a) => <DateCell value={a.disposalDate} /> },
        { key: "disposalAmount", label: "Sold for", align: "right", className: "w-32", money: true, hidden: true, value: (a) => a.disposalAmount ?? 0 },
        { key: "description", label: "Description", hidden: true, value: (a) => a.description, render: (a) => <MutedCell value={a.description} /> },
        { key: "created", label: "Added", className: "w-32", hidden: true, value: (a) => a.createdAt, render: (a) => <DateCell value={a.createdAt} /> },
      ],
      metrics: (rows) => {
        const owned = rows.filter(OWNED);
        const cost = sumBy(owned, (a) => a.purchasePrice);
        const nbv = sumBy(owned, (a) => a.netBookValue);
        const used = sumBy(owned, (a) => a.accumulatedDepreciation);
        const year = String(new Date().getFullYear());
        const boughtThisYear = rows.filter((a) => a.purchaseDate?.startsWith(year));
        const done = rows.filter((a) => a.status === "fully_depreciated");
        const sold = rows.filter((a) => a.status === "disposed");
        const pct = (part: number) => (cost > 0 ? Math.round((part / cost) * 100) : 0);
        return [
          { key: "cost", label: "What you paid", color: "#0EA5E9", value: formatMoney(cost), note: `${owned.length} item${owned.length === 1 ? "" : "s"} you still own`, hint: "The original cost of everything you still own." },
          { key: "nbv", label: "Current value", color: "#10B981", value: formatMoney(nbv), note: `${pct(nbv)}% of what you paid`, hint: "What those items are worth in your books today, after the value drops so far." },
          { key: "used", label: "Value used up so far", color: "#F59E0B", value: formatMoney(used), note: `${pct(used)}% written off`, hint: "How much of the cost has already gone through your profit and loss as depreciation." },
          { key: "year", label: "Bought this year", color: "#8B5CF6", value: formatMoney(sumBy(boughtThisYear, (a) => a.purchasePrice)), note: `${boughtThisYear.length} item${boughtThisYear.length === 1 ? "" : "s"}`, hint: "Assets with a purchase date in this calendar year." },
          { key: "done", label: "Fully written down", color: "#14B8A6", status: "fully_depreciated", value: done.length.toLocaleString(), note: done.length ? `${formatMoney(sumBy(done, (a) => a.purchasePrice))} original cost` : "None yet", hint: "Items whose whole cost has been spread out. If you still use them, they cost you nothing more." },
          { key: "sold", label: "Sold or written off", color: "#D4D4D8", status: "disposed", value: sold.length.toLocaleString(), note: sold.length ? `Sold for ${formatMoney(sumBy(sold, (a) => a.disposalAmount ?? 0))}` : "Nothing sold", hint: "Items you no longer own." },
        ];
      },
      preview: (a) => (
        <DocumentPreview
          number={a.assetNumber}
          status={a.status}
          statusOptions={STATUSES}
          amount={a.netBookValue}
          amountLabel="current value"
          facts={[
            { label: "Name", value: a.name },
            { label: "Category", value: categoryOf(a) ?? "—" },
            { label: "What you paid", value: formatMoney(a.purchasePrice) },
            { label: "Value used up", value: `${formatMoney(a.accumulatedDepreciation)} · ${usedPct(a)}%` },
            { label: "Purchased", value: formatDay(a.purchaseDate) },
            { label: "In use since", value: formatDay(a.inServiceDate ?? a.purchaseDate) },
            { label: "How value is spread", value: METHODS[a.depreciationMethod] ?? a.depreciationMethod },
            { label: "Useful life", value: lifeLabel(a.usefulLifeMonths) },
            { label: "Worth at the end", value: formatMoney(a.residualValue) },
            a.status === "disposed"
              ? { label: "Sold for", value: `${formatMoney(a.disposalAmount ?? 0)} · ${formatDay(a.disposalDate)}` }
              : { label: "Written down by", value: formatDay(writtenDownBy(a)) },
          ]}
          actions={
            <ActionButton primary icon={<ArrowUpRight className="size-3.5" />} run={async () => router.push(`/accounting/fixed-assets/${a.id}`)}>
              Open asset
            </ActionButton>
          }
        >
          <div className="mt-5">
            <DepreciationBar cost={a.purchasePrice} nbv={a.netBookValue} className="h-2" />
            <div className="mt-2 flex items-center gap-5 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-brand-500" />
                Current value · {formatMoney(a.netBookValue)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", usedPct(a) >= 100 ? "bg-red-500" : "bg-amber-400")} />
                Used up · {formatMoney(a.accumulatedDepreciation)}
              </span>
            </div>
          </div>
          {a.description && (
            <div className="mt-5">
              <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">Description</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{a.description}</p>
            </div>
          )}
          <DepreciationHistory id={a.id} />
        </DocumentPreview>
      ),
      empty: <AssetsEmpty onCreate={() => openDrawer("fixedAsset")} />,
    };
  }, [categories, openDrawer, router]);

  return <Explorer key={version} config={config} />;
}

/** The value drops recorded so far for one asset, newest first. */
function DepreciationHistory({ id }: { id: string }) {
  const [state, setState] = useState<{ id: string; rows: DepreciationRow[] } | null>(null);
  const loading = state?.id !== id;

  useEffect(() => {
    let cancelled = false;
    const orgId = localStorage.getItem("activeOrgId");
    fetch(`/api/v1/fixed-assets/${id}`, { headers: orgId ? { "x-organization-id": orgId } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) setState({ id, rows: ((json?.asset?.depreciationEntries as DepreciationRow[] | undefined) ?? []).slice().reverse() });
      })
      .catch(() => {
        if (!cancelled) setState({ id, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const rows = !loading && state ? state.rows : [];
  return (
    <div className="mt-6">
      <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">
        Value drops recorded{!loading && rows.length > 0 && <span className="ml-1 text-muted-foreground/70">· {rows.length}</span>}
      </p>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">No value drops recorded yet</p>
      ) : (
        <div className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/80">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2 text-[13px]">
              <span className="tabular-nums text-foreground/80">{formatDay(r.date)}</span>
              <span className="tabular-nums text-red-600 dark:text-red-400">-{formatMoney(r.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div className="flex flex-col items-center gap-10 pt-16 pb-12">
        {/* Asset lifecycle stepper */}
        <div className="w-full max-w-xl">
          <div className="grid grid-cols-3 gap-0">
            {[
              { step: "1", label: "Add assets", sub: "Register your equipment, vehicles, and property", color: "bg-blue-500", ring: "ring-blue-200 dark:ring-blue-900" },
              { step: "2", label: "Spread the cost", sub: "Choose how each item's cost spreads over its useful life", color: "bg-amber-500", ring: "ring-amber-200 dark:ring-amber-900" },
              { step: "3", label: "Track value", sub: "Watch current values and record the drop each month", color: "bg-brand-500", ring: "ring-brand-200 dark:ring-brand-900" },
            ].map(({ step, label, sub, color, ring }, i) => (
              <div key={step} className="flex flex-col items-center text-center relative">
                {i < 2 && <div className="absolute top-4 left-[calc(50%+16px)] w-[calc(100%-32px)] h-px bg-border" />}
                <div className={`relative z-10 flex size-8 items-center justify-center rounded-full ${color} ring-4 ${ring} text-white text-xs font-bold`}>{step}</div>
                <p className="mt-3 text-sm font-medium">{label}</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-[150px] leading-relaxed">{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-lg font-semibold tracking-tight">Track your fixed assets</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Add your first item to start tracking how its value drops over time.</p>
          <Button onClick={onCreate} size="lg" className="mt-5 bg-brand-600 hover:bg-brand-700">
            <Plus className="mr-2 size-4" />
            Add item
          </Button>
        </div>

        {/* Preview stat cards (empty) */}
        <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-3 gap-3 opacity-40">
          {[
            { label: "Total cost", value: "$0.00" },
            { label: "Current value", value: "$0.00" },
            { label: "Value used up", value: "$0.00" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-dashed p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-mono font-medium text-muted-foreground">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </ContentReveal>
  );
}
