"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileUploader } from "@/components/dashboard/file-uploader";
import { AccountPicker } from "@/components/dashboard/account-picker";
import { formatMoney, decimalToCents } from "@/lib/money";
import Link from "next/link";

interface ExpenseItemForm {
  date: string;
  description: string;
  amount: string;
  category: string;
  accountId: string;
  receiptFileKey: string;
  receiptFileName: string;
}

const emptyItem = (): ExpenseItemForm => ({
  date: new Date().toISOString().split("T")[0],
  description: "",
  amount: "",
  category: "",
  accountId: "",
  receiptFileKey: "",
  receiptFileName: "",
});

export default function NewExpensePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<ExpenseItemForm[]>([emptyItem()]);

  function updateItem(index: number, updates: Partial<ExpenseItemForm>) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    );
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const total = items.reduce(
    (sum, item) => sum + decimalToCents(parseFloat(item.amount) || 0),
    0
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    if (items.some((item) => !item.description.trim() || !item.amount)) {
      toast.error("Please fill in all item descriptions and amounts");
      return;
    }

    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          title,
          description: description || null,
          items: items.map((item) => ({
            date: item.date,
            description: item.description,
            amount: parseFloat(item.amount) || 0,
            category: item.category || null,
            accountId: item.accountId || null,
            receiptFileKey: item.receiptFileKey || null,
            receiptFileName: item.receiptFileName || null,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create expense claim");
      }

      const data = await res.json();
      toast.success("Expense claim created");
      router.push(`/purchases/expenses/${data.expenseClaim.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Expense Claim"
        description="Create a new expense claim for reimbursement."
      />

      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Business trip to NYC"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional description for this expense claim"
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Expense Items</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
            >
              <Plus className="mr-2 size-4" />
              Add Item
            </Button>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div
                key={index}
                className="rounded-lg border p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Item {index + 1}
                  </span>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={item.date}
                      onChange={(e) =>
                        updateItem(index, { date: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description *</Label>
                    <Input
                      value={item.description}
                      onChange={(e) =>
                        updateItem(index, { description: e.target.value })
                      }
                      placeholder="What was this expense for?"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.amount}
                      onChange={(e) =>
                        updateItem(index, { amount: e.target.value })
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Input
                      value={item.category}
                      onChange={(e) =>
                        updateItem(index, { category: e.target.value })
                      }
                      placeholder="e.g. Travel, Meals"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Account</Label>
                    <AccountPicker
                      value={item.accountId}
                      onChange={(val) =>
                        updateItem(index, { accountId: val })
                      }
                      typeFilter={["expense"]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Receipt</Label>
                    <FileUploader
                      accept="image/*,.pdf"
                      onUpload={(fileKey, fileName) =>
                        updateItem(index, {
                          receiptFileKey: fileKey,
                          receiptFileName: fileName,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3">
          <span className="text-sm font-medium">Total</span>
          <span className="text-lg font-bold font-mono tabular-nums">
            {formatMoney(total)}
          </span>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href="/purchases/expenses">Cancel</Link>
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? "Creating..." : "Create Expense Claim"}
          </Button>
        </div>
      </form>
    </div>
  );
}
