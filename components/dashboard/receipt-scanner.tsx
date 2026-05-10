"use client";

import { useCallback, useRef, useState } from "react";
import {
  ScanLine,
  Loader2,
  X,
  AlertTriangle,
  RotateCcw,
  Check,
  Plus,
} from "lucide-react";
import {
  scan,
  type ScanResult,
  type ScanFields,
} from "@dubbl/ocr";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ReceiptApplied {
  vendor: string | null;
  date: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  taxRate: number | null;
  currency: string | null;
  paymentMethod: string | null;
  receiptNumber: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number | null;
    amount: number | null;
  }>;
  warnings: string[];
  overallConfidence: number;
  rawText: string;
}

interface ReceiptScannerProps {
  onApply: (data: ReceiptApplied) => void;
  className?: string;
}

interface ReviewState {
  vendor: string;
  date: string;
  total: string;
  subtotal: string;
  tax: string;
  taxRate: string;
  currency: string;
  paymentMethod: string;
  receiptNumber: string;
  lineItems: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
  }>;
}

function centsToStr(c: number | null): string {
  if (c == null) return "";
  return (c / 100).toFixed(2);
}

function strToCents(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ""));
  if (!isFinite(n)) return null;
  return Math.round(n * 100);
}

function fieldsToReview(f: ScanFields): ReviewState {
  return {
    vendor: f.vendor.value ?? "",
    date: f.date.value ?? "",
    total: centsToStr(f.total.value),
    subtotal: centsToStr(f.subtotal.value),
    tax: centsToStr(f.tax.value),
    taxRate: f.taxRate.value != null ? String(f.taxRate.value) : "",
    currency: f.currency.value ?? "",
    paymentMethod: f.paymentMethod.value ?? "",
    receiptNumber: f.receiptNumber.value ?? "",
    lineItems: f.lineItems.map((li) => ({
      description: li.description.value ?? "",
      quantity: li.quantity.value != null ? String(li.quantity.value) : "1",
      unitPrice: centsToStr(li.unitPrice.value),
      amount: centsToStr(li.amount.value),
    })),
  };
}

function ConfChip({ value }: { value: number }) {
  if (value <= 0) return null;
  const pct = Math.round(value * 100);
  const tone =
    pct >= 80
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      : pct >= 50
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
        tone
      )}
      title={`${pct}% confidence`}
    >
      {pct}%
    </span>
  );
}

export function ReceiptScanner({ onApply, className }: ReceiptScannerProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    if (!f.type.startsWith("image/")) {
      setError("Please upload an image file (JPG, PNG, WebP).");
      return;
    }
    setError(null);
    setResult(null);
    setReview(null);
    setProcessing(true);
    setProgressLabel("preprocessing");
    setProgress(0);

    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);

    try {
      const r = await scan(f, {
        onProgress: (status, p) => {
          setProgressLabel(status);
          setProgress(Math.round(p * 100));
        },
      });
      setResult(r);
      setReview(fieldsToReview(r.fields));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan receipt.");
    } finally {
      setProcessing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setPreview(null);
    setResult(null);
    setReview(null);
    setError(null);
    setProgress(0);
    setProgressLabel("");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleApply = useCallback(() => {
    if (!review || !result) return;
    const subtotal = strToCents(review.subtotal);
    const total = strToCents(review.total);
    const tax = strToCents(review.tax);
    const taxRate = review.taxRate ? parseFloat(review.taxRate) : null;
    onApply({
      vendor: review.vendor.trim() || null,
      date: review.date.trim() || null,
      total,
      subtotal,
      tax,
      taxRate: taxRate != null && isFinite(taxRate) ? taxRate : null,
      currency: review.currency.trim() || null,
      paymentMethod: review.paymentMethod.trim() || null,
      receiptNumber: review.receiptNumber.trim() || null,
      lineItems: review.lineItems
        .filter(
          (li) =>
            li.description.trim().length > 0 || li.amount.trim().length > 0
        )
        .map((li) => ({
          description: li.description.trim(),
          quantity: parseFloat(li.quantity) || 1,
          unitPrice: strToCents(li.unitPrice),
          amount: strToCents(li.amount),
        })),
      warnings: result.warnings,
      overallConfidence: result.overallConfidence,
      rawText: result.text,
    });
    reset();
  }, [review, result, onApply, reset]);

  const updateField = <K extends keyof ReviewState>(k: K, v: ReviewState[K]) =>
    setReview((cur) => (cur ? { ...cur, [k]: v } : cur));

  const updateLine = (
    idx: number,
    field: keyof ReviewState["lineItems"][number],
    value: string
  ) =>
    setReview((cur) =>
      cur
        ? {
            ...cur,
            lineItems: cur.lineItems.map((li, i) =>
              i === idx ? { ...li, [field]: value } : li
            ),
          }
        : cur
    );

  const removeLine = (idx: number) =>
    setReview((cur) =>
      cur
        ? { ...cur, lineItems: cur.lineItems.filter((_, i) => i !== idx) }
        : cur
    );

  const addLine = () =>
    setReview((cur) =>
      cur
        ? {
            ...cur,
            lineItems: [
              ...cur.lineItems,
              { description: "", quantity: "1", unitPrice: "", amount: "" },
            ],
          }
        : cur
    );

  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
        className="hidden"
      />

      {!preview && (
        <div
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/50 bg-muted/30 p-6 transition-colors hover:border-emerald-500/30 hover:bg-muted/50"
        >
          <ScanLine className="mb-2 size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">Scan Receipt</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Drop an image or click to upload (JPG, PNG, WebP)
          </p>
        </div>
      )}

      {preview && (
        <div className="rounded-lg border overflow-hidden">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Receipt"
              className="w-full max-h-64 object-contain bg-muted/20"
            />
            {processing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                <Loader2 className="size-6 animate-spin text-emerald-600 mb-2" />
                <p className="text-xs font-medium capitalize">
                  {progressLabel}... {progress}%
                </p>
                <div className="mt-2 h-1.5 w-32 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
            {!processing && (
              <button
                type="button"
                onClick={reset}
                className="absolute top-2 right-2 rounded-full bg-background/80 p-1 hover:bg-background"
                aria-label="Discard scan"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {error && (
            <div className="px-3 py-2 text-xs text-red-600 border-t">
              {error}
            </div>
          )}

          {!processing && review && result && (
            <div className="border-t p-3 space-y-3 bg-muted/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <ScanLine className="size-3.5 text-emerald-600" />
                  Review extracted data
                </p>
                <ConfChip value={result.overallConfidence} />
              </div>

              {result.warnings.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 p-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-3.5" />
                    Warnings
                  </p>
                  <ul className="mt-1 ml-5 list-disc space-y-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <ReviewField
                  label="Vendor"
                  conf={result.fields.vendor.confidence}
                  value={review.vendor}
                  onChange={(v) => updateField("vendor", v)}
                />
                <ReviewField
                  label="Date"
                  type="date"
                  conf={result.fields.date.confidence}
                  value={review.date}
                  onChange={(v) => updateField("date", v)}
                />
                <ReviewField
                  label="Receipt #"
                  conf={result.fields.receiptNumber.confidence}
                  value={review.receiptNumber}
                  onChange={(v) => updateField("receiptNumber", v)}
                />
                <ReviewField
                  label="Currency"
                  conf={result.fields.currency.confidence}
                  value={review.currency}
                  onChange={(v) =>
                    updateField("currency", v.toUpperCase().slice(0, 3))
                  }
                />
                <ReviewField
                  label="Payment"
                  conf={result.fields.paymentMethod.confidence}
                  value={review.paymentMethod}
                  onChange={(v) => updateField("paymentMethod", v)}
                />
                <ReviewField
                  label="Tax rate %"
                  conf={result.fields.taxRate.confidence}
                  value={review.taxRate}
                  onChange={(v) => updateField("taxRate", v)}
                />
                <ReviewField
                  label="Subtotal"
                  conf={result.fields.subtotal.confidence}
                  value={review.subtotal}
                  onChange={(v) => updateField("subtotal", v)}
                />
                <ReviewField
                  label="Tax"
                  conf={result.fields.tax.confidence}
                  value={review.tax}
                  onChange={(v) => updateField("tax", v)}
                />
                <ReviewField
                  label="Total"
                  conf={result.fields.total.confidence}
                  value={review.total}
                  onChange={(v) => updateField("total", v)}
                  className="col-span-2"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Line items
                  </p>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <Plus className="size-3" />
                    Add
                  </button>
                </div>

                {review.lineItems.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">
                    No line items detected. Add manually or apply with the total only.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-12 gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground px-1">
                      <span className="col-span-6">Description</span>
                      <span className="col-span-1 text-center">Qty</span>
                      <span className="col-span-2 text-right">Unit</span>
                      <span className="col-span-2 text-right">Amount</span>
                      <span className="col-span-1" />
                    </div>
                    <div className="space-y-1.5">
                      {review.lineItems.map((li, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-12 gap-1.5 items-center"
                        >
                          <Input
                            className="col-span-6 h-8 text-xs"
                            placeholder="Description"
                            value={li.description}
                            onChange={(e) =>
                              updateLine(i, "description", e.target.value)
                            }
                          />
                          <Input
                            className="col-span-1 h-8 text-xs text-center"
                            placeholder="1"
                            value={li.quantity}
                            onChange={(e) =>
                              updateLine(i, "quantity", e.target.value)
                            }
                          />
                          <Input
                            className="col-span-2 h-8 text-xs text-right"
                            placeholder="0.00"
                            value={li.unitPrice}
                            onChange={(e) =>
                              updateLine(i, "unitPrice", e.target.value)
                            }
                          />
                          <Input
                            className="col-span-2 h-8 text-xs text-right"
                            placeholder="0.00"
                            value={li.amount}
                            onChange={(e) =>
                              updateLine(i, "amount", e.target.value)
                            }
                          />
                          <button
                            type="button"
                            onClick={() => removeLine(i)}
                            className="col-span-1 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                            aria-label={`Remove line ${i + 1}`}
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={reset}
                >
                  <RotateCcw className="size-3 mr-1.5" />
                  Discard
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApply}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check className="size-3 mr-1.5" />
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && !preview && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ReviewField({
  label,
  value,
  onChange,
  conf,
  type = "text",
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  conf: number;
  type?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </Label>
        <ConfChip value={conf} />
      </div>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
      />
    </div>
  );
}
