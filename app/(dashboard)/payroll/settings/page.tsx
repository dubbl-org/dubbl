"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import Link from "next/link";
import { Save, Plus, Trash2, Settings, Shield, Clock, CalendarDays, DollarSign, Layers, ExternalLink } from "lucide-react";
import { Section } from "@/components/dashboard/section";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { Switch } from "@/components/ui/switch";
import { CurrencySelect } from "@/components/ui/currency-select";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/lib/hooks/use-confirm";

interface PayrollSettingsData {
  defaultTaxRate: number;
  overtimeThresholdHours: number;
  overtimeMultiplier: number;
  defaultCurrency: string;
  salaryExpenseAccountCode: string;
  taxPayableAccountCode: string;
  bankAccountCode: string;
  autoApprovalEnabled: boolean;
}

interface DeductionType {
  id: string;
  name: string;
  description: string | null;
  category: string;
  defaultAmount: number | null;
  defaultPercent: number | null;
  isActive: boolean;
}

interface TaxBracket {
  id: string;
  name: string;
  jurisdictionLevel: string;
  jurisdiction: string | null;
  minIncome: number;
  maxIncome: number | null;
  rate: number;
}

interface ShiftDef {
  id: string;
  name: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  premiumPercent: number | null;
  isActive: boolean;
}

interface LeavePolicy {
  id: string;
  name: string;
  leaveType: string;
  accrualMethod: string;
  accrualRate: number;
  maxBalance: number | null;
  isActive: boolean;
}

interface ApprovalChain {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  steps: { id: string; stepOrder: number; approverId: string }[];
}

interface CompensationBand {
  id: string;
  name: string;
  level: string;
  minSalary: number;
  midSalary: number;
  maxSalary: number;
}

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

export default function PayrollSettingsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings
  const [settings, setSettings] = useState<PayrollSettingsData>({
    defaultTaxRate: 2000,
    overtimeThresholdHours: 40,
    overtimeMultiplier: 1.5,
    defaultCurrency: "USD",
    salaryExpenseAccountCode: "5100",
    taxPayableAccountCode: "2200",
    bankAccountCode: "1100",
    autoApprovalEnabled: false,
  });

  // Deduction types
  const [deductionTypes, setDeductionTypes] = useState<DeductionType[]>([]);
  const [deductionDrawer, setDeductionDrawer] = useState(false);
  const [newDeduction, setNewDeduction] = useState({ name: "", category: "post_tax", defaultAmount: "", defaultPercent: "" });

  // Tax brackets
  const [taxBrackets, setTaxBrackets] = useState<TaxBracket[]>([]);
  const [bracketDrawer, setBracketDrawer] = useState(false);
  const [newBracket, setNewBracket] = useState({ name: "", jurisdictionLevel: "federal", minIncome: "", maxIncome: "", rate: "" });

  // Shifts
  const [shifts, setShifts] = useState<ShiftDef[]>([]);
  const [shiftDrawer, setShiftDrawer] = useState(false);
  const [newShift, setNewShift] = useState({ name: "", shiftType: "regular", startTime: "09:00", endTime: "17:00", premiumPercent: "0" });

  // Leave policies
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicy[]>([]);
  const [leaveDrawer, setLeaveDrawer] = useState(false);
  const [newLeave, setNewLeave] = useState({ name: "", leaveType: "vacation", accrualMethod: "per_pay_period", accrualRate: "0", maxBalance: "" });

  // Approval chains
  const [approvalChains, setApprovalChains] = useState<ApprovalChain[]>([]);

  // Compensation bands
  const [compensationBands, setCompensationBands] = useState<CompensationBand[]>([]);
  const [bandDrawer, setBandDrawer] = useState(false);
  const [newBand, setNewBand] = useState({ name: "", level: "", minSalary: "", midSalary: "", maxSalary: "" });

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchAll = useCallback(() => {
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    Promise.all([
      fetch("/api/v1/payroll/settings", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/deductions/types", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/tax/brackets", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/shifts", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/leave/policies", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/approval-chains", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/compensation/bands", { headers }).then((r) => r.json()),
    ])
      .then(([settingsData, deductionsData, bracketsData, shiftsData, leaveData, chainsData, bandsData]) => {
        if (settingsData.settings) setSettings(settingsData.settings);
        if (deductionsData.data) setDeductionTypes(deductionsData.data);
        if (bracketsData.data) setTaxBrackets(bracketsData.data);
        if (shiftsData.data) setShifts(shiftsData.data);
        if (leaveData.data) setLeavePolicies(leaveData.data);
        if (chainsData.data) setApprovalChains(chainsData.data);
        if (bandsData.data) setCompensationBands(bandsData.data);
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleSaveSettings() {
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/payroll/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify(settings),
      });
      if (res.ok) toast.success("Settings saved");
      else toast.error("Failed to save settings");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDeduction() {
    if (!orgId || !newDeduction.name) return;
    try {
      const res = await fetch("/api/v1/payroll/deductions/types", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: newDeduction.name,
          category: newDeduction.category,
          defaultAmount: newDeduction.defaultAmount ? Math.round(parseFloat(newDeduction.defaultAmount) * 100) : undefined,
          defaultPercent: newDeduction.defaultPercent ? parseFloat(newDeduction.defaultPercent) : undefined,
        }),
      });
      if (res.ok) {
        toast.success("Deduction type added");
        setDeductionDrawer(false);
        setNewDeduction({ name: "", category: "post_tax", defaultAmount: "", defaultPercent: "" });
        fetchAll();
      }
    } catch {
      toast.error("Failed to add deduction type");
    }
  }

  async function handleDeleteDeduction(id: string) {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Delete deduction type?",
      description: "This will remove the deduction type. Existing employee deductions using it won't be affected.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    await fetch(`/api/v1/payroll/deductions/types/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    fetchAll();
  }

  async function handleAddBracket() {
    if (!orgId || !newBracket.name) return;
    try {
      const res = await fetch("/api/v1/payroll/tax/brackets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: newBracket.name,
          jurisdictionLevel: newBracket.jurisdictionLevel,
          minIncome: Math.round(parseFloat(newBracket.minIncome || "0") * 100),
          maxIncome: newBracket.maxIncome ? Math.round(parseFloat(newBracket.maxIncome) * 100) : null,
          rate: Math.round(parseFloat(newBracket.rate || "0") * 100),
        }),
      });
      if (res.ok) {
        toast.success("Tax bracket added");
        setBracketDrawer(false);
        setNewBracket({ name: "", jurisdictionLevel: "federal", minIncome: "", maxIncome: "", rate: "" });
        fetchAll();
      }
    } catch {
      toast.error("Failed to add tax bracket");
    }
  }

  async function handleAddShift() {
    if (!orgId || !newShift.name) return;
    try {
      const res = await fetch("/api/v1/payroll/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: newShift.name,
          shiftType: newShift.shiftType,
          startTime: newShift.startTime,
          endTime: newShift.endTime,
          premiumPercent: parseFloat(newShift.premiumPercent || "0"),
        }),
      });
      if (res.ok) {
        toast.success("Shift added");
        setShiftDrawer(false);
        setNewShift({ name: "", shiftType: "regular", startTime: "09:00", endTime: "17:00", premiumPercent: "0" });
        fetchAll();
      }
    } catch {
      toast.error("Failed to add shift");
    }
  }

  async function handleAddLeavePolicy() {
    if (!orgId || !newLeave.name) return;
    try {
      const res = await fetch("/api/v1/payroll/leave/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: newLeave.name,
          leaveType: newLeave.leaveType,
          accrualMethod: newLeave.accrualMethod,
          accrualRate: parseFloat(newLeave.accrualRate || "0"),
          maxBalance: newLeave.maxBalance ? parseFloat(newLeave.maxBalance) : null,
        }),
      });
      if (res.ok) {
        toast.success("Leave policy added");
        setLeaveDrawer(false);
        setNewLeave({ name: "", leaveType: "vacation", accrualMethod: "per_pay_period", accrualRate: "0", maxBalance: "" });
        fetchAll();
      }
    } catch {
      toast.error("Failed to add leave policy");
    }
  }

  async function handleAddBand() {
    if (!orgId || !newBand.name) return;
    try {
      const res = await fetch("/api/v1/payroll/compensation/bands", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: newBand.name,
          level: newBand.level,
          minSalary: Math.round(parseFloat(newBand.minSalary || "0") * 100),
          midSalary: Math.round(parseFloat(newBand.midSalary || "0") * 100),
          maxSalary: Math.round(parseFloat(newBand.maxSalary || "0") * 100),
        }),
      });
      if (res.ok) {
        toast.success("Compensation band added");
        setBandDrawer(false);
        setNewBand({ name: "", level: "", minSalary: "", midSalary: "", maxSalary: "" });
        fetchAll();
      }
    } catch {
      toast.error("Failed to add compensation band");
    }
  }

  async function handleDeleteBand(id: string) {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Delete compensation band?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    await fetch(`/api/v1/payroll/compensation/bands/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    fetchAll();
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <div className="max-w-4xl space-y-8">
        {/* General Settings */}
        <motion.div {...anim(0)}>
          <Section title="General" description="Default payroll configuration.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Default Tax Rate (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={(settings.defaultTaxRate / 100).toFixed(2)}
                  onChange={(e) => setSettings({ ...settings, defaultTaxRate: Math.round(parseFloat(e.target.value || "0") * 100) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">OT Threshold (hours/week)</Label>
                <Input
                  type="number"
                  value={settings.overtimeThresholdHours}
                  onChange={(e) => setSettings({ ...settings, overtimeThresholdHours: parseFloat(e.target.value || "40") })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">OT Multiplier</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={settings.overtimeMultiplier}
                  onChange={(e) => setSettings({ ...settings, overtimeMultiplier: parseFloat(e.target.value || "1.5") })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Default Currency</Label>
                <CurrencySelect
                  value={settings.defaultCurrency}
                  onValueChange={(v) => setSettings({ ...settings, defaultCurrency: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Salary Expense Account</Label>
                <Input
                  value={settings.salaryExpenseAccountCode}
                  onChange={(e) => setSettings({ ...settings, salaryExpenseAccountCode: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tax Payable Account</Label>
                <Input
                  value={settings.taxPayableAccountCode}
                  onChange={(e) => setSettings({ ...settings, taxPayableAccountCode: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bank Account</Label>
                <Input
                  value={settings.bankAccountCode}
                  onChange={(e) => setSettings({ ...settings, bankAccountCode: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-3 pt-5">
                <Switch
                  checked={settings.autoApprovalEnabled}
                  onCheckedChange={(v: boolean) => setSettings({ ...settings, autoApprovalEnabled: v })}
                />
                <Label className="text-xs">Auto-approve payroll runs</Label>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                onClick={handleSaveSettings}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Save className="mr-1.5 size-3.5" />
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Deduction Types */}
        <motion.div {...anim(0.05)}>
          <Section title="Deduction Types" description="Manage recurring deduction categories.">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setDeductionDrawer(true)}>
                  <Plus className="mr-1.5 size-3" />
                  Add Type
                </Button>
              </div>
              {deductionTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No deduction types configured</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {deductionTypes.map((dt) => (
                    <div key={dt.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{dt.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px]">{dt.category === "pre_tax" ? "Pre-tax" : "Post-tax"}</Badge>
                          {dt.defaultAmount && <span className="text-xs text-muted-foreground">${(dt.defaultAmount / 100).toFixed(2)}</span>}
                          {dt.defaultPercent && <span className="text-xs text-muted-foreground">{dt.defaultPercent}%</span>}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => handleDeleteDeduction(dt.id)}>
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Tax Brackets */}
        <motion.div {...anim(0.1)}>
          <Section title="Tax Brackets" description="Configure progressive tax rates.">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setBracketDrawer(true)}>
                  <Plus className="mr-1.5 size-3" />
                  Add Bracket
                </Button>
              </div>
              {taxBrackets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No tax brackets configured</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {taxBrackets.map((b) => (
                    <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.jurisdictionLevel}{b.jurisdiction ? ` · ${b.jurisdiction}` : ""} · ${(b.minIncome / 100).toLocaleString()}{b.maxIncome ? ` - $${(b.maxIncome / 100).toLocaleString()}` : "+"} · {(b.rate / 100).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Shift Definitions */}
        <motion.div {...anim(0.15)}>
          <Section title="Shifts" description="Define work shifts and premiums.">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setShiftDrawer(true)}>
                  <Plus className="mr-1.5 size-3" />
                  Add Shift
                </Button>
              </div>
              {shifts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No shifts configured</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {shifts.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.startTime} - {s.endTime} · {s.shiftType}{s.premiumPercent ? ` · +${s.premiumPercent}%` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px]", s.isActive ? "text-emerald-600" : "text-muted-foreground")}>
                        {s.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Leave Policies */}
        <motion.div {...anim(0.2)}>
          <Section title="Leave Policies" description="Configure PTO and leave accrual rules.">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setLeaveDrawer(true)}>
                  <Plus className="mr-1.5 size-3" />
                  Add Policy
                </Button>
              </div>
              {leavePolicies.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No leave policies configured</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {leavePolicies.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.leaveType} · {p.accrualRate}h/{p.accrualMethod.replace(/_/g, " ")}{p.maxBalance ? ` · Max ${p.maxBalance}h` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Approval Chains */}
        <motion.div {...anim(0.25)}>
          <Section title="Approval Chains" description="Configure payroll approval workflows.">
            {approvalChains.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No approval chains configured</p>
            ) : (
              <div className="rounded-lg border divide-y">
                {approvalChains.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.steps.length} step(s)</p>
                    </div>
                    <Badge variant="outline" className={cn("text-[10px]", c.isActive ? "text-emerald-600" : "text-muted-foreground")}>
                      {c.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Compensation Bands */}
        <motion.div {...anim(0.3)}>
          <Section title="Compensation Bands" description="Define salary ranges by level for benchmarking and offers.">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setBandDrawer(true)}>
                  <Plus className="mr-1.5 size-3" />
                  Add Band
                </Button>
              </div>
              {compensationBands.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No compensation bands configured</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {compensationBands.map((band) => (
                    <div key={band.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{band.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Level {band.level} · ${(band.minSalary / 100).toLocaleString()} - ${(band.midSalary / 100).toLocaleString()} - ${(band.maxSalary / 100).toLocaleString()}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => handleDeleteBand(band.id)}>
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Self-Service Link */}
        <motion.div {...anim(0.35)}>
          <Section title="Self-Service Portal" description="Employees can view pay stubs, update tax forms, and manage their payroll preferences.">
            <div className="flex items-center gap-3">
              <Button asChild size="sm" variant="outline">
                <Link href="/payroll/self-service">
                  <ExternalLink className="mr-1.5 size-3" />
                  Open Self-Service Portal
                </Link>
              </Button>
            </div>
          </Section>
        </motion.div>
      </div>

      {/* Deduction Drawer */}
      <Sheet open={deductionDrawer} onOpenChange={setDeductionDrawer}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <DollarSign className="size-5" />
              </div>
              <div>
                <SheetTitle>Add Deduction Type</SheetTitle>
                <SheetDescription>Create a new recurring deduction category.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddDeduction(); }}>
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newDeduction.name} onChange={(e) => setNewDeduction({ ...newDeduction, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={newDeduction.category} onValueChange={(v) => setNewDeduction({ ...newDeduction, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre_tax">Pre-tax</SelectItem>
                    <SelectItem value="post_tax">Post-tax</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Default Amount ($)</Label>
                  <Input type="number" step="0.01" value={newDeduction.defaultAmount} onChange={(e) => setNewDeduction({ ...newDeduction, defaultAmount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Default Percent (%)</Label>
                  <Input type="number" step="0.01" value={newDeduction.defaultPercent} onChange={(e) => setNewDeduction({ ...newDeduction, defaultPercent: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="border-t px-4 py-3 sm:px-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeductionDrawer(false)}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Create</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Tax Bracket Drawer */}
      <Sheet open={bracketDrawer} onOpenChange={setBracketDrawer}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Shield className="size-5" />
              </div>
              <div>
                <SheetTitle>Add Tax Bracket</SheetTitle>
                <SheetDescription>Define a new progressive tax rate bracket.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddBracket(); }}>
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newBracket.name} onChange={(e) => setNewBracket({ ...newBracket, name: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Jurisdiction Level</Label>
                  <Select value={newBracket.jurisdictionLevel} onValueChange={(v) => setNewBracket({ ...newBracket, jurisdictionLevel: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="federal">Federal</SelectItem>
                      <SelectItem value="state">State</SelectItem>
                      <SelectItem value="local">Local</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rate (%)</Label>
                  <Input type="number" step="0.01" value={newBracket.rate} onChange={(e) => setNewBracket({ ...newBracket, rate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Min Income ($)</Label>
                  <Input type="number" value={newBracket.minIncome} onChange={(e) => setNewBracket({ ...newBracket, minIncome: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Max Income ($)</Label>
                  <Input type="number" value={newBracket.maxIncome} onChange={(e) => setNewBracket({ ...newBracket, maxIncome: e.target.value })} placeholder="Unlimited" />
                </div>
              </div>
            </div>
            <div className="border-t px-4 py-3 sm:px-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBracketDrawer(false)}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Create</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Shift Drawer */}
      <Sheet open={shiftDrawer} onOpenChange={setShiftDrawer}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Clock className="size-5" />
              </div>
              <div>
                <SheetTitle>Add Shift</SheetTitle>
                <SheetDescription>Define a new work shift with optional premium.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddShift(); }}>
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newShift.name} onChange={(e) => setNewShift({ ...newShift, name: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={newShift.shiftType} onValueChange={(v) => setNewShift({ ...newShift, shiftType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="overtime">Overtime</SelectItem>
                      <SelectItem value="night">Night</SelectItem>
                      <SelectItem value="weekend">Weekend</SelectItem>
                      <SelectItem value="holiday">Holiday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Premium (%)</Label>
                  <Input type="number" step="0.1" value={newShift.premiumPercent} onChange={(e) => setNewShift({ ...newShift, premiumPercent: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input type="time" value={newShift.startTime} onChange={(e) => setNewShift({ ...newShift, startTime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input type="time" value={newShift.endTime} onChange={(e) => setNewShift({ ...newShift, endTime: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="border-t px-4 py-3 sm:px-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShiftDrawer(false)}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Create</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Leave Policy Drawer */}
      <Sheet open={leaveDrawer} onOpenChange={setLeaveDrawer}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CalendarDays className="size-5" />
              </div>
              <div>
                <SheetTitle>Add Leave Policy</SheetTitle>
                <SheetDescription>Configure a new PTO or leave accrual rule.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddLeavePolicy(); }}>
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newLeave.name} onChange={(e) => setNewLeave({ ...newLeave, name: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Leave Type</Label>
                  <Select value={newLeave.leaveType} onValueChange={(v) => setNewLeave({ ...newLeave, leaveType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vacation">Vacation</SelectItem>
                      <SelectItem value="sick">Sick</SelectItem>
                      <SelectItem value="personal">Personal</SelectItem>
                      <SelectItem value="parental">Parental</SelectItem>
                      <SelectItem value="bereavement">Bereavement</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Accrual Method</Label>
                  <Select value={newLeave.accrualMethod} onValueChange={(v) => setNewLeave({ ...newLeave, accrualMethod: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_pay_period">Per Pay Period</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                      <SelectItem value="front_loaded">Front Loaded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Accrual Rate (hours)</Label>
                  <Input type="number" step="0.5" value={newLeave.accrualRate} onChange={(e) => setNewLeave({ ...newLeave, accrualRate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Max Balance (hours)</Label>
                  <Input type="number" value={newLeave.maxBalance} onChange={(e) => setNewLeave({ ...newLeave, maxBalance: e.target.value })} placeholder="Unlimited" />
                </div>
              </div>
            </div>
            <div className="border-t px-4 py-3 sm:px-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLeaveDrawer(false)}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Create</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Compensation Band Drawer */}
      <Sheet open={bandDrawer} onOpenChange={setBandDrawer}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Layers className="size-5" />
              </div>
              <div>
                <SheetTitle>Add Compensation Band</SheetTitle>
                <SheetDescription>Define a salary range for a specific level.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddBand(); }}>
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newBand.name} onChange={(e) => setNewBand({ ...newBand, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Input value={newBand.level} onChange={(e) => setNewBand({ ...newBand, level: e.target.value })} placeholder="e.g. L3, Senior" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Min Salary ($)</Label>
                  <Input type="number" step="0.01" value={newBand.minSalary} onChange={(e) => setNewBand({ ...newBand, minSalary: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Mid Salary ($)</Label>
                  <Input type="number" step="0.01" value={newBand.midSalary} onChange={(e) => setNewBand({ ...newBand, midSalary: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Max Salary ($)</Label>
                  <Input type="number" step="0.01" value={newBand.maxSalary} onChange={(e) => setNewBand({ ...newBand, maxSalary: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="border-t px-4 py-3 sm:px-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBandDrawer(false)}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Create</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </ContentReveal>
  );
}
