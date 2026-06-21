"use client";

import { useState, useEffect } from "react";
import { PackageCheck, ShieldAlert, Percent, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { toast } from "sonner";

interface ProcurementSettings {
  priceTolerancePercent: number; // basis points (500 = 5%)
  qtyTolerancePercent: number; // basis points (500 = 5%)
  requireGrnBeforeBill: boolean;
  blockOverBill: boolean;
}

const DEFAULT_SETTINGS: ProcurementSettings = {
  priceTolerancePercent: 0,
  qtyTolerancePercent: 0,
  requireGrnBeforeBill: false,
  blockOverBill: false,
};

// Tolerances are stored in basis points (500 = 5%); display & edit as percent.
function bpsToPercent(bps: number): string {
  return String(bps / 100);
}

function percentToBps(percent: string): number {
  const n = Number(percent);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export default function ProcurementSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ProcurementSettings>(DEFAULT_SETTINGS);
  const [priceInput, setPriceInput] = useState("0");
  const [qtyInput, setQtyInput] = useState("0");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/procurement-settings", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.procurementSettings) {
          const s = data.procurementSettings as ProcurementSettings;
          setSettings(s);
          setPriceInput(bpsToPercent(s.priceTolerancePercent));
          setQtyInput(bpsToPercent(s.qtyTolerancePercent));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    setSaving(true);
    try {
      const res = await fetch("/api/v1/procurement-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          priceTolerancePercent: percentToBps(priceInput),
          qtyTolerancePercent: percentToBps(qtyInput),
          requireGrnBeforeBill: settings.requireGrnBeforeBill,
          blockOverBill: settings.blockOverBill,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      const data = await res.json();
      if (data.procurementSettings) {
        const s = data.procurementSettings as ProcurementSettings;
        setSettings(s);
        setPriceInput(bpsToPercent(s.priceTolerancePercent));
        setQtyInput(bpsToPercent(s.qtyTolerancePercent));
      }
      toast.success("Bill matching settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal>
      <div className="space-y-6 px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Bill Matching</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Control how supplier bills are checked against orders and goods received
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
              <Save className="size-3" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Tolerances */}
        <div className="rounded-lg border divide-y">
          <div className="flex items-center gap-4 px-4 py-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg text-blue-500 bg-blue-500/10">
              <Percent className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Allowed price difference</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                How much a bill&apos;s price can be above the order before it&apos;s flagged
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="h-8 w-20 text-sm text-right"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>

          <div className="flex items-center gap-4 px-4 py-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg text-indigo-500 bg-indigo-500/10">
              <Percent className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Allowed quantity difference</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                How much a bill&apos;s quantity can be above what was ordered before it&apos;s flagged
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                className="h-8 w-20 text-sm text-right"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        {/* Rules */}
        <div className="rounded-lg border divide-y">
          <div className="flex items-center gap-4 px-4 py-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg text-emerald-500 bg-emerald-500/10">
              <PackageCheck className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Require goods to be received first</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                A supplier bill can&apos;t be entered until the goods have been marked as received
              </p>
            </div>
            <Switch
              checked={settings.requireGrnBeforeBill}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, requireGrnBeforeBill: v }))}
              className="scale-90 shrink-0"
            />
          </div>

          <div className="flex items-center gap-4 px-4 py-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg text-amber-500 bg-amber-500/10">
              <ShieldAlert className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Block bills that charge more than ordered</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Stop a bill from being saved when its total is higher than the order allows (beyond the price difference above)
              </p>
            </div>
            <Switch
              checked={settings.blockOverBill}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, blockOverBill: v }))}
              className="scale-90 shrink-0"
            />
          </div>
        </div>
      </div>
    </ContentReveal>
  );
}
