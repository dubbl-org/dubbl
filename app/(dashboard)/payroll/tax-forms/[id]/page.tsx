"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi } from "@/lib/query/use-api";
import { downloadFile } from "@/components/dashboard/download-link";
import { w2DisplayRows } from "@/lib/tax-forms/w2";

interface TaxFormDetail {
  id: string;
  recipientName: string;
  recipientTaxId: string | null;
  recipientType: string;
  formType: string;
  taxYear: number;
  formData: Record<string, unknown>;
  status: string;
  generation?: {
    id: string;
    status: string;
  };
}

const formatMoney = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const statusBadge = (status: string) => {
  switch (status) {
    case "draft":
      return <Badge variant="secondary">draft</Badge>;
    case "generated":
      return <Badge variant="default">generated</Badge>;
    case "sent":
      return <Badge variant="outline">sent</Badge>;
    case "filed":
      return (
        <Badge
          variant="default"
          className="bg-brand-600 hover:bg-brand-700"
        >
          filed
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

// formData keys rendered as boxes; anything else is shown as extra info
const BOX_KEYS = new Set(["box12", "box14", "states", "localities"]);
const INFO_LABELS: Record<string, string> = {
  employee_email: "Employee email",
  employee_number: "Employee number",
  recipient_company: "Company",
  recipient_email: "Email",
};

export default function TaxFormDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: formData, loading } = useApi<TaxFormDetail>(`/api/v1/payroll/tax-forms/${id}`);
  const form = formData?.id ? formData : null;
  useDocumentTitle("Payroll · Tax Form Details");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground">Tax form not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href="/payroll/tax-forms">Back to tax forms</Link>
        </Button>
      </div>
    );
  }

  const formTypeLabel =
    form.formType === "1099_nec"
      ? "1099-NEC"
      : form.formType === "1099_misc"
        ? "1099-MISC"
        : "W-2";

  const data = (form.formData ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="size-8 p-0">
            <Link href="/payroll/tax-forms">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold tracking-tight">
                {formTypeLabel} · {form.taxYear}
              </h1>
              {statusBadge(form.status)}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {form.recipientName} · {form.recipientType}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadFile(
              `/api/v1/payroll/tax-forms/${form.id}/pdf`,
              `${formTypeLabel}-${form.taxYear}-${form.recipientName}.pdf`
            ).catch((err) =>
              toast.error(err instanceof Error ? err.message : "Couldn't download the PDF")
            )
          }
        >
          <Download className="mr-2 size-3.5" />
          Download PDF
        </Button>
      </div>

      <div className="h-px bg-gradient-to-r from-blue-500/20 via-border to-transparent" />

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Form Type</p>
          <p className="mt-1 text-lg font-bold">{formTypeLabel}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Tax Year</p>
          <p className="mt-1 text-lg font-bold font-mono tabular-nums">
            {form.taxYear}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Recipient</p>
          <p className="mt-1 text-lg font-bold truncate">
            {form.recipientName}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Tax ID</p>
          <p className="mt-1 text-lg font-bold font-mono">
            {form.recipientTaxId
              ? `***-${form.recipientTaxId.slice(-4)}`
              : "-"}
          </p>
        </div>
      </div>

      {/* Form data */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Form Data</h2>
        <div className="rounded-lg border divide-y">
          {form.formType === "1099_nec" && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-muted-foreground">
                Box 1 - Nonemployee Compensation
              </span>
              <span className="text-sm font-mono font-bold tabular-nums">
                {typeof data.box1_nonemployee_compensation === "number"
                  ? formatMoney(data.box1_nonemployee_compensation)
                  : "-"}
              </span>
            </div>
          )}

          {form.formType === "w2" &&
            w2DisplayRows(data).map((row, i) => (
              <div
                key={`${row.label}-${i}`}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className="text-sm font-mono font-bold tabular-nums">
                  {row.amount != null ? formatMoney(row.amount) : row.text || "-"}
                </span>
              </div>
            ))}

          {/* Additional info fields */}
          {Object.entries(data)
            .filter(
              ([key, value]) =>
                !key.startsWith("box") &&
                !BOX_KEYS.has(key) &&
                value !== null &&
                value !== undefined &&
                typeof value !== "object"
            )
            .map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm text-muted-foreground">
                  {INFO_LABELS[key] ?? key.replace(/_/g, " ")}
                </span>
                <span className="text-sm">{String(value) || "-"}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
