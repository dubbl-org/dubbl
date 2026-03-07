"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Check,
  X,
  DollarSign,
  Trash2,
  FileText,
  Pencil,
  Plus,
  Image as ImageIcon,
  Download,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileUploader } from "@/components/dashboard/file-uploader";
import { AccountPicker } from "@/components/dashboard/account-picker";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { formatMoney, centsToDecimal, decimalToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ExpenseDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  totalAmount: number;
  currencyCode: string;
  rejectionReason: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  paidAt: string | null;
  submittedByUser: { name: string | null; email: string } | null;
  approvedByUser: { name: string | null; email: string } | null;
  items: {
    id: string;
    date: string;
    description: string;
    amount: number;
    category: string | null;
    receiptFileKey: string | null;
    receiptFileName: string | null;
    account: { code: string; name: string } | null;
  }[];
}

interface EditItem {
  date: string;
  description: string;
  amount: string;
  category: string;
  accountId: string;
  receiptFileKey: string;
  receiptFileName: string;
}

const statusConfig: Record<string, { class: string; dot: string }> = {
  draft: { class: "", dot: "bg-gray-400" },
  submitted: {
    class: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  approved: {
    class: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  rejected: {
    class: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
    dot: "bg-red-500",
  },
  paid: {
    class: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300",
    dot: "bg-purple-500",
  },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ReceiptViewer({ fileKey, fileName }: { fileKey: string; fileName: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadUrl = useCallback(async () => {
    if (url) return;
    setLoading(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/expenses/receipt-url?fileKey=${encodeURIComponent(fileKey)}`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.downloadUrl) setUrl(data.downloadUrl);
    } finally {
      setLoading(false);
    }
  }, [fileKey, url]);

  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) loadUrl(); }}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 transition-colors group">
          {isImage ? <ImageIcon className="size-3.5" /> : <FileText className="size-3.5" />}
          <span className="max-w-[100px] truncate text-xs group-hover:underline">{fileName}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4" />
            {fileName}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : url ? (
            <div className="space-y-3">
              {isImage ? (
                <div className="rounded-lg border overflow-hidden bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={fileName} className="w-full h-auto max-h-[60vh] object-contain" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 rounded-lg border bg-muted/30">
                  <FileText className="size-12 text-muted-foreground/40" />
                  <p className="mt-3 text-sm text-muted-foreground">Preview not available for this file type</p>
                </div>
              )}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" asChild>
                  <a href={url} target="_blank" rel="noopener noreferrer" download={fileName}>
                    <Download className="mr-2 size-3.5" />
                    Download
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Failed to load receipt</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [claim, setClaim] = useState<ExpenseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editItems, setEditItems] = useState<EditItem[]>([]);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEntityTitle(claim?.title);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/expenses/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.expenseClaim) setClaim(data.expenseClaim);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  function startEditing() {
    if (!claim) return;
    setEditTitle(claim.title);
    setEditDescription(claim.description || "");
    setEditItems(
      claim.items.map((item) => ({
        date: item.date,
        description: item.description,
        amount: centsToDecimal(item.amount),
        category: item.category || "",
        accountId: "",
        receiptFileKey: item.receiptFileKey || "",
        receiptFileName: item.receiptFileName || "",
      }))
    );
    setEditing(true);
  }

  function updateEditItem(index: number, updates: Partial<EditItem>) {
    setEditItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  }

  function addEditItem() {
    setEditItems((prev) => [
      ...prev,
      { date: new Date().toISOString().split("T")[0], description: "", amount: "", category: "", accountId: "", receiptFileKey: "", receiptFileName: "" },
    ]);
  }

  function removeEditItem(index: number) {
    if (editItems.length <= 1) return;
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSaveEdit() {
    if (!orgId || !editTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    if (editItems.some((item) => !item.description.trim() || !item.amount)) {
      toast.error("All items need a description and amount");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/v1/expenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription || null,
          items: editItems.map((item) => ({
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
        throw new Error(data.error || "Failed to update");
      }

      // Reload the claim
      const reloadRes = await fetch(`/api/v1/expenses/${id}`, {
        headers: { "x-organization-id": orgId },
      });
      const reloadData = await reloadRes.json();
      if (reloadData.expenseClaim) setClaim(reloadData.expenseClaim);
      setEditing(false);
      toast.success("Expense claim updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/expenses/${id}/submit`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      const data = await res.json();
      setClaim((prev) => (prev ? { ...prev, ...data.expenseClaim } : prev));
      toast.success("Expense claim submitted for approval");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to submit");
    }
  }

  async function handleApprove() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/expenses/${id}/approve`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      const data = await res.json();
      setClaim((prev) => (prev ? { ...prev, ...data.expenseClaim } : prev));
      toast.success("Expense claim approved");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to approve");
    }
  }

  async function handleReject() {
    if (!orgId || !rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    const res = await fetch(`/api/v1/expenses/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify({ reason: rejectReason }),
    });
    if (res.ok) {
      const data = await res.json();
      setClaim((prev) => (prev ? { ...prev, ...data.expenseClaim } : prev));
      setRejectOpen(false);
      setRejectReason("");
      toast.success("Expense claim rejected");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to reject");
    }
  }

  async function handlePay() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/expenses/${id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify({ date: payDate }),
    });
    if (res.ok) {
      const data = await res.json();
      setClaim((prev) => (prev ? { ...prev, ...data.expenseClaim } : prev));
      setPayOpen(false);
      toast.success("Expense claim marked as paid");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to mark as paid");
    }
  }

  async function handleDelete() {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Delete this expense claim?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/api/v1/expenses/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      toast.success("Expense claim deleted");
      router.push("/purchases/expenses");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to delete");
    }
  }

  if (loading) return <BrandLoader />;

  if (!claim) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground">Expense claim not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href="/purchases/expenses">Back to expenses</Link>
        </Button>
      </div>
    );
  }

  const sc = statusConfig[claim.status] || statusConfig.draft;
  const editTotal = editItems.reduce((sum, item) => sum + decimalToCents(parseFloat(item.amount) || 0), 0);

  return (
    <BlurReveal>
      <div className="space-y-6">
        {/* Top bar - same pattern as sales */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="size-8 p-0">
              <Link href="/purchases/expenses"><ArrowLeft className="size-4" /></Link>
            </Button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-semibold tracking-tight">{claim.title}</h1>
                <Badge variant="outline" className={sc.class}>{claim.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {claim.submittedByUser?.name || claim.submittedByUser?.email || "Unknown"}
                {claim.submittedAt && <span> · Submitted {formatDate(claim.submittedAt)}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {claim.status === "draft" && !editing && (
              <>
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Pencil className="mr-2 size-3.5" />Edit
                </Button>
                <Button size="sm" onClick={handleSubmit} className="bg-emerald-600 hover:bg-emerald-700">
                  <Send className="mr-2 size-3.5" />Submit
                </Button>
                <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-600 hover:text-red-700">
                  <Trash2 className="mr-2 size-3.5" />Delete
                </Button>
              </>
            )}
            {claim.status === "submitted" && (
              <>
                <Button size="sm" onClick={handleApprove} className="bg-emerald-600 hover:bg-emerald-700">
                  <Check className="mr-2 size-3.5" />Approve
                </Button>
                <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-red-600">
                      <X className="mr-2 size-3.5" />Reject
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Reject Expense Claim</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Reason *</Label>
                        <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Explain why this expense claim is being rejected..." />
                      </div>
                      <Button onClick={handleReject} className="w-full bg-red-600 hover:bg-red-700">Reject Expense Claim</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
            {claim.status === "approved" && (
              <Dialog open={payOpen} onOpenChange={setPayOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                    <DollarSign className="mr-2 size-3.5" />Mark as Paid
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Mark as Paid</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-muted/50 px-4 py-3">
                      <p className="text-xs text-muted-foreground">Total Amount</p>
                      <p className="text-xl font-bold font-mono">{formatMoney(claim.totalAmount, claim.currencyCode)}</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Date</Label>
                      <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                    </div>
                    <Button onClick={handlePay} className="w-full bg-emerald-600 hover:bg-emerald-700">Confirm Payment</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Gradient divider */}
        <div className="h-px bg-gradient-to-r from-emerald-500/20 via-border to-transparent" />

        {/* Timeline / status info */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Created {formatDate(claim.createdAt)}</span>
          {claim.submittedAt && <span>Submitted {formatDate(claim.submittedAt)}</span>}
          {claim.approvedAt && (
            <span>Approved {formatDate(claim.approvedAt)}{claim.approvedByUser ? ` by ${claim.approvedByUser.name || claim.approvedByUser.email}` : ""}</span>
          )}
          {claim.paidAt && <span>Paid {formatDate(claim.paidAt)}</span>}
        </div>

        {claim.status === "rejected" && claim.rejectionReason && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4">
            <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Rejection Reason</p>
            <p className="text-sm text-red-600 dark:text-red-400">{claim.rejectionReason}</p>
          </div>
        )}

        {claim.description && !editing && (
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground mb-1">Description</p>
            <p className="text-sm">{claim.description}</p>
          </div>
        )}

        {/* Summary cards */}
        {!editing && (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Amount</p>
              <p className="mt-1 text-xl font-bold font-mono tabular-nums">{formatMoney(claim.totalAmount, claim.currencyCode)}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Items</p>
              <p className="mt-1 text-xl font-bold font-mono tabular-nums">{claim.items.length}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Currency</p>
              <p className="mt-1 text-xl font-bold">{claim.currencyCode}</p>
            </div>
          </div>
        )}

        {/* Edit mode */}
        {editing ? (
          <div className="space-y-4 rounded-lg border p-4 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Expense Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addEditItem}>
                  <Plus className="mr-1.5 size-3.5" />Add Item
                </Button>
              </div>

              {editItems.map((item, index) => (
                <div key={index} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Item {index + 1}</span>
                    {editItems.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeEditItem(index)} className="text-red-600 hover:text-red-700 size-7 p-0">
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Date</Label>
                      <Input type="date" value={item.date} onChange={(e) => updateEditItem(index, { date: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Description *</Label>
                      <Input value={item.description} onChange={(e) => updateEditItem(index, { description: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Amount *</Label>
                      <Input type="number" step="0.01" min="0" value={item.amount} onChange={(e) => updateEditItem(index, { amount: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Category</Label>
                      <Input value={item.category} onChange={(e) => updateEditItem(index, { category: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Account</Label>
                      <AccountPicker value={item.accountId} onChange={(val) => updateEditItem(index, { accountId: val })} typeFilter={["expense"]} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Receipt</Label>
                      {item.receiptFileName ? (
                        <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                          <FileText className="size-4 text-emerald-600 shrink-0" />
                          <span className="text-xs truncate flex-1">{item.receiptFileName}</span>
                          <button onClick={() => updateEditItem(index, { receiptFileKey: "", receiptFileName: "" })} className="text-muted-foreground hover:text-foreground">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <FileUploader accept="image/*,.pdf" onUpload={(fileKey, fileName) => updateEditItem(index, { receiptFileKey: fileKey, receiptFileName: fileName })} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3">
              <span className="text-sm font-medium">Total</span>
              <span className="text-lg font-bold font-mono tabular-nums">{formatMoney(editTotal)}</span>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button onClick={handleSaveEdit} loading={saving} className="bg-emerald-600 hover:bg-emerald-700">Save Changes</Button>
            </div>
          </div>
        ) : (
          /* View mode - expense items table */
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <div className="grid min-w-[580px] grid-cols-[100px_1fr_100px_140px_100px] gap-2 border-b bg-muted/50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Date</span>
                <span>Description</span>
                <span>Category</span>
                <span>Receipt</span>
                <span className="text-right">Amount</span>
              </div>
              {claim.items.map((item) => (
                <div key={item.id} className="grid min-w-[580px] grid-cols-[100px_1fr_100px_140px_100px] gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-muted/30 transition-colors">
                  <span className="text-sm tabular-nums">{item.date}</span>
                  <div>
                    <p className="text-sm font-medium">{item.description}</p>
                    {item.account && (
                      <p className="text-xs text-muted-foreground">{item.account.code} · {item.account.name}</p>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">{item.category || "-"}</span>
                  <span>
                    {item.receiptFileKey && item.receiptFileName ? (
                      <ReceiptViewer fileKey={item.receiptFileKey} fileName={item.receiptFileName} />
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </span>
                  <span className="text-right text-sm font-mono font-medium tabular-nums">
                    {formatMoney(item.amount, claim.currencyCode)}
                  </span>
                </div>
              ))}
              {/* Total row */}
              <div className="grid min-w-[580px] grid-cols-[100px_1fr_100px_140px_100px] gap-2 bg-muted/50 px-4 py-3">
                <span />
                <span />
                <span />
                <span className="text-sm font-semibold">Total</span>
                <span className="text-right text-sm font-mono font-bold tabular-nums">
                  {formatMoney(claim.totalAmount, claim.currencyCode)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      {confirmDialog}
    </BlurReveal>
  );
}
