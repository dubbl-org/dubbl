"use client";

import { useState, useEffect } from "react";
import {
  Bell,
  FileText,
  DollarSign,
  Package,
  Landmark,
  ShieldCheck,
  AlertTriangle,
  ClipboardList,
  Mail,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const NOTIFICATION_TYPES = [
  { type: "invoice_overdue", label: "Invoice Overdue", description: "When an invoice passes its due date", icon: FileText, color: "text-red-500 bg-red-500/10" },
  { type: "payment_received", label: "Payment Received", description: "When a payment is recorded", icon: DollarSign, color: "text-emerald-500 bg-emerald-500/10" },
  { type: "inventory_low", label: "Low Inventory", description: "When stock falls below minimum threshold", icon: Package, color: "text-amber-500 bg-amber-500/10" },
  { type: "payroll_due", label: "Payroll Due", description: "When a payroll run is approaching", icon: Landmark, color: "text-blue-500 bg-blue-500/10" },
  { type: "approval_needed", label: "Approval Needed", description: "When something requires your approval", icon: ShieldCheck, color: "text-purple-500 bg-purple-500/10" },
  { type: "system_alert", label: "System Alert", description: "Important system notifications", icon: AlertTriangle, color: "text-orange-500 bg-orange-500/10" },
  { type: "task_assigned", label: "Task Assigned", description: "When a task is assigned to you", icon: ClipboardList, color: "text-indigo-500 bg-indigo-500/10" },
] as const;

const DIGEST_OPTIONS = [
  { value: "0", label: "Instant" },
  { value: "15", label: "Every 15 min" },
  { value: "30", label: "Every 30 min" },
  { value: "60", label: "Every hour" },
  { value: "360", label: "Every 6 hours" },
  { value: "1440", label: "Daily" },
];

interface Preference {
  type: string;
  channel: string;
  enabled: boolean;
  digestIntervalMinutes: number;
}

type PrefState = Record<string, { inApp: boolean; email: boolean; digest: number }>;

function buildDefaultState(): PrefState {
  const state: PrefState = {};
  for (const t of NOTIFICATION_TYPES) {
    state[t.type] = { inApp: true, email: false, digest: 0 };
  }
  return state;
}

function mergePrefs(prefs: Preference[]): PrefState {
  const state = buildDefaultState();
  for (const p of prefs) {
    if (!state[p.type]) continue;
    if (p.channel === "in_app") {
      state[p.type].inApp = p.enabled;
    } else if (p.channel === "email") {
      state[p.type].email = p.enabled;
      state[p.type].digest = p.digestIntervalMinutes;
    }
  }
  return state;
}

export default function NotificationPreferencesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<PrefState>(buildDefaultState);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/notifications/preferences", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.preferences) {
          setPrefs(mergePrefs(data.preferences));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    setSaving(true);
    try {
      const preferences: Preference[] = [];
      for (const [type, val] of Object.entries(prefs)) {
        preferences.push({ type, channel: "in_app", enabled: val.inApp, digestIntervalMinutes: 0 });
        preferences.push({ type, channel: "email", enabled: val.email, digestIntervalMinutes: val.digest });
      }

      const res = await fetch("/api/v1/notifications/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ preferences }),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast.success("Notification preferences saved");
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const toggleInApp = (type: string) => {
    setPrefs((p) => ({ ...p, [type]: { ...p[type], inApp: !p[type].inApp } }));
  };

  const toggleEmail = (type: string) => {
    setPrefs((p) => ({ ...p, [type]: { ...p[type], email: !p[type].email } }));
  };

  const setDigest = (type: string, value: string) => {
    setPrefs((p) => ({ ...p, [type]: { ...p[type], digest: parseInt(value) } }));
  };

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal>
      <div className="space-y-6 px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Notification Preferences</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Choose how and when you want to be notified
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
              <Save className="size-3" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Channel legend */}
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Bell className="size-3.5" />
            <span>In-App</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Mail className="size-3.5" />
            <span>Email</span>
          </div>
        </div>

        {/* Notification type list */}
        <div className="rounded-lg border divide-y">
          {NOTIFICATION_TYPES.map((t) => {
            const Icon = t.icon;
            const val = prefs[t.type];

            return (
              <div key={t.type} className="flex items-center gap-4 px-4 py-3.5">
                <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", t.color)}>
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{t.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t.description}</p>
                </div>
                <div className="flex items-center gap-5 shrink-0">
                  {/* In-app toggle */}
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`${t.type}-inapp`} className="text-[11px] text-muted-foreground">
                      <Bell className="size-3" />
                    </Label>
                    <Switch
                      id={`${t.type}-inapp`}
                      checked={val.inApp}
                      onCheckedChange={() => toggleInApp(t.type)}
                      className="scale-90"
                    />
                  </div>
                  {/* Email toggle */}
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`${t.type}-email`} className="text-[11px] text-muted-foreground">
                      <Mail className="size-3" />
                    </Label>
                    <Switch
                      id={`${t.type}-email`}
                      checked={val.email}
                      onCheckedChange={() => toggleEmail(t.type)}
                      className="scale-90"
                    />
                  </div>
                  {/* Digest interval (only for email) */}
                  {val.email && (
                    <Select value={String(val.digest)} onValueChange={(v) => setDigest(t.type, v)}>
                      <SelectTrigger className="h-7 w-[120px] text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIGEST_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value} className="text-xs">
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ContentReveal>
  );
}
