"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, TrendingDown, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import Link from "next/link";

interface DepEntry {
  id: string;
  date: string;
  amount: number;
  journalEntry: { id: string; entryNumber: number } | null;
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
  accumulatedDepreciation: number;
  netBookValue: number;
  status: string;
  disposalDate: string | null;
  disposalAmount: number | null;
  assetAccount: { code: string; name: string } | null;
  depreciationAccount: { code: string; name: string } | null;
  accumulatedDepAccount: { code: string; name: string } | null;
  depreciationEntries: DepEntry[];
}

const statusColors: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  fully_depreciated: "border-amber-200 bg-amber-50 text-amber-700",
  disposed: "border-gray-200 bg-gray-50 text-gray-700",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  fully_depreciated: "Fully Depreciated",
  disposed: "Disposed",
};

const methodLabels: Record<string, string> = {
  straight_line: "Straight Line",
  declining_balance: "Declining Balance",
};

export default function FixedAssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [disposeAmount, setDisposeAmount] = useState("");
  const [disposeDate, setDisposeDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const { confirm, dialog: confirmDialog } = useConfirm();

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/fixed-assets/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.asset) setAsset(data.asset);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  async function handleDepreciate() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/fixed-assets/${id}/depreciate`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      toast.success("Depreciation recorded");
      // Reload asset
      const data = await fetch(`/api/v1/fixed-assets/${id}`, {
        headers: { "x-organization-id": orgId },
      }).then((r) => r.json());
      if (data.asset) setAsset(data.asset);
    } else {
      const data = await res.json();
      toast.error(typeof data.error === "string" ? data.error : "Failed to record depreciation");
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
      setAsset((prev) => (prev ? { ...prev, ...data.asset, depreciationEntries: prev.depreciationEntries } : prev));
      setDisposeOpen(false);
      toast.success("Asset disposed");
    } else {
      const data = await res.json();
      toast.error(typeof data.error === "string" ? data.error : "Failed to dispose asset");
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
        {asset.status === "active" && (
          <>
            <Button
              size="sm"
              onClick={handleDepreciate}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <TrendingDown className="mr-2 size-4" />
              Record Depreciation
            </Button>
            <Dialog open={disposeOpen} onOpenChange={setDisposeOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-red-600">
                  <Trash2 className="mr-2 size-4" />
                  Dispose
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dispose Asset</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Disposal Amount (proceeds)</Label>
                    <CurrencyInput
                      prefix="$"
                      value={disposeAmount}
                      onChange={setDisposeAmount}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Disposal Date</Label>
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
                    Dispose Asset
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
        {asset.status !== "disposed" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="text-red-600"
          >
            Delete
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge
          variant="outline"
          className={statusColors[asset.status] || ""}
        >
          {statusLabels[asset.status] || asset.status}
        </Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">
          {methodLabels[asset.depreciationMethod] || asset.depreciationMethod} ·{" "}
          {asset.usefulLifeMonths} months useful life
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Purchase Price</p>
          <p className="text-xl font-bold font-mono">
            {formatMoney(asset.purchasePrice)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">
            Accumulated Depreciation
          </p>
          <p className="text-xl font-bold font-mono text-amber-600">
            {formatMoney(asset.accumulatedDepreciation)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{depPercent}%</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Net Book Value</p>
          <p className="text-xl font-bold font-mono text-emerald-600">
            {formatMoney(asset.netBookValue)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Residual Value</p>
          <p className="text-xl font-bold font-mono">
            {formatMoney(asset.residualValue)}
          </p>
        </div>
      </div>

      {/* Account mappings */}
      <div className="rounded-lg border p-4">
        <h3 className="text-sm font-semibold mb-3">Account Mappings</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Asset Account</p>
            <p>
              {asset.assetAccount
                ? `${asset.assetAccount.code} - ${asset.assetAccount.name}`
                : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Depreciation Expense Account
            </p>
            <p>
              {asset.depreciationAccount
                ? `${asset.depreciationAccount.code} - ${asset.depreciationAccount.name}`
                : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Accumulated Depreciation Account
            </p>
            <p>
              {asset.accumulatedDepAccount
                ? `${asset.accumulatedDepAccount.code} - ${asset.accumulatedDepAccount.name}`
                : "Not set"}
            </p>
          </div>
        </div>
      </div>

      {/* Disposal info */}
      {asset.status === "disposed" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold mb-2">Disposal Information</h3>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Disposal Date</p>
              <p>{asset.disposalDate || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Disposal Amount</p>
              <p className="font-mono">
                {asset.disposalAmount !== null
                  ? formatMoney(asset.disposalAmount)
                  : "N/A"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Depreciation History */}
      <div className="rounded-lg border">
        <div className="border-b bg-muted/50 px-4 py-3">
          <h3 className="text-sm font-semibold">Depreciation History</h3>
        </div>
        {asset.depreciationEntries.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No depreciation entries recorded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[360px] grid-cols-[1fr_120px_120px] gap-2 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Date</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Journal Entry</span>
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
      {confirmDialog}
    </div>
  );
}
