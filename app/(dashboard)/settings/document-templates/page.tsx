"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  FileText,
  Trash2,
  MoreHorizontal,
  Eye,
  Pencil,
  Star,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  type: string;
  logoUrl: string | null;
  accentColor: string | null;
  showTaxBreakdown: boolean;
  showPaymentTerms: boolean;
  notes: string | null;
  bankDetails: string | null;
  paymentInstructions: string | null;
  isDefault: boolean;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  quote: "Quote",
  receipt: "Receipt",
  payslip: "Payslip",
  purchase_order: "Purchase Order",
};

export default function DocumentTemplatesPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState("invoice");
  const [accentColor, setAccentColor] = useState("#10b981");
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(true);
  const [showPaymentTerms, setShowPaymentTerms] = useState(true);
  const [notes, setNotes] = useState("");
  const [bankDetails, setBankDetails] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  function fetchTemplates() {
    fetch("/api/v1/document-templates", { headers: getHeaders() })
      .then((r) => r.json())
      .then((data) => { if (data.templates) setTemplates(data.templates); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchTemplates(); }, []);

  function openCreate() {
    setEditing(null);
    setName("");
    setType("invoice");
    setAccentColor("#10b981");
    setShowTaxBreakdown(true);
    setShowPaymentTerms(true);
    setNotes("");
    setBankDetails("");
    setPaymentInstructions("");
    setIsDefault(false);
    setDialogOpen(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setName(t.name);
    setType(t.type);
    setAccentColor(t.accentColor || "#10b981");
    setShowTaxBreakdown(t.showTaxBreakdown);
    setShowPaymentTerms(t.showPaymentTerms);
    setNotes(t.notes || "");
    setBankDetails(t.bankDetails || "");
    setPaymentInstructions(t.paymentInstructions || "");
    setIsDefault(t.isDefault);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const payload = { name, type, accentColor, showTaxBreakdown, showPaymentTerms, notes: notes || null, bankDetails: bankDetails || null, paymentInstructions: paymentInstructions || null, isDefault };

    if (editing) {
      await fetch(`/api/v1/document-templates/${editing.id}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      toast.success("Template updated");
    } else {
      await fetch("/api/v1/document-templates", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      toast.success("Template created");
    }

    setSaving(false);
    setDialogOpen(false);
    fetchTemplates();
  }

  async function handleDelete(t: Template) {
    await confirm({
      title: `Delete "${t.name}"?`,
      description: "This template will be permanently deleted.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await fetch(`/api/v1/document-templates/${t.id}`, {
          method: "DELETE",
          headers: getHeaders(),
        });
        toast.success("Template deleted");
        fetchTemplates();
      },
    });
  }

  async function handlePreview(t: Template) {
    setPreviewTemplateId(t.id);
    const res = await fetch(`/api/v1/document-templates/${t.id}/preview`, {
      method: "POST",
      headers: getHeaders(),
    });
    const html = await res.text();
    setPreviewHtml(html);
  }

  async function handleDownloadSamplePdf() {
    if (!previewTemplateId) return;
    const res = await fetch(`/api/v1/document-templates/${previewTemplateId}/preview?format=pdf`, {
      method: "POST",
      headers: getHeaders(),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-invoice.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Document Templates</h2>
            <p className="text-sm text-muted-foreground">
              Customize how your invoices, quotes, and other documents look.
            </p>
          </div>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={openCreate}>
            <Plus className="size-3" />
            New Template
          </Button>
        </div>

        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <FileText className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-medium">No templates yet</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a template to customize your document styling.
            </p>
            <Button size="sm" className="mt-4" onClick={openCreate}>
              Create Template
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium truncate">{t.name}</h3>
                      {t.isDefault && (
                        <Badge variant="outline" className="text-[10px] border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                          <Star className="size-2.5 mr-0.5" /> Default
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {TYPE_LABELS[t.type] || t.type}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="size-7 p-0">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handlePreview(t)}>
                        <Eye className="size-4" /> Preview
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(t)}>
                        <Pencil className="size-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => handleDelete(t)}>
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="size-4 rounded border"
                    style={{ backgroundColor: t.accentColor || "#10b981" }}
                  />
                  <span className="text-xs text-muted-foreground font-mono">
                    {t.accentColor || "#10b981"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Template" : "New Template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Professional Blue" />
              </div>
              {!editing && (
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Accent Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="size-8 rounded border cursor-pointer"
                  />
                  <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="font-mono" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Show Tax Breakdown</Label>
                <Switch checked={showTaxBreakdown} onCheckedChange={setShowTaxBreakdown} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Show Payment Terms</Label>
                <Switch checked={showPaymentTerms} onCheckedChange={setShowPaymentTerms} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Set as Default</Label>
                <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              </div>
              <div className="space-y-1.5">
                <Label>Bank Details</Label>
                <Textarea value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} placeholder="IBAN: ..., SWIFT/BIC: ..." rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Instructions</Label>
                <Textarea value={paymentInstructions} onChange={(e) => setPaymentInstructions(e.target.value)} placeholder="Please reference invoice number when making payment..." rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes / Footer Text</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thank you for your business..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? "Saving..." : editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={!!previewHtml} onOpenChange={() => { setPreviewHtml(null); setPreviewTemplateId(null); }}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Template Preview</DialogTitle>
                <Button variant="outline" size="sm" onClick={handleDownloadSamplePdf} className="gap-1.5">
                  <Download className="size-3.5" />
                  Download Sample PDF
                </Button>
              </div>
            </DialogHeader>
            {previewHtml && (
              <iframe
                srcDoc={previewHtml}
                className="w-full h-[600px] border rounded"
                title="Template Preview"
              />
            )}
          </DialogContent>
        </Dialog>

        {confirmDialog}
      </div>
    </ContentReveal>
  );
}
