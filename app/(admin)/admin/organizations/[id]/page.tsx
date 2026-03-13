"use client";

import { useState, useEffect, useCallback, use } from "react";
import Image from "next/image";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2,
  Users,
  ShieldCheck,
  User,
  Crown,
  Save,
  CreditCard,
  Zap,
  AlertTriangle,
  Check,
  Gauge,
  StickyNote,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  country: string | null;
  businessType: string | null;
  defaultCurrency: string;
  createdAt: string;
  deletedAt: string | null;
}

interface Sub {
  plan: string;
  status: string;
  seatCount: number;
  managedBy: string;
  customPlanName: string | null;
  adminNotes: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
  overrideMembers?: number | null;
  overrideStorageMb?: number | null;
  overrideContacts?: number | null;
  overrideInvoicesPerMonth?: number | null;
  overrideProjects?: number | null;
  overrideBankAccounts?: number | null;
  overrideMultiCurrency?: boolean | null;
  storagePlan?: string;
  overrideEntriesPerMonth?: number | null;
}

interface OrgMember {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  userName: string | null;
  userEmail: string;
}

interface Limits {
  members: number;
  storageMb: number;
  contacts: number;
  invoicesPerMonth: number;
  projects: number;
  bankAccounts: number;
  multiCurrency: boolean;
  entriesPerMonth: number;
  [key: string]: number | boolean | string[];
}

const ROLE_COLORS: Record<string, string> = {
  owner: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/50",
  admin: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/50",
  member: "text-zinc-600 bg-zinc-50 dark:text-zinc-400 dark:bg-zinc-800/50",
};

const ROLE_ICONS: Record<string, typeof User> = {
  owner: Crown,
  admin: ShieldCheck,
  member: User,
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50",
  trialing: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/50",
  past_due: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/50",
  canceled: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/50",
  incomplete: "text-zinc-600 bg-zinc-50 dark:text-zinc-400 dark:bg-zinc-800/50",
};

const PLAN_COLORS: Record<string, string> = {
  free: "border-zinc-200 dark:border-zinc-700",
  pro: "border-blue-200 dark:border-blue-800",
  business: "border-emerald-200 dark:border-emerald-800",
};

const LIMIT_FIELDS = [
  { key: "overrideMembers", defaultKey: "members", label: "Members", icon: Users },
  { key: "overrideStorageMb", defaultKey: "storageMb", label: "Storage (MB)", icon: Gauge },
  { key: "overrideContacts", defaultKey: "contacts", label: "Contacts", icon: Users },
  { key: "overrideInvoicesPerMonth", defaultKey: "invoicesPerMonth", label: "Invoices / mo", icon: CreditCard },
  { key: "overrideProjects", defaultKey: "projects", label: "Projects", icon: Building2 },
  { key: "overrideBankAccounts", defaultKey: "bankAccounts", label: "Bank Accounts", icon: CreditCard },
  { key: "overrideEntriesPerMonth", defaultKey: "entriesPerMonth", label: "Entries / mo", icon: StickyNote },
] as const;

export default function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [effectiveLimits, setEffectiveLimits] = useState<Limits | null>(null);
  const [planDefaults, setPlanDefaults] = useState<Limits | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("plan");

  // Edit state
  const [saving, setSaving] = useState(false);
  const [editPlan, setEditPlan] = useState("free");
  const [editStatus, setEditStatus] = useState("active");
  const [editSeatCount, setEditSeatCount] = useState("1");
  const [editManagedBy, setEditManagedBy] = useState("stripe");
  const [editCustomName, setEditCustomName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editOverrides, setEditOverrides] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  // Dialogs
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [switchDialogOpen, setSwitchDialogOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const fetchOrg = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/admin/organizations/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOrg(data.organization);
      setSub(data.subscription);
      setMembers(data.members);
      setEffectiveLimits(data.effectiveLimits);
      setPlanDefaults(data.planDefaults);
      populateEditState(data.subscription);
    } catch {
      toast.error("Failed to load organization");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const populateEditState = (s: Sub) => {
    setEditPlan(s.plan);
    setEditStatus(s.status);
    setEditSeatCount(String(s.seatCount));
    setEditManagedBy(s.managedBy);
    setEditCustomName(s.customPlanName || "");
    setEditNotes(s.adminNotes || "");
    const overrides: Record<string, string> = {};
    for (const f of LIMIT_FIELDS) {
      const val = s[f.key as keyof Sub];
      overrides[f.key] = val != null ? String(val) : "";
    }
    setEditOverrides(overrides);
    setDirty(false);
  };

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  const markDirty = () => setDirty(true);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        plan: editPlan,
        status: editStatus,
        seatCount: Number(editSeatCount) || 1,
        managedBy: editManagedBy,
        customPlanName: editCustomName,
        adminNotes: editNotes,
      };
      for (const f of LIMIT_FIELDS) {
        body[f.key] = editOverrides[f.key] === "" ? null : Number(editOverrides[f.key]);
      }
      const res = await fetch(`/api/v1/admin/organizations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success("Changes saved");
      setDirty(false);
      fetchOrg();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelStripe = async () => {
    setCanceling(true);
    try {
      const res = await fetch(`/api/v1/admin/organizations/${id}/cancel-stripe`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      toast.success("Stripe subscription canceled");
      setCancelDialogOpen(false);
      fetchOrg();
    } catch {
      toast.error("Failed to cancel subscription");
    } finally {
      setCanceling(false);
    }
  };

  const handleSwitchToEnterprise = async () => {
    setSaving(true);
    try {
      // Cancel Stripe first if active
      if (sub?.stripeSubscriptionId) {
        await fetch(`/api/v1/admin/organizations/${id}/cancel-stripe`, {
          method: "POST",
        });
      }
      // Set to manual management
      const res = await fetch(`/api/v1/admin/organizations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "business",
          status: "active",
          managedBy: "manual",
          customPlanName: "Enterprise",
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Switched to enterprise deal");
      setSwitchDialogOpen(false);
      fetchOrg();
    } catch {
      toast.error("Failed to switch");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[500px] rounded-lg" />
      </div>
    );
  }

  if (!org || !sub) return null;

  const displayPlan = sub.customPlanName || sub.plan;
  const isEnterprise = sub.managedBy === "manual";
  const hasStripe = !!sub.stripeSubscriptionId;

  return (
    <ContentReveal>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-muted">
              {org.logo ? (
                <Image src={org.logo} alt="" width={44} height={44} className="size-11 rounded-xl object-cover" />
              ) : (
                <Building2 className="size-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{org.name}</h2>
                <Badge
                  variant="outline"
                  className={cn("text-[11px] capitalize", isEnterprise ? "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/50" : STATUS_COLORS[sub.status] || "")}
                >
                  {sub.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {org.slug} · {org.defaultCurrency} · Created {new Date(org.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEnterprise && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setSwitchDialogOpen(true)}
              >
                <Zap className="size-3" />
                Switch to Enterprise
              </Button>
            )}
            {hasStripe && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                onClick={() => setCancelDialogOpen(true)}
              >
                <AlertTriangle className="size-3" />
                Cancel Stripe
              </Button>
            )}
          </div>
        </div>

        {/* Quick info row */}
        <div className="flex flex-wrap gap-3">
          <QuickStat label="Plan" value={
            <span className={cn("capitalize", isEnterprise && "text-purple-600 dark:text-purple-400")}>{displayPlan}</span>
          } />
          <QuickStat label="Seats" value={sub.seatCount} />
          <QuickStat label="Members" value={members.length} />
          <QuickStat label="Managed" value={sub.managedBy === "manual" ? "Manual" : "Stripe"} />
          {sub.stripeCustomerId && (
            <QuickStat label="Stripe" value={
              <span className="font-mono text-[10px]">{sub.stripeCustomerId}</span>
            } />
          )}
          {sub.currentPeriodEnd && (
            <QuickStat label="Renews" value={new Date(sub.currentPeriodEnd).toLocaleDateString()} />
          )}
        </div>

        <Separator />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList variant="line">
            <TabsTrigger value="plan">Plan & Limits</TabsTrigger>
            <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          {/* Plan & Limits tab */}
          <TabsContent value="plan" className="mt-6 space-y-6">
            {/* Plan tier cards */}
            <div>
              <Label className="text-xs text-muted-foreground mb-3 block">Plan Tier</Label>
              <div className="grid grid-cols-3 gap-3">
                {(["free", "pro", "business"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setEditPlan(p); markDirty(); }}
                    className={cn(
                      "relative rounded-lg border-2 p-3 text-left transition-all hover:shadow-sm",
                      editPlan === p
                        ? `${PLAN_COLORS[p]} ring-2 ring-offset-2 ring-offset-background ${p === "free" ? "ring-zinc-400" : p === "pro" ? "ring-blue-500" : "ring-emerald-500"}`
                        : "border-border hover:border-muted-foreground/30"
                    )}
                  >
                    {editPlan === p && (
                      <div className={cn(
                        "absolute top-2 right-2 size-4 rounded-full flex items-center justify-center",
                        p === "free" ? "bg-zinc-500" : p === "pro" ? "bg-blue-500" : "bg-emerald-500"
                      )}>
                        <Check className="size-2.5 text-white" />
                      </div>
                    )}
                    <p className="text-sm font-semibold capitalize">{p}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {p === "free" ? "$0/mo" : p === "pro" ? "$12/seat/mo" : "$29/seat/mo"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Status + Seats + Management */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={editStatus} onValueChange={(v) => { setEditStatus(v); markDirty(); }}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trialing">Trialing</SelectItem>
                    <SelectItem value="past_due">Past Due</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                    <SelectItem value="incomplete">Incomplete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Seat Count</Label>
                <Input
                  type="number"
                  min={1}
                  className="h-9"
                  value={editSeatCount}
                  onChange={(e) => { setEditSeatCount(e.target.value); markDirty(); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Billing</Label>
                <Select value={editManagedBy} onValueChange={(v) => { setEditManagedBy(v); markDirty(); }}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Custom Plan Name</Label>
              <Input
                placeholder="Leave empty to use tier name"
                className="h-9"
                value={editCustomName}
                onChange={(e) => { setEditCustomName(e.target.value); markDirty(); }}
              />
            </div>

            <Separator />

            {/* Limit overrides */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Label className="text-xs text-muted-foreground block">Limit Overrides</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Empty uses plan defaults. -1 for unlimited.</p>
                </div>
                {Object.values(editOverrides).some((v) => v !== "") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      const reset: Record<string, string> = {};
                      for (const f of LIMIT_FIELDS) reset[f.key] = "";
                      setEditOverrides(reset);
                      markDirty();
                    }}
                  >
                    Reset All
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {LIMIT_FIELDS.map((f) => {
                  const planVal = planDefaults ? planDefaults[f.defaultKey] : null;
                  const placeholder = planVal === Infinity ? "Unlimited" : String(planVal ?? "-");
                  const hasOverride = editOverrides[f.key] !== "";
                  return (
                    <div key={f.key} className={cn(
                      "rounded-lg border p-3 space-y-2 transition-colors",
                      hasOverride && "border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/20"
                    )}>
                      <div className="flex items-center gap-1.5">
                        <f.icon className="size-3 text-muted-foreground" />
                        <span className="text-[11px] font-medium text-muted-foreground">{f.label}</span>
                      </div>
                      <Input
                        type="number"
                        placeholder={placeholder}
                        className="h-8 text-sm"
                        value={editOverrides[f.key] || ""}
                        onChange={(e) => {
                          setEditOverrides((prev) => ({ ...prev, [f.key]: e.target.value }));
                          markDirty();
                        }}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Default: {placeholder}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Save bar */}
            {dirty && (
              <div className="sticky bottom-0 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3 bg-background/80 backdrop-blur border-t flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">You have unsaved changes</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => { if (sub) populateEditState(sub); }}
                  >
                    Discard
                  </Button>
                  <Button size="sm" className="gap-1.5 text-xs" onClick={handleSave} disabled={saving}>
                    <Save className="size-3" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Members tab */}
          <TabsContent value="members" className="mt-6">
            <div className="divide-y rounded-lg border">
              {members.map((m) => {
                const RoleIcon = ROLE_ICONS[m.role] || User;
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
                      {(m.userName || m.userEmail).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.userName || m.userEmail}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.userEmail}</p>
                    </div>
                    <p className="hidden sm:block text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </p>
                    <Badge variant="outline" className={cn("gap-1 text-[11px]", ROLE_COLORS[m.role] || "")}>
                      <RoleIcon className="size-3" />
                      {m.role}
                    </Badge>
                  </div>
                );
              })}
              {members.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">No members</div>
              )}
            </div>
          </TabsContent>

          {/* Notes tab */}
          <TabsContent value="notes" className="mt-6 space-y-4">
            <Textarea
              placeholder="Internal notes about this organization, enterprise deal terms, contacts..."
              value={editNotes}
              onChange={(e) => { setEditNotes(e.target.value); markDirty(); }}
              rows={8}
              className="text-sm"
            />
            {dirty && (
              <Button size="sm" className="gap-1.5 text-xs" onClick={handleSave} disabled={saving}>
                <Save className="size-3" />
                {saving ? "Saving..." : "Save Notes"}
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Cancel Stripe Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Stripe Subscription</DialogTitle>
            <DialogDescription>
              This will immediately cancel the Stripe subscription for {org.name}.
              The organization will keep their current plan tier but billing will stop.
            </DialogDescription>
          </DialogHeader>
          {sub.stripeSubscriptionId && (
            <div className="rounded-lg bg-muted/50 p-3 text-xs font-mono text-muted-foreground">
              {sub.stripeSubscriptionId}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCancelDialogOpen(false)}>
              Keep Subscription
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={handleCancelStripe}
              disabled={canceling}
            >
              <AlertTriangle className="size-3" />
              {canceling ? "Canceling..." : "Cancel Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Switch to Enterprise Dialog */}
      <Dialog open={switchDialogOpen} onOpenChange={setSwitchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch to Enterprise</DialogTitle>
            <DialogDescription>
              This will set {org.name} to a manually managed enterprise plan.
              {hasStripe && " Their Stripe subscription will be canceled."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="font-medium">What happens:</p>
            <ul className="space-y-1 text-muted-foreground text-xs">
              {hasStripe && <li className="flex items-center gap-2"><AlertTriangle className="size-3 text-amber-500" /> Stripe subscription canceled</li>}
              <li className="flex items-center gap-2"><Check className="size-3 text-emerald-500" /> Plan set to Business tier</li>
              <li className="flex items-center gap-2"><Check className="size-3 text-emerald-500" /> Billing set to Manual</li>
              <li className="flex items-center gap-2"><Check className="size-3 text-emerald-500" /> Custom name set to "Enterprise"</li>
              <li className="flex items-center gap-2"><Check className="size-3 text-emerald-500" /> You can customize limits after</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSwitchDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleSwitchToEnterprise}
              disabled={saving}
            >
              <Zap className="size-3" />
              {saving ? "Switching..." : "Switch to Enterprise"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentReveal>
  );
}

function QuickStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
