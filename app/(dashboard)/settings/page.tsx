"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  defaultCurrency: string;
  fiscalYearStartMonth: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function SettingsPage() {
  const [, setOrg] = useState<OrgSettings | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", defaultCurrency: "USD", fiscalYearStartMonth: "1" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/organization", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.organization) {
          setOrg(data.organization);
          setForm({
            name: data.organization.name,
            slug: data.organization.slug,
            defaultCurrency: data.organization.defaultCurrency,
            fiscalYearStartMonth: String(data.organization.fiscalYearStartMonth),
          });
        }
      });
  }, []);

  async function save() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/organization", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          defaultCurrency: form.defaultCurrency,
          fiscalYearStartMonth: parseInt(form.fiscalYearStartMonth),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Organization Settings"
        description="Manage your organization details."
      />

      <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold">General</h2>
        <div className="space-y-2">
          <Label>Organization Name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Slug</Label>
          <Input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Default Currency</Label>
            <Input
              value={form.defaultCurrency}
              onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Fiscal Year Start</Label>
            <Select
              value={form.fiscalYearStartMonth}
              onValueChange={(v) => setForm({ ...form, fiscalYearStartMonth: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={save}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-card/80 backdrop-blur-sm p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-red-600">Danger Zone</h3>
          <p className="text-sm text-muted-foreground">
            Permanently delete this organization and all its data.
          </p>
        </div>
        <Button variant="destructive" size="sm">
          Delete Organization
        </Button>
      </div>
    </div>
  );
}
