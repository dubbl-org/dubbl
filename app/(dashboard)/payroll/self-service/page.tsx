"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { User, FileText, CalendarDays, Clock, Send, Save } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { formatMoney } from "@/lib/money";
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

  const [email, setEmail] = useState("");
  const [bankAccount, setBankAccount] = useState("");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    Promise.all([
      fetch("/api/v1/payroll/self-service/profile", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/self-service/payslips", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/self-service/leave-balance", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/self-service/timesheets", { headers }).then((r) => r.json()),
    ])
      .then(([profileData, payslipData, leaveData, tsData]) => {
        if (profileData.employee) {
          const emp = profileData.employee;
          setProfile(emp);
          setEmail(emp.email || "");
          setBankAccount(emp.bankAccountNumber || "");
        }
        if (payslipData.data) setPayslips(payslipData.data);
        if (leaveData.data) setLeaveBalances(leaveData.data);
        if (tsData.data) setTimesheets(tsData.data);
      })
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

  if (loading) return <BrandLoader />;

  if (!profile) {
    return (
      <ContentReveal className="space-y-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
            <User className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No employee profile found</p>
          <p className="text-xs text-muted-foreground mt-1">Your account is not linked to a payroll employee record</p>
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
            <Button size="sm" onClick={handleSaveProfile} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
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
            <p className="text-sm text-muted-foreground py-4 text-center">No leave balances found</p>
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
