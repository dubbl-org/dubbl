"use client";

import { useState, useEffect } from "react";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Shield, Building2, CreditCard } from "lucide-react";
import { toast } from "sonner";

interface SiteSettings {
  registration_mode: string;
  allowed_email_domains: string;
  allow_user_org_creation: string;
  self_hosted_unlimited: string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/v1/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings);
        setStripeConfigured(data.stripeConfigured);
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  async function save(updates: Partial<SiteSettings>) {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSettings(data.settings);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!settings) return null;

  return (
    <ContentReveal>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Settings className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Site Settings</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure registration, organization creation, and plan settings for this instance.
        </p>
      </div>

      <div className="space-y-6">
        {/* Registration */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Registration</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Registration mode</Label>
              <Select
                value={settings.registration_mode}
                onValueChange={(v) =>
                  save({ registration_mode: v })
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="invite_only">Invite only</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Controls who can register. The first user can always register regardless of this setting.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">
                Allowed email domains
              </Label>
              <Textarea
                value={settings.allowed_email_domains}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    allowed_email_domains: e.target.value,
                  })
                }
                onBlur={() =>
                  save({
                    allowed_email_domains: settings.allowed_email_domains,
                  })
                }
                placeholder="acme.com, example.com"
                rows={2}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Comma-separated list of allowed email domains. Leave empty to allow all domains.
              </p>
            </div>
          </div>
        </div>

        {/* Organizations */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Organizations</h3>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium">
                Allow users to create organizations
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                When disabled, only site admins can create new organizations.
              </p>
            </div>
            <Switch
              checked={settings.allow_user_org_creation === "true"}
              onCheckedChange={(checked) =>
                save({
                  allow_user_org_creation: checked ? "true" : "false",
                })
              }
            />
          </div>
        </div>

        {/* Plans */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Plans</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">
                  Stripe status
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {stripeConfigured
                    ? "Stripe is configured. Billing features are active."
                    : "Stripe is not configured. All organizations get unlimited features."}
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  stripeConfigured
                    ? "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
                    : "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                }
              >
                {stripeConfigured ? "Connected" : "Not configured"}
              </Badge>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">
                Self-hosted unlimited mode
              </Label>
              <Select
                value={settings.self_hosted_unlimited}
                onValueChange={(v) =>
                  save({ self_hosted_unlimited: v })
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    Auto (based on Stripe config)
                  </SelectItem>
                  <SelectItem value="true">Always on</SelectItem>
                  <SelectItem value="false">Always off</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                When enabled, all organizations get unlimited Pro features without needing Stripe.
              </p>
            </div>
          </div>
        </div>
      </div>

      {saving && (
        <div className="fixed bottom-4 right-4 rounded-lg border bg-card px-4 py-2 text-xs text-muted-foreground shadow-lg">
          Saving...
        </div>
      )}
    </ContentReveal>
  );
}
