"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

export default function NewFixedAssetPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assetNumber, setAssetNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [purchasePrice, setPurchasePrice] = useState("");
  const [residualValue, setResidualValue] = useState("");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState("60");
  const [depreciationMethod, setDepreciationMethod] = useState("straight_line");
  const [assetAccountId, setAssetAccountId] = useState("");
  const [depreciationAccountId, setDepreciationAccountId] = useState("");
  const [accumulatedDepAccountId, setAccumulatedDepAccountId] = useState("");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.accounts) setAccounts(data.accounts);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !assetNumber || !purchasePrice) {
      toast.error("Please fill in required fields");
      return;
    }
    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/fixed-assets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name,
          description: description || null,
          assetNumber,
          purchaseDate,
          purchasePrice: Math.round(parseFloat(purchasePrice) * 100),
          residualValue: residualValue
            ? Math.round(parseFloat(residualValue) * 100)
            : 0,
          usefulLifeMonths: parseInt(usefulLifeMonths) || 60,
          depreciationMethod,
          assetAccountId: assetAccountId || null,
          depreciationAccountId: depreciationAccountId || null,
          accumulatedDepAccountId: accumulatedDepAccountId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create asset");
      }

      const data = await res.json();
      toast.success("Fixed asset created");
      router.push(`/fixed-assets/${data.asset.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create asset"
      );
    } finally {
      setSaving(false);
    }
  }

  const assetAccounts = accounts.filter((a) => a.type === "asset");
  const expenseAccounts = accounts.filter((a) => a.type === "expense");

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Fixed Asset"
        description="Add a capital asset to track depreciation."
      />
      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Asset Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Office Equipment"
            />
          </div>
          <div className="space-y-2">
            <Label>Asset Number *</Label>
            <Input
              value={assetNumber}
              onChange={(e) => setAssetNumber(e.target.value)}
              placeholder="FA-001"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description of the asset..."
            rows={2}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Purchase Date *</Label>
            <Input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Purchase Price *</Label>
            <Input
              type="number"
              step="0.01"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              placeholder="10000.00"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Residual Value</Label>
            <Input
              type="number"
              step="0.01"
              value={residualValue}
              onChange={(e) => setResidualValue(e.target.value)}
              placeholder="500.00"
            />
          </div>
          <div className="space-y-2">
            <Label>Useful Life (months)</Label>
            <Input
              type="number"
              value={usefulLifeMonths}
              onChange={(e) => setUsefulLifeMonths(e.target.value)}
              placeholder="60"
            />
          </div>
          <div className="space-y-2">
            <Label>Depreciation Method</Label>
            <Select
              value={depreciationMethod}
              onValueChange={setDepreciationMethod}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="straight_line">Straight Line</SelectItem>
                <SelectItem value="declining_balance">
                  Declining Balance
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Asset Account</Label>
            <Select value={assetAccountId} onValueChange={setAssetAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {assetAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Depreciation Expense Account</Label>
            <Select
              value={depreciationAccountId}
              onValueChange={setDepreciationAccountId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {expenseAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Accumulated Dep. Account</Label>
            <Select
              value={accumulatedDepAccountId}
              onValueChange={setAccumulatedDepAccountId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {assetAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href="/fixed-assets">Cancel</Link>
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? "Creating..." : "Create Asset"}
          </Button>
        </div>
      </form>
    </div>
  );
}
