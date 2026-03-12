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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Building2,
  Users,
  ShieldCheck,
  User,
  Crown,
  Save,
  Pencil,
  Info,
} from "lucide-react";
import { toast } from "sonner";

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
  overrideMembers?: number | null;
  overrideStorageMb?: number | null;
  overrideContacts?: number | null;
  overrideInvoicesPerMonth?: number | null;
  overrideProjects?: number | null;
  overrideBankAccounts?: number | null;
  overrideCurrencies?: number | null;
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
  currencies: number;
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

const LIMIT_LABELS: Record<string, string> = {
  overrideMembers: "Members",
  overrideStorageMb: "Storage (MB)",
  overrideContacts: "Contacts",
  overrideInvoicesPerMonth: "Invoices / Month",
  overrideProjects: "Projects",
  overrideBankAccounts: "Bank Accounts",
  overrideCurrencies: "Currencies",
  overrideEntriesPerMonth: "Entries / Month",
};

const LIMIT_DEFAULT_KEYS: Record<string, string> = {
  overrideMembers: "members",
  overrideStorageMb: "storageMb",
  overrideContacts: "contacts",
  overrideInvoicesPerMonth: "invoicesPerMonth",
  overrideProjects: "projects",
  overrideBankAccounts: "bankAccounts",
  overrideCurrencies: "currencies",
  overrideEntriesPerMonth: "entriesPerMonth",
};

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
  const [saving, setSaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Edit form state
  const [editPlan, setEditPlan] = useState("free");
  const [editStatus, setEditStatus] = useState("active");
  const [editSeatCount, setEditSeatCount] = useState("1");
  const [editManagedBy, setEditManagedBy] = useState("stripe");
  const [editCustomName, setEditCustomName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editOverrides, setEditOverrides] = useState<Record<string, string>>({});

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
    } catch {
      toast.error("Failed to load organization");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  const openEditSheet = () => {
    if (!sub) return;
    setEditPlan(sub.plan);
    setEditStatus(sub.status);
    setEditSeatCount(String(sub.seatCount));
    setEditManagedBy(sub.managedBy);
    setEditCustomName(sub.customPlanName || "");
    setEditNotes(sub.adminNotes || "");

    const overrides: Record<string, string> = {};
    for (const key of Object.keys(LIMIT_LABELS)) {
      const val = sub[key as keyof Sub];
      overrides[key] = val != null ? String(val) : "";
    }
    setEditOverrides(overrides);
    setSheetOpen(true);
  };

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

      for (const key of Object.keys(LIMIT_LABELS)) {
        body[key] = editOverrides[key] === "" ? null : Number(editOverrides[key]);
      }

      const res = await fetch(`/api/v1/admin/organizations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error();
      toast.success("Subscription updated");
      setSheetOpen(false);
      fetchOrg();
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!org || !sub) return null;

  const displayPlan = sub.customPlanName || sub.plan;
  const isEnterprise = sub.managedBy === "manual";

  return (
    <ContentReveal>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              {org.logo ? (
                <Image src={org.logo} alt="" width={40} height={40} className="size-10 rounded-lg object-cover" />
              ) : (
                <Building2 className="size-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{org.name}</h2>
              <p className="text-xs text-muted-foreground">
                {org.slug} · {org.defaultCurrency} · Created {new Date(org.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openEditSheet}>
            <Pencil className="size-3" />
            Edit Plan
          </Button>
        </div>

        {/* Plan + Limits */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Subscription info */}
          <div className="rounded-lg border p-5 space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Crown className="size-4 text-muted-foreground" />
              Subscription
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow label="Plan" value={
                <Badge
                  variant="outline"
                  className={`text-[11px] capitalize ${isEnterprise ? "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/50" : ""}`}
                >
                  {displayPlan}
                </Badge>
              } />
              <InfoRow label="Status" value={
                <Badge variant="outline" className="text-[11px] capitalize">
                  {sub.status}
                </Badge>
              } />
              <InfoRow label="Seats" value={sub.seatCount} />
              <InfoRow label="Managed By" value={
                <Badge variant="outline" className="text-[11px] capitalize">
                  {sub.managedBy}
                </Badge>
              } />
              {sub.stripeCustomerId && (
                <InfoRow label="Stripe ID" value={
                  <span className="font-mono text-[11px]">{sub.stripeCustomerId}</span>
                } />
              )}
            </div>
            {sub.adminNotes && (
              <div className="pt-2 border-t">
                <p className="text-[11px] text-muted-foreground font-medium mb-1">Admin Notes</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{sub.adminNotes}</p>
              </div>
            )}
          </div>

          {/* Effective limits */}
          <div className="rounded-lg border p-5 space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Info className="size-4 text-muted-foreground" />
              Effective Limits
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {effectiveLimits && Object.entries(LIMIT_DEFAULT_KEYS).map(([overrideKey, defaultKey]) => {
                const val = effectiveLimits[defaultKey];
                const planVal = planDefaults ? planDefaults[defaultKey] : val;
                const isOverridden = val !== planVal;
                const display = val === Infinity || val === null ? "Unlimited" : String(val);
                return (
                  <div key={overrideKey} className="flex items-center justify-between gap-2 py-1">
                    <span className="text-xs text-muted-foreground">{LIMIT_LABELS[overrideKey]}</span>
                    <span className={`text-xs font-medium tabular-nums ${isOverridden ? "text-purple-600 dark:text-purple-400" : ""}`}>
                      {display}
                      {isOverridden && " *"}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">* Custom override applied</p>
          </div>
        </div>

        {/* Members */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              Members
            </h3>
            <Badge variant="secondary" className="text-xs">
              {members.length}
            </Badge>
          </div>
          <div className="divide-y rounded-lg border">
            {members.map((m) => {
              const RoleIcon = ROLE_ICONS[m.role] || User;
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                    {(m.userName || m.userEmail).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.userName || m.userEmail}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.userEmail}</p>
                  </div>
                  <Badge variant="outline" className={`gap-1 text-[11px] ${ROLE_COLORS[m.role] || ""}`}>
                    <RoleIcon className="size-3" />
                    {m.role}
                  </Badge>
                </div>
              );
            })}
            {members.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">No members</div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Subscription</SheetTitle>
            <SheetDescription>
              Modify plan, limits, and enterprise settings for {org.name}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-6">
            {/* Plan settings */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan</h4>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Plan Tier</Label>
                  <Select value={editPlan} onValueChange={setEditPlan}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger>
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Seat Count</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editSeatCount}
                    onChange={(e) => setEditSeatCount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Managed By</Label>
                  <Select value={editManagedBy} onValueChange={setEditManagedBy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stripe">Stripe</SelectItem>
                      <SelectItem value="manual">Manual (Enterprise)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Custom Plan Name</Label>
                <Input
                  placeholder="e.g. Enterprise, Startup Program"
                  value={editCustomName}
                  onChange={(e) => setEditCustomName(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Leave empty to show the tier name</p>
              </div>
            </div>

            {/* Limit overrides */}
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Limit Overrides</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Leave empty to use plan defaults. Use -1 for unlimited.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {Object.entries(LIMIT_LABELS).map(([key, label]) => {
                  const defaultKey = LIMIT_DEFAULT_KEYS[key];
                  const planDefault = planDefaults ? planDefaults[defaultKey] : null;
                  const placeholder = planDefault === Infinity ? "Unlimited" : String(planDefault ?? "");
                  return (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-xs">{label}</Label>
                      <Input
                        type="number"
                        placeholder={placeholder}
                        value={editOverrides[key] || ""}
                        onChange={(e) =>
                          setEditOverrides((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Admin notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Admin Notes</Label>
              <Textarea
                placeholder="Internal notes about this organization..."
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
              />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full gap-1.5">
              <Save className="size-3.5" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
