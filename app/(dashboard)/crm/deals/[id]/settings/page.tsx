"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/dashboard/section";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { OwnerSelect } from "@/components/dashboard/crm/owner-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDealContext, crmFetch, errorText, SOURCE_LABELS } from "../layout";

export default function DealSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { deal, confirm, saving, setSaving } = useDealContext();
  const [value, setValue] = useState((deal.valueCents / 100).toFixed(2));
  const [contactId, setContactId] = useState(deal.contactId || deal.contact?.id || "");
  const [ownerId, setOwnerId] = useState(deal.assignedTo || deal.assignedUser?.id || "");
  const [source, setSource] = useState(deal.source || "none");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      await crmFetch(`/api/v1/crm/deals/${id}`, {
        method: "PATCH",
        body: {
          title: form.get("title") as string,
          notes: (form.get("notes") as string) || null,
          // Empty clears the probability.
          probability: form.get("probability") ? parseInt(form.get("probability") as string) : null,
          expectedCloseDate: (form.get("expectedCloseDate") as string) || null,
          valueCents: Math.round(parseFloat(value || "0") * 100),
          contactId: contactId || null,
          assignedTo: ownerId || null,
          source: source === "none" ? null : source,
        },
      });
      toast.success("Deal updated");
    } catch (err) {
      toast.error(errorText(err, "Failed to update deal"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = await confirm({
      title: `Delete "${deal.title}"?`,
      description: "The deal and its activities move to Trash. You can restore them from Settings > Trash within 30 days.",
      confirmLabel: "Move to Trash",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await crmFetch(`/api/v1/crm/deals/${id}`, { method: "DELETE" });
      toast.success("Deal moved to Trash");
      router.push("/crm");
    } catch (err) {
      toast.error(errorText(err, "Failed to delete deal"));
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

      <Section title="Details" description="Value, contact, owner and where the deal came from.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Value ({deal.currency})</Label>
            <CurrencyInput value={value} onChange={setValue} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Contact</Label>
            <ContactPicker value={contactId} onChange={setContactId} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Owner</Label>
            <OwnerSelect value={ownerId} onChange={setOwnerId} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {Object.entries(SOURCE_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      <Section title="Danger zone" description="Remove this deal.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Delete this deal</p>
            <p className="text-xs text-red-600/70 dark:text-red-400/60">Moves the deal to Trash. You can restore it from Settings &gt; Trash.</p>
          </div>
          <Button type="button" size="sm" variant="destructive" onClick={handleDelete}>
            Delete Deal
          </Button>
        </div>
      </Section>
    </form>
  );
}
