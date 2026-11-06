"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  TrendingDown,
  TrendingUp,
  Trash2,
  Undo2,
  PackageCheck,
  ChevronDown,
  CircleSlash,
  Hammer,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { AccountPicker } from "@/components/dashboard/account-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import Link from "next/link";
import { useApi, useApiCache } from "@/lib/query/use-api";
import { methodName, conventionLabel } from "@/lib/fixed-assets/labels";

interface DepEntry {
  id: string;
  date: string;
  amount: number;
  journalEntry: { id: string; entryNumber: number } | null;
}

interface RevaluationEntry {
  id: string;
  date: string;
  previousCarryingAmount: number;
  revaluedAmount: number;
  changeAmount: number;
  isImpairment: boolean;
  notes: string | null;
  journalEntry?: { id: string; entryNumber: number } | null;
}

interface CwipCostEntry {
  id: string;
  date: string;
  description: string | null;
  amount: number;
  journalEntry?: { id: string; entryNumber: number } | null;
}

interface AssetDetail {
  id: string;
  name: string;
  description: string | null;
  assetNumber: string;
  purchaseDate: string;
  purchasePrice: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  convention?: string;
  depreciationRateBp?: number | null;
  totalExpectedUnits?: number | null;
  unitOfMeasure?: string | null;
  accumulatedDepreciation: number;
  netBookValue: number;
  status: string;
  isCwip?: boolean;
  disposalDate: string | null;
  disposalAmount: number | null;
  assetAccount: { code: string; name: string } | null;
  depreciationAccount: { code: string; name: string } | null;
  accumulatedDepAccount: { code: string; name: string } | null;
  depreciationEntries: DepEntry[];
  revaluations?: RevaluationEntry[];
}

const statusColors: Record<string, string> = {
  active: "border-brand-200 bg-brand-50 text-brand-700",
  fully_depreciated: "border-amber-200 bg-amber-50 text-amber-700",
  disposed: "border-gray-200 bg-gray-50 text-gray-700",
  in_progress: "border-blue-200 bg-blue-50 text-blue-700",
};

// Plain-language status labels: end users aren't accountants.
const statusLabels: Record<string, string> = {
  active: "In use",
  fully_depreciated: "Fully written down",
  disposed: "Sold or written off",
  in_progress: "Not in use yet",
};


export default function FixedAssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const url = `/api/v1/fixed-assets/${id}`;
  const { data, loading } = useApi<{ asset?: AssetDetail }>(url);
  // Construction costs are served by their own endpoint so the history is
  // reliable regardless of what the asset GET embeds.
  const { data: cwipData } = useApi<{ costs?: CwipCostEntry[] }>(`/api/v1/fixed-assets/${id}/cwip-cost`);
  const cache = useApiCache();
  const asset = data?.asset ?? null;
  const cwipCosts = cwipData?.costs ?? [];
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [disposeAmount, setDisposeAmount] = useState("");
  const [disposeDate, setDisposeDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const today = new Date().toISOString().split("T")[0];
  // Revalue (new, higher value) dialog state.
  const [revalueOpen, setRevalueOpen] = useState(false);
  const [revalueAmount, setRevalueAmount] = useState("");
  const [revalueDate, setRevalueDate] = useState(today);
  const [revalueNotes, setRevalueNotes] = useState("");
  // Impair (write down value) dialog state.
  const [impairOpen, setImpairOpen] = useState(false);
  const [impairAmount, setImpairAmount] = useState("");
  const [impairDate, setImpairDate] = useState(today);
  const [impairNotes, setImpairNotes] = useState("");
  // Bring into use (capitalize) dialog state.
  const [capitalizeOpen, setCapitalizeOpen] = useState(false);
  const [capitalizeDate, setCapitalizeDate] = useState(today);
  // Add construction cost (CWIP) dialog state.
  const [costOpen, setCostOpen] = useState(false);
  const [costAmount, setCostAmount] = useState("");
  const [costDate, setCostDate] = useState(today);
  const [costDescription, setCostDescription] = useState("");
  const [costSourceAccountId, setCostSourceAccountId] = useState("");
  // Usage reading for units-of-production assets.
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [unitsValue, setUnitsValue] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  useDocumentTitle("Accounting \u00B7 Asset Details");

  async function handleDepreciate(unitsThisPeriod?: number) {
    if (!orgId) return;
    // Usage-based items need this period's reading first.
    if (asset?.depreciationMethod === "units_of_production" && unitsThisPeriod === undefined) {
      setUnitsValue("");
      setUnitsOpen(true);
      return;
    }
    const res = await fetch(`/api/v1/fixed-assets/${id}/depreciate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify(unitsThisPeriod !== undefined ? { unitsThisPeriod } : {}),
    });
    if (res.ok) {
      setUnitsOpen(false);
      toast.success("Value drop recorded for this month");
    } else {
      const data = await res.json();
      toast.error(typeof data.error === "string" ? data.error : "Couldn't record the value drop");
    }
  }

  async function handleUndoDepreciation() {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Undo the last value drop?",
      description:
        "This reverses the most recent value drop for this item and removes its bookkeeping entry. You can record it again afterwards.",
      confirmLabel: "Undo it",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/fixed-assets/${id}/rollback-depreciation`,
        { method: "POST", headers: { "x-organization-id": orgId } }
      );
      if (res.ok) {
        toast.success("Last value drop undone");
      } else {
        const data = await res.json();
        toast.error(
          typeof data.error === "string"
            ? data.error
            : "Couldn't undo the last value drop"
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRevalue() {
    if (!orgId) return;
    const amount = Math.round(parseFloat(revalueAmount || "0") * 100);
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/fixed-assets/${id}/revalue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          revaluedAmount: amount,
          date: revalueDate,
          notes: revalueNotes || undefined,
        }),
      });
      if (res.ok) {
        setRevalueOpen(false);
        setRevalueAmount("");
        setRevalueNotes("");
        toast.success("New, higher value recorded");
      } else {
        const data = await res.json();
        toast.error(
          typeof data.error === "string"
            ? data.error
            : "Couldn't record the new value"
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleImpair() {
    if (!orgId) return;
    const amount = Math.round(parseFloat(impairAmount || "0") * 100);
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/fixed-assets/${id}/impair`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          revaluedAmount: amount,
          date: impairDate,
          notes: impairNotes || undefined,
        }),
      });
      if (res.ok) {
        setImpairOpen(false);
        setImpairAmount("");
        setImpairNotes("");
        toast.success("Lower value recorded");
      } else {
        const data = await res.json();
        toast.error(
          typeof data.error === "string"
            ? data.error
            : "Couldn't write down the value"
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCapitalize() {
    if (!orgId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/fixed-assets/${id}/capitalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ date: capitalizeDate }),
      });
      if (res.ok) {
        setCapitalizeOpen(false);
        toast.success("Item brought into use");
      } else {
        const data = await res.json();
        toast.error(
          typeof data.error === "string"
            ? data.error
            : "Couldn't bring this item into use"
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAddCost() {
    if (!orgId) return;
    const amount = Math.round(parseFloat(costAmount || "0") * 100);
    if (amount <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    if (!costSourceAccountId) {
      toast.error("Choose where the money came from");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/fixed-assets/${id}/cwip-cost`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          amount,
          date: costDate,
          description: costDescription || undefined,
          sourceAccountId: costSourceAccountId,
        }),
      });
      if (res.ok) {
        setCostOpen(false);
        setCostAmount("");
        setCostDescription("");
        setCostSourceAccountId("");
        toast.success("Construction cost added");
      } else {
        const data = await res.json();
        toast.error(
          typeof data.error === "string"
            ? data.error
            : "Couldn't add the construction cost"
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDispose() {
    if (!orgId) return;
    const amount = Math.round(parseFloat(disposeAmount || "0") * 100);

    const res = await fetch(`/api/v1/fixed-assets/${id}/dispose`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-organization-id": orgId,
      },
      body: JSON.stringify({ disposalAmount: amount, date: disposeDate }),
    });

    if (res.ok) {
      const data = await res.json();
      cache.update<{ asset?: AssetDetail }>(url, (prev) => (prev.asset ? { ...prev, asset: { ...prev.asset, ...data.asset, depreciationEntries: prev.asset.depreciationEntries } } : prev));
      setDisposeOpen(false);
      toast.success("Item recorded as sold or written off");
    } else {
      const data = await res.json();
      toast.error(typeof data.error === "string" ? data.error : "Couldn't record the sale or write-off");
    }
  }

  async function handleDelete() {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Delete this asset?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/api/v1/fixed-assets/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      toast.success("Asset deleted");
      router.push("/accounting/fixed-assets");
    } else {
      toast.error("Failed to delete asset");
    }
  }

  if (loading)
    return (
      <div className="space-y-6">
        <PageHeader title="Loading..." />
      </div>
    );
  if (!asset)
    return (
      <div className="space-y-6">
        <PageHeader title="Asset not found" />
      </div>
    );

  const depPercent =
    asset.purchasePrice > 0
      ? Math.round(
          (asset.accumulatedDepreciation / asset.purchasePrice) * 100
        )
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${asset.assetNumber} - ${asset.name}`}
        description={asset.description || undefined}
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/accounting/fixed-assets">
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Link>
        </Button>
        {(asset.isCwip || asset.status === "in_progress") &&
          asset.status !== "disposed" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCostOpen(true)}
                title="Add money spent building or preparing this item before it's in use"
              >
                <Hammer className="mr-2 size-4" />
                Add construction cost
              </Button>
              <Button
                size="sm"
                onClick={() => setCapitalizeOpen(true)}
                className="bg-brand-600 hover:bg-brand-700"
                title="Mark this item as ready and in use, so its value starts spreading over time"
              >
                <PackageCheck className="mr-2 size-4" />
                Bring into use
              </Button>
            </>
          )}
        {asset.status === "active" && (
          <>
            <Button
              size="sm"
              onClick={() => handleDepreciate()}
              className="bg-brand-600 hover:bg-brand-700"
              title="Record this month's drop in value (once a month; spreads its cost over time)"
            >
              <TrendingDown className="mr-2 size-4" />
              Record value drop
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  More actions
                  <ChevronDown className="ml-1.5 size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  onClick={() => setRevalueOpen(true)}
                  title="The item is worth more than its current value — record the higher value"
                >
                  <TrendingUp className="mr-2 size-4" />
                  Record a higher value
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setImpairOpen(true)}
                  title="The item is worth less than its current value — write it down to the lower value"
                >
                  <CircleSlash className="mr-2 size-4" />
                  Write down to a lower value
                </DropdownMenuItem>
                {asset.depreciationEntries.length > 0 && (
                  <DropdownMenuItem
                    onClick={handleUndoDepreciation}
                    title="Reverse the most recent value drop you recorded"
                  >
                    <Undo2 className="mr-2 size-4" />
                    Undo last value drop
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDisposeOpen(true)}
                  className="text-red-600"
                  title="Record that you sold this item or it's no longer in use"
                >
                  <Trash2 className="mr-2 size-4" />
                  Record as sold or written off
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {asset.status !== "disposed" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="text-red-600"
            title="Remove this item from your records entirely"
          >
            Delete
          </Button>
        )}
      </PageHeader>

      {/* Record as sold or written off */}
      {/* Units used this month (units-of-production) */}
      <Dialog open={unitsOpen} onOpenChange={setUnitsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How much was it used this month?</DialogTitle>
            <DialogDescription>
              This item loses value by use. Enter this month&apos;s usage
              {asset.totalExpectedUnits ? ` out of ${asset.totalExpectedUnits.toLocaleString()} ${asset.unitOfMeasure || "units"} over its life` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Used this month ({asset.unitOfMeasure || "units"})</Label>
              <Input
                type="number"
                min={1}
                value={unitsValue}
                onChange={(e) => setUnitsValue(e.target.value)}
                placeholder="e.g. 1200"
              />
            </div>
            <Button
              onClick={() => {
                const units = parseInt(unitsValue, 10);
                if (!units || units <= 0) {
                  toast.error("Enter how much it was used");
                  return;
                }
                void handleDepreciate(units);
              }}
              className="w-full bg-brand-600 hover:bg-brand-700"
            >
              Record value drop
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={disposeOpen} onOpenChange={setDisposeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record as sold or written off</DialogTitle>
            <DialogDescription>
              Use this when you&apos;ve sold the item or it&apos;s no longer in
              use. It will be removed from the items you&apos;re still tracking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount you got for it</Label>
              <CurrencyInput
                prefix="$"
                value={disposeAmount}
                onChange={setDisposeAmount}
              />
              <p className="text-xs text-muted-foreground">
                Enter 0 if you didn&apos;t get any money for it.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Date it was sold or stopped being used</Label>
              <Input
                type="date"
                value={disposeDate}
                onChange={(e) => setDisposeDate(e.target.value)}
              />
            </div>
            <Button
              onClick={handleDispose}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              Record as sold or written off
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record a higher value */}
      <Dialog open={revalueOpen} onOpenChange={setRevalueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a higher value</DialogTitle>
            <DialogDescription>
              Use this when the item is now worth more than its current value
              (for example after a professional valuation).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New value (must be higher than current)</Label>
              <CurrencyInput
                prefix="$"
                value={revalueAmount}
                onChange={setRevalueAmount}
              />
              <p className="text-xs text-muted-foreground">
                Current value: {formatMoney(asset.netBookValue)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={revalueDate}
                onChange={(e) => setRevalueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={revalueNotes}
                onChange={(e) => setRevalueNotes(e.target.value)}
                placeholder="Why is the value changing?"
              />
            </div>
            <Button
              onClick={handleRevalue}
              disabled={busy}
              className="w-full bg-brand-600 hover:bg-brand-700"
            >
              Save new value
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Write down to a lower value */}
      <Dialog open={impairOpen} onOpenChange={setImpairOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write down to a lower value</DialogTitle>
            <DialogDescription>
              Use this when the item is now worth less than its current value
              (for example it&apos;s damaged or out of date).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New value (must be lower than current)</Label>
              <CurrencyInput
                prefix="$"
                value={impairAmount}
                onChange={setImpairAmount}
              />
              <p className="text-xs text-muted-foreground">
                Current value: {formatMoney(asset.netBookValue)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={impairDate}
                onChange={(e) => setImpairDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={impairNotes}
                onChange={(e) => setImpairNotes(e.target.value)}
                placeholder="Why is the value dropping?"
              />
            </div>
            <Button
              onClick={handleImpair}
              disabled={busy}
              className="w-full"
            >
              Save lower value
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bring into use (capitalize) */}
      <Dialog open={capitalizeOpen} onOpenChange={setCapitalizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bring into use</DialogTitle>
            <DialogDescription>
              Mark this item as ready and in use. Its value will start spreading
              over time from this date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Date it started being used</Label>
              <Input
                type="date"
                value={capitalizeDate}
                onChange={(e) => setCapitalizeDate(e.target.value)}
              />
            </div>
            <Button
              onClick={handleCapitalize}
              disabled={busy}
              className="w-full bg-brand-600 hover:bg-brand-700"
            >
              Bring into use
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add construction cost (CWIP) */}
      <Dialog open={costOpen} onOpenChange={setCostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add construction cost</DialogTitle>
            <DialogDescription>
              Record money spent building or preparing this item before it&apos;s
              in use. It&apos;s added to what the item has cost you so far and
              recorded in your books.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <CurrencyInput
                prefix="$"
                value={costAmount}
                onChange={setCostAmount}
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={costDate}
                onChange={(e) => setCostDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Where the money came from</Label>
              <AccountPicker
                value={costSourceAccountId}
                onChange={setCostSourceAccountId}
                placeholder="Choose an account (e.g. bank)"
              />
              <p className="text-xs text-muted-foreground">
                The account this cost was paid from or charged to.
              </p>
            </div>
            <div className="space-y-2">
              <Label>What it was for (optional)</Label>
              <Textarea
                value={costDescription}
                onChange={(e) => setCostDescription(e.target.value)}
                placeholder="e.g. Contractor labour, materials"
              />
            </div>
            <Button
              onClick={handleAddCost}
              disabled={busy}
              className="w-full bg-brand-600 hover:bg-brand-700"
            >
              Add cost
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge
          variant="outline"
          className={statusColors[asset.status] || ""}
        >
          {statusLabels[asset.status] || asset.status}
        </Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">
          {methodName(asset.depreciationMethod)}
          {asset.depreciationMethod === "declining_balance" && (
            <> at {asset.depreciationRateBp ? `${asset.depreciationRateBp / 100}%` : "double the straight-line rate"} a year</>
          )}{" "}
          ·{" "}
          {asset.depreciationMethod === "units_of_production"
            ? `spread over ${asset.totalExpectedUnits?.toLocaleString() ?? "?"} ${asset.unitOfMeasure || "units"} of use`
            : `value spread over ${asset.usefulLifeMonths} months`}
          {asset.convention && asset.depreciationMethod !== "units_of_production" && (
            <> · {conventionLabel(asset.convention)}</>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">What you paid</p>
          <p className="text-xl font-bold font-mono">
            {formatMoney(asset.purchasePrice)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">
            Value used up so far
          </p>
          <p className="text-xl font-bold font-mono text-amber-600">
            {formatMoney(asset.accumulatedDepreciation)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{depPercent}%</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Current value</p>
          <p className="text-xl font-bold font-mono text-brand-600">
            {formatMoney(asset.netBookValue)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">
            Value left at the end
          </p>
          <p className="text-xl font-bold font-mono">
            {formatMoney(asset.residualValue)}
          </p>
        </div>
      </div>

      {/* Bookkeeping accounts */}
      <div className="rounded-lg border p-4">
        <h3 className="text-sm font-semibold mb-3">Bookkeeping accounts</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Where the value of this item and its drop in value are recorded in
          your books.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Where the item is held</p>
            <p>
              {asset.assetAccount
                ? `${asset.assetAccount.code} - ${asset.assetAccount.name}`
                : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Where the value drop is recorded as a cost
            </p>
            <p>
              {asset.depreciationAccount
                ? `${asset.depreciationAccount.code} - ${asset.depreciationAccount.name}`
                : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Where the total value used up is tracked
            </p>
            <p>
              {asset.accumulatedDepAccount
                ? `${asset.accumulatedDepAccount.code} - ${asset.accumulatedDepAccount.name}`
                : "Not set"}
            </p>
          </div>
        </div>
      </div>

      {/* Sale / write-off info */}
      {asset.status === "disposed" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold mb-2">
            Sale or write-off details
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">
                Date sold or stopped being used
              </p>
              <p>{asset.disposalDate || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Amount you got for it</p>
              <p className="font-mono">
                {asset.disposalAmount !== null
                  ? formatMoney(asset.disposalAmount)
                  : "N/A"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Value drop history */}
      <div className="rounded-lg border">
        <div className="border-b bg-muted/50 px-4 py-3">
          <h3 className="text-sm font-semibold">Value drops over time</h3>
        </div>
        {asset.depreciationEntries.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No value drops recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[360px] grid-cols-[1fr_120px_120px] gap-2 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Date</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Bookkeeping entry</span>
            </div>
            {asset.depreciationEntries.map((entry) => (
              <div
                key={entry.id}
                className="grid min-w-[360px] grid-cols-[1fr_120px_120px] gap-2 border-b px-4 py-2 last:border-b-0"
              >
                <span className="text-sm">{entry.date}</span>
                <span className="text-right text-sm font-mono">
                  {formatMoney(entry.amount)}
                </span>
                <span className="text-right text-sm text-muted-foreground">
                  {entry.journalEntry
                    ? `#${entry.journalEntry.entryNumber}`
                    : "-"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Construction costs (CWIP) */}
      {(asset.isCwip ||
        asset.status === "in_progress" ||
        cwipCosts.length > 0) && (
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-3">
            <h3 className="text-sm font-semibold">Construction costs</h3>
            {cwipCosts.length > 0 && (
              <span className="text-sm font-mono text-muted-foreground">
                Total:{" "}
                {formatMoney(
                  cwipCosts.reduce((s, c) => s + c.amount, 0)
                )}
              </span>
            )}
          </div>
          {cwipCosts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No construction costs recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[480px] grid-cols-[120px_1fr_120px_120px] gap-2 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span>Date</span>
                <span>What it was for</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Bookkeeping entry</span>
              </div>
              {cwipCosts.map((cost) => (
                <div
                  key={cost.id}
                  className="grid min-w-[480px] grid-cols-[120px_1fr_120px_120px] gap-2 border-b px-4 py-2 last:border-b-0"
                >
                  <span className="text-sm">{cost.date}</span>
                  <span className="text-sm text-muted-foreground">
                    {cost.description || "-"}
                  </span>
                  <span className="text-right text-sm font-mono">
                    {formatMoney(cost.amount)}
                  </span>
                  <span className="text-right text-sm text-muted-foreground">
                    {cost.journalEntry
                      ? `#${cost.journalEntry.entryNumber}`
                      : "-"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Value changes (revaluations / write-downs) */}
      {asset.revaluations && asset.revaluations.length > 0 && (
        <div className="rounded-lg border">
          <div className="border-b bg-muted/50 px-4 py-3">
            <h3 className="text-sm font-semibold">Value changes over time</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Times you recorded a higher value or wrote the item down.
            </p>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[560px] grid-cols-[110px_1fr_130px_130px_110px] gap-2 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Date</span>
              <span>Type</span>
              <span className="text-right">New value</span>
              <span className="text-right">Change</span>
              <span className="text-right">Entry</span>
            </div>
            {asset.revaluations.map((rev) => (
              <div
                key={rev.id}
                className="grid min-w-[560px] grid-cols-[110px_1fr_130px_130px_110px] gap-2 border-b px-4 py-2 last:border-b-0"
              >
                <span className="text-sm">{rev.date}</span>
                <span className="text-sm">
                  {rev.isImpairment ? (
                    <span className="inline-flex items-center text-amber-700">
                      <CircleSlash className="mr-1.5 size-3.5" />
                      Written down
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-brand-700">
                      <TrendingUp className="mr-1.5 size-3.5" />
                      Higher value
                    </span>
                  )}
                  {rev.notes && (
                    <span className="block text-xs text-muted-foreground">
                      {rev.notes}
                    </span>
                  )}
                </span>
                <span className="text-right text-sm font-mono">
                  {formatMoney(rev.revaluedAmount)}
                </span>
                <span
                  className={`text-right text-sm font-mono ${
                    rev.changeAmount < 0
                      ? "text-amber-600"
                      : "text-brand-600"
                  }`}
                >
                  {rev.changeAmount < 0 ? "-" : "+"}
                  {formatMoney(Math.abs(rev.changeAmount))}
                </span>
                <span className="text-right text-sm text-muted-foreground">
                  {rev.journalEntry
                    ? `#${rev.journalEntry.entryNumber}`
                    : "-"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
