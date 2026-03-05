"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { Section } from "@/components/dashboard/section";
import { centsToDecimal } from "@/lib/money";
import { useProject, PROJECT_COLORS } from "../project-context";

export default function SettingsPage() {
  const { project: proj, orgId, projectId, refresh } = useProject();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState(proj?.contactId || "");

  if (!proj) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    const form = new FormData(e.currentTarget);

    try {
      const tagsRaw = (form.get("tags") as string || "").trim();
      const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];

      const res = await fetch(`/api/v1/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description") || null,
          contactId: contactId || null,
          status: form.get("status"),
          priority: form.get("priority"),
          billingType: form.get("billingType"),
          color: form.get("color"),
          budget: Math.round(parseFloat(form.get("budget") as string || "0") * 100),
          hourlyRate: Math.round(parseFloat(form.get("hourlyRate") as string || "0") * 100),
          fixedPrice: Math.round(parseFloat(form.get("fixedPrice") as string || "0") * 100),
          estimatedHours: Math.round(parseFloat(form.get("estimatedHours") as string || "0") * 60),
          startDate: form.get("startDate") || null,
          endDate: form.get("endDate") || null,
          category: form.get("category") || null,
          tags,
          enableTasks: form.get("enableTasks") === "on",
          enableTimeTracking: form.get("enableTimeTracking") === "on",
          enableMilestones: form.get("enableMilestones") === "on",
          enableNotes: form.get("enableNotes") === "on",
          enableBilling: form.get("enableBilling") === "on",
        }),
      });

      if (!res.ok) throw new Error("Failed to update");
      toast.success("Project updated");
      window.dispatchEvent(new Event("projects-changed"));
      refresh();
    } catch {
      toast.error("Failed to update project");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this project? This action cannot be undone.")) return;
    if (!orgId) return;
    await fetch(`/api/v1/projects/${projectId}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    toast.success("Project deleted");
    window.dispatchEvent(new Event("projects-changed"));
    router.push("/projects");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <Section title="General" description="Basic project details and categorization.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Project Name *</Label>
            <Input name="name" required defaultValue={proj.name} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select name="status" defaultValue={proj.status}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Priority</Label>
            <Select name="priority" defaultValue={proj.priority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Client</Label>
            <ContactPicker value={contactId} onChange={setContactId} type="customer" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Input name="category" defaultValue={proj.category || ""} placeholder="e.g. Development" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map(c => (
                <label key={c} className="cursor-pointer">
                  <input type="radio" name="color" value={c} defaultChecked={proj.color === c} className="sr-only peer" />
                  <div className="size-6 rounded-full ring-2 ring-transparent peer-checked:ring-offset-2 peer-checked:ring-gray-400 transition-all" style={{ backgroundColor: c }} />
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tags</Label>
            <Input name="tags" defaultValue={proj.tags.join(", ")} placeholder="Comma separated" />
          </div>
        </div>
        <div className="space-y-1.5 mt-4">
          <Label className="text-xs">Description</Label>
          <Textarea name="description" defaultValue={proj.description || ""} rows={3} />
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Financial" description="Billing type, rates, and budget settings.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Billing Type</Label>
            <Select name="billingType" defaultValue={proj.billingType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="fixed">Fixed Price</SelectItem>
                <SelectItem value="milestone">Milestone</SelectItem>
                <SelectItem value="non_billable">Non-Billable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Budget</Label><Input name="budget" type="number" step="0.01" min={0} defaultValue={centsToDecimal(proj.budget)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Hourly Rate</Label><Input name="hourlyRate" type="number" step="0.01" min={0} defaultValue={centsToDecimal(proj.hourlyRate)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Fixed Price</Label><Input name="fixedPrice" type="number" step="0.01" min={0} defaultValue={centsToDecimal(proj.fixedPrice)} /></div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Timeline" description="Project schedule and time estimates.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5"><Label className="text-xs">Start Date</Label><Input name="startDate" type="date" defaultValue={proj.startDate || ""} /></div>
          <div className="space-y-1.5"><Label className="text-xs">End Date</Label><Input name="endDate" type="date" defaultValue={proj.endDate || ""} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Estimated Hours</Label><Input name="estimatedHours" type="number" step="0.5" min={0} defaultValue={proj.estimatedHours > 0 ? (proj.estimatedHours / 60).toFixed(1) : ""} /></div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Features" description="Toggle features on or off. Disabled features hide their tabs.">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { name: "enableTasks", label: "Tasks", desc: "Track tasks and to-dos", checked: proj.enableTasks },
            { name: "enableTimeTracking", label: "Time Tracking", desc: "Log time entries and use timer", checked: proj.enableTimeTracking },
            { name: "enableMilestones", label: "Milestones", desc: "Set project milestones", checked: proj.enableMilestones },
            { name: "enableNotes", label: "Notes", desc: "Project notes and comments", checked: proj.enableNotes },
            { name: "enableBilling", label: "Billing", desc: "Budget and invoice tracking", checked: proj.enableBilling },
          ].map((f) => (
            <label key={f.name} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50/50 transition-colors">
              <input type="checkbox" name={f.name} defaultChecked={f.checked} className="accent-emerald-600" />
              <div>
                <p className="text-[13px] font-medium">{f.label}</p>
                <p className="text-[10px] text-muted-foreground">{f.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </Section>

      <div className="h-px bg-border" />

      <div className="flex justify-end">
        <Button type="submit" disabled={saving} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>

      <div className="h-px bg-border" />

      <Section title="Danger zone" description="Irreversible actions for this project.">
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete project</p>
            <p className="text-[12px] text-muted-foreground">Permanently delete this project and all associated data.</p>
          </div>
          <Button type="button" variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-1.5 size-3.5" />Delete
          </Button>
        </div>
      </Section>
    </form>
  );
}
