"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ScanLine,
  Loader2,
  Check,
  FileText,
  ArrowRight,
  Receipt,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";

interface DocRow {
  id: string;
  fileName: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  entityType: string | null;
  entityId: string | null;
}

interface Extraction {
  supplier: string | null;
  date: string | null;
  total: number | null; // cents
  tax: number | null; // cents
  lineHints: string[];
}

interface Supplier {
  id: string;
  name: string;
}

function orgHeaders(): Record<string, string> {
  const orgId =
    typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
  return orgId ? { "x-organization-id": orgId } : {};
}

// What a draft bill needs that OCR can't supply on its own.
interface DraftState {
  extraction: Extraction;
  // Editable, user-confirmable fields pre-filled from the read.
  supplierName: string;
  contactId: string;
  date: string;
  total: string; // decimal string for the input
}

export default function DocumentInboxPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Per-document UI state.
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/documents?limit=100", {
        headers: orgHeaders(),
      });
      const json = await res.json();
      const all: DocRow[] = json.data ?? [];
      // "Inbox" = receipt-like uploads not yet filed against a record. We treat
      // image documents that aren't already linked to an entity as unfiled
      // receipts waiting to be turned into a bill.
      const inbox = all.filter(
        (d) => d.mimeType?.startsWith("image/") && !d.entityType
      );
      setDocs(inbox);
    } catch {
      toast.error("Couldn't load your receipts inbox.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSuppliers = useCallback(async () => {
    try {
      // Suppliers (and "both") are the valid payees for a bill.
      const res = await fetch("/api/v1/contacts?limit=200", {
        headers: orgHeaders(),
      });
      const json = await res.json();
      const rows: Supplier[] = (json.data ?? []).map(
        (c: { id: string; name: string }) => ({ id: c.id, name: c.name })
      );
      setSuppliers(rows);
    } catch {
      // Non-fatal — the user can still see extracted data, just can't draft a
      // bill without a supplier.
    }
  }, []);

  useEffect(() => {
    loadDocs();
    loadSuppliers();
  }, [loadDocs, loadSuppliers]);

  const handleExtract = useCallback(async (doc: DocRow) => {
    setExtractingId(doc.id);
    try {
      const res = await fetch("/api/v1/documents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...orgHeaders() },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "We couldn't read this receipt.");
        return;
      }
      const ex: Extraction = json.extraction;
      setDrafts((prev) => ({
        ...prev,
        [doc.id]: {
          extraction: ex,
          supplierName: ex.supplier ?? "",
          contactId: "",
          date: ex.date ?? new Date().toISOString().slice(0, 10),
          total: ex.total != null ? (ex.total / 100).toFixed(2) : "",
        },
      }));
    } catch {
      toast.error("Something went wrong reading this receipt.");
    } finally {
      setExtractingId(null);
    }
  }, []);

  const updateDraft = useCallback(
    (docId: string, patch: Partial<DraftState>) => {
      setDrafts((prev) => ({ ...prev, [docId]: { ...prev[docId], ...patch } }));
    },
    []
  );

  const handleCreateBill = useCallback(
    async (doc: DocRow) => {
      const draft = drafts[doc.id];
      if (!draft) return;
      if (!draft.contactId) {
        toast.error("Pick which supplier this receipt is from first.");
        return;
      }
      const totalCents = Math.round((parseFloat(draft.total) || 0) * 100);
      if (totalCents <= 0) {
        toast.error("Enter the receipt total before drafting the bill.");
        return;
      }

      setCreatingId(doc.id);
      try {
        // The bills API takes line unit prices as decimals and applies its own
        // tax handling. OCR only gives us a single total, so we draft a one-line
        // bill for the full amount with no tax line — the user edits the draft
        // afterwards to split lines / set tax.
        const billRes = await fetch("/api/v1/bills", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...orgHeaders() },
          body: JSON.stringify({
            contactId: draft.contactId,
            issueDate: draft.date,
            dueDate: draft.date,
            reference: doc.fileName,
            notes: `Drafted from receipt "${doc.fileName}" via the receipts inbox.`,
            lines: [
              {
                description:
                  draft.supplierName.trim() || "Receipt",
                quantity: 1,
                unitPrice: parseFloat(draft.total) || 0,
              },
            ],
          }),
        });
        const billJson = await billRes.json();
        if (!billRes.ok) {
          toast.error(billJson.error || "Couldn't create the draft bill.");
          return;
        }
        const billId: string | undefined = billJson.bill?.id;

        // Link this document to the new bill via the generic entity attachment
        // fields so the receipt shows up on the bill's attachments.
        if (billId) {
          await fetch(`/api/v1/documents/${doc.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...orgHeaders() },
            body: JSON.stringify({ entityType: "bill", entityId: billId }),
          }).catch(() => {});
        }

        toast.success("Draft bill created from your receipt.");
        // Drop it out of the inbox locally and jump to the draft for review.
        setDocs((prev) => prev.filter((d) => d.id !== doc.id));
        if (billId) {
          router.push(`/purchases/${billId}`);
        }
      } catch {
        toast.error("Something went wrong creating the draft bill.");
      } finally {
        setCreatingId(null);
      }
    },
    [drafts, router]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Receipt className="size-5 text-emerald-600" />
          <h1 className="text-xl font-semibold">Receipts inbox</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Snap a receipt, we&apos;ll draft the bill. Upload a photo of a
          receipt, read it, then turn it into a draft bill you can check and
          send to your books.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Inbox className="mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">Your inbox is empty</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Upload a photo of a receipt to your documents and it&apos;ll show up
            here, ready to turn into a draft bill.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {docs.map((doc) => {
            const draft = drafts[doc.id];
            const isExtracting = extractingId === doc.id;
            const isCreating = creatingId === doc.id;
            return (
              <div
                key={doc.id}
                className="rounded-lg border bg-card p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">
                      {doc.fileName}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      unfiled
                    </Badge>
                  </div>
                  {!draft && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExtract(doc)}
                      disabled={isExtracting}
                    >
                      {isExtracting ? (
                        <>
                          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                          Reading…
                        </>
                      ) : (
                        <>
                          <ScanLine className="mr-1.5 size-3.5" />
                          Read receipt
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {draft && (
                  <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium">
                      <Check className="size-3.5 text-emerald-600" />
                      Here&apos;s what we read — check it before drafting
                    </p>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">
                          Supplier on the receipt
                        </label>
                        <Input
                          value={draft.supplierName}
                          onChange={(e) =>
                            updateDraft(doc.id, {
                              supplierName: e.target.value,
                            })
                          }
                          placeholder="e.g. Office Depot"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">
                          Which supplier is this? (for the bill)
                        </label>
                        <Select
                          value={draft.contactId}
                          onValueChange={(v) =>
                            updateDraft(doc.id, { contactId: v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pick a supplier" />
                          </SelectTrigger>
                          <SelectContent>
                            {suppliers.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">
                          Date
                        </label>
                        <Input
                          type="date"
                          value={draft.date}
                          onChange={(e) =>
                            updateDraft(doc.id, { date: e.target.value })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">
                          Total
                        </label>
                        <Input
                          inputMode="decimal"
                          value={draft.total}
                          onChange={(e) =>
                            updateDraft(doc.id, { total: e.target.value })
                          }
                          placeholder="0.00"
                        />
                        {draft.extraction.tax != null && (
                          <p className="text-[11px] text-muted-foreground">
                            Tax we spotted on the receipt:{" "}
                            {formatMoney(draft.extraction.tax, "USD")} — set tax
                            on the draft after.
                          </p>
                        )}
                      </div>
                    </div>

                    {draft.extraction.lineHints.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          What we saw on the receipt
                        </summary>
                        <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                          {draft.extraction.lineHints.map((l, i) => (
                            <li key={i} className="font-mono">
                              {l}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => handleCreateBill(doc)}
                        disabled={isCreating}
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                            Creating…
                          </>
                        ) : (
                          <>
                            Create draft bill
                            <ArrowRight className="ml-1.5 size-3.5" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
