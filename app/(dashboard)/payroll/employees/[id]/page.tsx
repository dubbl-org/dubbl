"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
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
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import Link from "next/link";

interface EmployeeDetail {
  id: string;
  name: string;
  email: string | null;
  employeeNumber: string;
  position: string | null;
  salary: number;
  payFrequency: string;
  taxRate: number;
  bankAccountNumber: string | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [emp, setEmp] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Edit form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [salary, setSalary] = useState("");
  const [payFrequency, setPayFrequency] = useState("monthly");
  const [taxRate, setTaxRate] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [isActive, setIsActive] = useState(true);

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/payroll/employees/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.employee) {
          const e = data.employee;
          setEmp(e);
          setName(e.name);
          setEmail(e.email || "");
          setPosition(e.position || "");
          setSalary((e.salary / 100).toFixed(2));
          setPayFrequency(e.payFrequency);
          setTaxRate((e.taxRate / 100).toFixed(2));
          setBankAccountNumber(e.bankAccountNumber || "");
          setIsActive(e.isActive);
        }
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  async function handleSave() {
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/payroll/employees/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name,
          email: email || null,
          position: position || null,
          salary: Math.round(parseFloat(salary) * 100),
          payFrequency,
          taxRate: Math.round(parseFloat(taxRate) * 100),
          bankAccountNumber: bankAccountNumber || null,
          isActive,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setEmp(data.employee);
        toast.success("Employee updated");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update");
      }
    } catch {
      toast.error("Failed to update employee");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Delete this employee?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/api/v1/payroll/employees/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      toast.success("Employee deleted");
      router.push("/payroll");
    } else {
      toast.error("Failed to delete employee");
    }
  }

  if (loading)
    return (
      <div className="space-y-6">
        <PageHeader title="Loading..." />
      </div>
    );
  if (!emp)
    return (
      <div className="space-y-6">
        <PageHeader title="Employee not found" />
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${emp.employeeNumber} - ${emp.name}`}
        description={emp.position || undefined}
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/payroll">
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Link>
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Save className="mr-2 size-4" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          className="text-red-600"
        >
          <Trash2 className="mr-2 size-4" />
          Delete
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge
          variant="outline"
          className={
            emp.isActive
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-gray-200 bg-gray-50 text-gray-700"
          }
        >
          {emp.isActive ? "Active" : "Inactive"}
        </Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">
          Started {emp.startDate} · Annual salary{" "}
          {formatMoney(emp.salary)}
        </span>
      </div>

      <div className="max-w-4xl space-y-4 sm:space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Position</Label>
            <Input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={isActive ? "active" : "inactive"}
              onValueChange={(v) => setIsActive(v === "active")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Annual Salary</Label>
            <Input
              type="number"
              step="0.01"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Pay Frequency</Label>
            <Select value={payFrequency} onValueChange={setPayFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Biweekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tax Rate (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Bank Account Number</Label>
          <Input
            value={bankAccountNumber}
            onChange={(e) => setBankAccountNumber(e.target.value)}
          />
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
