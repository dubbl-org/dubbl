"use client";

import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/dashboard/section";
import { formatMoney } from "@/lib/money";
import { useDealContext, getHeaders, SOURCE_LABELS } from "../layout";

export default function DealSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { deal, fetchDeal, confirm, saving, setSaving } = useDealContext();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/v1/crm/deals/${id}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
          title: form.get("title") as string,
          notes: (form.get("notes") as string) || null,
          probability: form.get("probability") ? parseInt(form.get("probability") as string) : null,
          expectedCloseDate: (form.get("expectedCloseDate") as string) || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update deal");
      await fetchDeal();
      toast.success("Deal updated");
    } catch {
      toast.error("Failed to update deal");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = await confirm({
      title: `Delete "${deal.title}"?`,
      description: "This deal and all its activities will be permanently removed. This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/v1/crm/deals/${id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete deal");
      toast.success("Deal deleted");
      router.push("/crm");
    } catch {
      toast.error("Failed to delete deal");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <Section title="General" description="Basic deal information and identification.">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Deal Title</Label>
            <Input name="title" required defaultValue={deal.title} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Probability (%)</Label>
              <Input
                name="probability"
                type="number"
                min={0}
                max={100}
                defaultValue={deal.probability ?? ""}
                placeholder="0-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expected Close Date</Label>
              <Input
                name="expectedCloseDate"
                type="date"
                defaultValue={deal.expectedCloseDate || ""}
              />
            </div>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Details" description="Source, contact, and assignment info.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Source</Label>
            <Input
              value={deal.source ? (SOURCE_LABELS[deal.source] || deal.source) : "-"}
              disabled
              className="bg-muted/50"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Contact</Label>
            <Input
              value={deal.contact?.name || "-"}
              disabled
              className="bg-muted/50"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Assigned To</Label>
            <Input
              value={deal.assignedUser?.name || "-"}
              disabled
              className="bg-muted/50"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Value</Label>
            <Input
              value={formatMoney(deal.valueCents, deal.currency)}
              disabled
              className="bg-muted/50 font-mono tabular-nums"
            />
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Notes" description="Internal notes about this deal.">
        <Textarea
          name="notes"
          defaultValue={deal.notes || ""}
          rows={3}
          placeholder="Add notes about this deal..."
        />
      </Section>

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>

      <div className="h-px bg-border" />

      <Section title="Danger zone" description="Irreversible actions for this deal.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Delete this deal</p>
            <p className="text-xs text-red-600/70 dark:text-red-400/60">Once deleted, this cannot be undone.</p>
          </div>
          <Button type="button" size="sm" variant="destructive" onClick={handleDelete}>
            Delete Deal
          </Button>
        </div>
      </Section>
    </form>
  );
}
