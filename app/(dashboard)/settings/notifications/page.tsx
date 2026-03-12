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
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

const DEBOUNCE_MINUTES = 120; // 2 hours

interface Preference {
  type: string;
  channel: string;
  enabled: boolean;
  digestIntervalMinutes: number;
}

type PrefState = Record<string, { inApp: boolean; email: boolean }>;

function buildDefaultState(): PrefState {
  const state: PrefState = {};
  for (const t of NOTIFICATION_TYPES) {
    state[t.type] = { inApp: true, email: false };
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
        preferences.push({ type, channel: "email", enabled: val.email, digestIntervalMinutes: DEBOUNCE_MINUTES });
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

  const anyEmailEnabled = Object.values(prefs).some((v) => v.email);

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal>
      <div className="space-y-6 px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Notification Preferences</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Choose how you want to be notified
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
                </div>
              </div>
            );
          })}
        </div>

        {/* Email debounce info */}
        {anyEmailEnabled && (
          <div className="flex items-start gap-3 rounded-lg border border-dashed px-4 py-3">
            <Clock className="size-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-medium">Email debounce</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                If multiple notifications arrive close together, they&apos;ll be grouped into a single digest email sent after a 2-hour window. This prevents inbox spam.
              </p>
            </div>
          </div>
        )}
      </div>
    </ContentReveal>
  );
}
