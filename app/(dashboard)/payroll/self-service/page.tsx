"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { User, Send, Save } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { cn } from "@/lib/utils";

interface Profile {
  id: string;
  name: string;
  email: string | null;
  employeeNumber: string;
  position: string | null;
  salary: number;
  bankAccountNumber: string | null;
  ptoBalanceHours: number;
}

interface Payslip {
  id: string;
  grossAmount: number;
  netAmount: number;
  generatedAt: string;
  payrollRun: { payPeriodStart: string; payPeriodEnd: string } | null;
}

interface LeaveBalance {
  id: string;
  policyId: string;
  balance: number;
  usedHours: number;
  policy: { name: string; leaveType: string } | null;
}

interface Timesheet {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalHours: number;
}

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

export default function SelfServicePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [leaveForm, setLeaveForm] = useState({ policyId: "", startDate: "", endDate: "", hours: "", reason: "" });
  const [requesting, setRequesting] = useState(false);
  const [email, setEmail] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  useDocumentTitle("Payroll · Self Service");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    // The profile decides everything else: when the login isn't linked to an
    // employee there is nothing more to load.
    fetch("/api/v1/payroll/self-service/profile", { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (profileData) => {
        if (!profileData?.employee) return;
        const emp = profileData.employee;
        setProfile(emp);
        setEmail(emp.email || "");
        setBankAccount(emp.bankAccountNumber || "");
        const [payslipData, leaveData, tsData] = await Promise.all([
          fetch("/api/v1/payroll/self-service/payslips", { headers }).then((r) => r.json()),
          fetch("/api/v1/payroll/self-service/leave-balance", { headers }).then((r) => r.json()),
          fetch("/api/v1/payroll/self-service/timesheets", { headers }).then((r) => r.json()),
        ]);
        if (payslipData.data) setPayslips(payslipData.data);
        if (leaveData.data) setLeaveBalances(leaveData.data);
        if (tsData.data) setTimesheets(tsData.data);
      })
      .catch(() => toast.error("Couldn't load your details"))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleSaveProfile() {
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/payroll/self-service/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          email: email || undefined,
          bankAccountNumber: bankAccount || undefined,
        }),
      });
      if (res.ok) toast.success("Profile updated");
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestLeave() {
    if (!orgId) return;
    const policyId = leaveForm.policyId || leaveBalances[0]?.policyId;
    const hours = parseFloat(leaveForm.hours);
    if (!policyId || !leaveForm.startDate || !leaveForm.endDate || !(hours > 0)) {
      toast.error("Pick the type of leave, the dates and how many hours");
      return;
    }
    setRequesting(true);
    try {
      const res = await fetch("/api/v1/payroll/self-service/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          policyId,
          startDate: leaveForm.startDate,
          endDate: leaveForm.endDate,
          hours,
          reason: leaveForm.reason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Couldn't send the request");
      }
      toast.success("Time off requested. Your manager will see it under Time & leave");
      setLeaveForm({ policyId: "", startDate: "", endDate: "", hours: "", reason: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the request");
    } finally {
      setRequesting(false);
    }
  }

  if (loading) return <BrandLoader />;

  if (!profile) {
    return (
      <ContentReveal className="space-y-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
            <User className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Your login isn&apos;t linked to an employee yet</p>
          <p className="mt-1 max-w-md text-[13px] text-muted-foreground">
            This page shows an employee their own payslips, leave and timesheets. Someone who manages payroll links it up by opening the employee and choosing your login under <span className="text-foreground">Self-service login</span>.
          </p>
          <Link href="/payroll/employees" className="mt-4 inline-flex h-8 items-center rounded-lg border border-border/80 px-3 text-[13px] font-medium hover:bg-foreground/[0.03]">
            Go to employees
          </Link>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Employee #</p>
          <p className="mt-1 text-lg font-bold font-mono">{profile.employeeNumber}</p>
        </motion.div>
        <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Position</p>
          <p className="mt-1 text-lg font-bold truncate">{profile.position || "-"}</p>
        </motion.div>
        <motion.div {...anim(0.1)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">PTO Balance</p>
          <p className="mt-1 text-lg font-bold font-mono tabular-nums">{profile.ptoBalanceHours}h</p>
        </motion.div>
        <motion.div {...anim(0.15)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Payslips</p>
          <p className="mt-1 text-lg font-bold font-mono tabular-nums">{payslips.length}</p>
        </motion.div>
      </div>

      <div className="max-w-4xl space-y-6">
        {/* Profile edit */}
        <Section title="My Profile" description="Update your contact and banking info.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bank Account</Label>
              <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={handleSaveProfile} disabled={saving} className="bg-brand-600 hover:bg-brand-700">
              <Save className="mr-1.5 size-3.5" /> {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </Section>

        <div className="h-px bg-border" />

        {/* Payslips */}
        <Section title="My Payslips" description="View your recent pay statements.">
          {payslips.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No payslips available</p>
          ) : (
            <div className="rounded-lg border divide-y">
              {payslips.slice(0, 10).map((ps) => (
                <div key={ps.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm">{ps.payrollRun?.payPeriodStart} to {ps.payrollRun?.payPeriodEnd}</p>
                    <p className="text-xs text-muted-foreground">{new Date(ps.generatedAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono tabular-nums">{formatMoney(ps.grossAmount)}</p>
                    <p className="text-xs text-muted-foreground font-mono">Net: {formatMoney(ps.netAmount)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <div className="h-px bg-border" />

        {/* Leave Balances */}
        <Section title="Leave Balances" description="Your current PTO and leave balances.">
          {leaveBalances.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted-foreground">No leave policies assigned to you yet. Once payroll assigns one, you can request time off here.</p>
          ) : (
            <div className="rounded-lg border divide-y">
              {leaveBalances.map((lb) => (
                <div key={lb.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{lb.policy?.name || "-"}</p>
                    <p className="text-xs text-muted-foreground">{lb.policy?.leaveType}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono tabular-nums">{lb.balance}h available</p>
                    <p className="text-xs text-muted-foreground">{lb.usedHours}h used</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {leaveBalances.length > 0 && (
            <div className="mt-4 rounded-lg border border-border/80 p-4">
              <p className="text-[13px] font-medium">Request time off</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Type of leave</Label>
                  <div className="flex flex-wrap gap-1">
                    {leaveBalances.map((lb) => {
                      const active = (leaveForm.policyId || leaveBalances[0]?.policyId) === lb.policyId;
                      return (
                        <button
                          key={lb.id}
                          type="button"
                          onClick={() => setLeaveForm((f) => ({ ...f, policyId: lb.policyId }))}
                          className={cn(
                            "h-7 rounded-md px-2.5 text-[12.5px] font-medium transition-colors",
                            active ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {lb.policy?.name ?? "Leave"}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">First day</Label>
                  <Input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value, endDate: f.endDate || e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Last day</Label>
                  <Input type="date" value={leaveForm.endDate} min={leaveForm.startDate || undefined} onChange={(e) => setLeaveForm((f) => ({ ...f, endDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Hours off in total</Label>
                  <Input type="number" min="0" step="0.5" placeholder="e.g. 16" value={leaveForm.hours} onChange={(e) => setLeaveForm((f) => ({ ...f, hours: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Note for your manager (optional)</Label>
                  <Input value={leaveForm.reason} onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))} />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={handleRequestLeave} disabled={requesting}>
                  <Send className="mr-1.5 size-3.5" /> {requesting ? "Sending..." : "Send request"}
                </Button>
              </div>
            </div>
          )}
        </Section>

        <div className="h-px bg-border" />

        {/* Timesheets */}
        <Section title="My Timesheets" description="Your recent timesheets.">
          {timesheets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No timesheets</p>
          ) : (
            <div className="rounded-lg border divide-y">
              {timesheets.slice(0, 5).map((ts) => (
                <div key={ts.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm">{ts.periodStart} to {ts.periodEnd}</p>
                    <p className="text-xs text-muted-foreground">{ts.totalHours}h</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{ts.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </ContentReveal>
  );
}
