"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download } from "lucide-react";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

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
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          filed
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const w2Labels: Record<string, string> = {
  box1_wages: "Box 1 - Wages, tips, other compensation",
  box2_federal_tax: "Box 2 - Federal income tax withheld",
  box3_ss_wages: "Box 3 - Social security wages",
  box4_ss_tax: "Box 4 - Social security tax withheld",
  box5_medicare_wages: "Box 5 - Medicare wages and tips",
  box6_medicare_tax: "Box 6 - Medicare tax withheld",
};

export default function TaxFormDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<TaxFormDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useDocumentTitle("Payroll · Tax Form Details");

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId") || ""
      : "";

  const loadForm = useCallback(() => {
    if (!orgId) return;
    fetch(`/api/v1/payroll/tax-forms/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.id) setForm(data);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

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

  const data = form.formData as Record<string, number | string>;

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
            window.open(`/api/v1/payroll/tax-forms/${form.id}/pdf`, "_blank")
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
            Object.entries(w2Labels).map(([key, label]) => (
              <div
                key={key}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-sm font-mono font-bold tabular-nums">
                  {typeof data[key] === "number"
                    ? formatMoney(data[key] as number)
                    : "-"}
                </span>
              </div>
            ))}

          {/* Additional info fields */}
          {Object.entries(data)
            .filter(
              ([key]) =>
                !key.startsWith("box") &&
                !Object.keys(w2Labels).includes(key)
            )
            .map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm text-muted-foreground">
                  {key.replace(/_/g, " ")}
                </span>
                <span className="text-sm">{String(value) || "-"}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
