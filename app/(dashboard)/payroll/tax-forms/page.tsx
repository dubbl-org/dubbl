"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";
import { toast } from "sonner";

interface TaxFormItem {
  id: string;
  recipientName: string;
  recipientTaxId: string | null;
  formType: string;
  taxYear: number;
  formData: Record<string, unknown>;
  status: string;
}

interface TaxGeneration {
  id: string;
  taxYear: number;
  formType: string;
  status: string;
  generatedAt: string | null;
  createdAt: string;
  forms: TaxFormItem[];
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

const years = Array.from({ length: 7 }, (_, i) => 2020 + i);

export default function TaxFormsPage() {
  const router = useRouter();
  const [generations, setGenerations] = useState<TaxGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [taxYear, setTaxYear] = useState("2025");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId") || ""
      : "";

  const fetchGenerations = useCallback(() => {
    if (!orgId) return;
    fetch("/api/v1/payroll/tax-forms", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setGenerations(data.data);
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => {
    fetchGenerations();
  }, [fetchGenerations]);

  async function handleGenerate(formType: "1099_nec" | "w2") {
    setGenerating(true);
    try {
      const res = await fetch("/api/v1/payroll/tax-forms/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          taxYear: parseInt(taxYear),
          formType,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate");
      }

      const data = await res.json();
      toast.success(
        `Generated ${data.formsGenerated} ${formType === "1099_nec" ? "1099-NEC" : "W-2"} form(s)`
      );
      fetchGenerations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  }

  function maskTaxId(taxId: string | null) {
    if (!taxId) return "-";
    return `***-${taxId.slice(-4)}`;
  }

  function getKeyAmount(form: TaxFormItem): string {
    const data = form.formData as Record<string, number>;
    if (form.formType === "1099_nec" && data.box1_nonemployee_compensation) {
      return formatMoney(data.box1_nonemployee_compensation);
    }
    if (form.formType === "w2" && data.box1_wages) {
      return formatMoney(data.box1_wages);
    }
    return "-";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Tax Forms</h1>
          <p className="text-sm text-muted-foreground">
            Generate and manage 1099-NEC and W-2 tax forms
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={taxYear} onValueChange={setTaxYear}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={generating}
            onClick={() => handleGenerate("1099_nec")}
          >
            {generating ? "Generating..." : "Generate 1099-NEC"}
          </Button>
          <Button
            size="sm"
            disabled={generating}
            onClick={() => handleGenerate("w2")}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {generating ? "Generating..." : "Generate W-2"}
          </Button>
        </div>
      </div>

      {/* Generations table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tax Year</TableHead>
              <TableHead>Form Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right"># Forms</TableHead>
              <TableHead>Generated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {generations.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground py-8"
                >
                  No tax form generations yet
                </TableCell>
              </TableRow>
            ) : (
              generations.map((gen) => (
                <>
                  <TableRow
                    key={gen.id}
                    className="cursor-pointer"
                    onClick={() =>
                      setExpandedId(expandedId === gen.id ? null : gen.id)
                    }
                  >
                    <TableCell className="font-mono text-sm">
                      {gen.taxYear}
                    </TableCell>
                    <TableCell className="text-sm">
                      {gen.formType === "1099_nec"
                        ? "1099-NEC"
                        : gen.formType === "1099_misc"
                          ? "1099-MISC"
                          : "W-2"}
                    </TableCell>
                    <TableCell>{statusBadge(gen.status)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {gen.forms?.length || 0}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {gen.generatedAt
                        ? new Date(gen.generatedAt).toLocaleDateString()
                        : "-"}
                    </TableCell>
                  </TableRow>

                  {/* Expanded forms section */}
                  {expandedId === gen.id &&
                    gen.forms &&
                    gen.forms.length > 0 && (
                      <TableRow key={`${gen.id}-forms`}>
                        <TableCell colSpan={5} className="p-0">
                          <div className="bg-muted/30 px-4 py-3">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Recipient</TableHead>
                                  <TableHead>Tax ID</TableHead>
                                  <TableHead className="text-right">
                                    Key Amount
                                  </TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="text-right">
                                    Actions
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {gen.forms.map((form) => (
                                  <TableRow
                                    key={form.id}
                                    className="cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(
                                        `/payroll/tax-forms/${form.id}`
                                      );
                                    }}
                                  >
                                    <TableCell className="font-medium">
                                      {form.recipientName}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground font-mono">
                                      {maskTaxId(form.recipientTaxId)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm tabular-nums">
                                      {getKeyAmount(form)}
                                    </TableCell>
                                    <TableCell>
                                      {statusBadge(form.status)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          window.open(
                                            `/api/v1/payroll/tax-forms/${form.id}/pdf`,
                                            "_blank"
                                          );
                                        }}
                                      >
                                        <Download className="size-3.5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
