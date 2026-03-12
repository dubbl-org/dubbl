"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  SheetFooter,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, UserCheck, XCircle, Shield } from "lucide-react";
import { toast } from "sonner";

interface Advisor {
  id: string;
  role: string;
  isActive: boolean;
  inviteEmail: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  advisor: { id: string; name: string | null; email: string } | null;
  grantedBy: { id: string; name: string | null } | null;
}

const ROLE_LABELS: Record<string, string> = {
  accountant: "Accountant",
  auditor: "Auditor",
  tax_advisor: "Tax Advisor",
  bookkeeper: "Bookkeeper",
};

export default function AdvisorsPage() {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("accountant");
  const [saving, setSaving] = useState(false);

  const fetchAdvisors = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/advisors", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => setAdvisors(data.advisors || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAdvisors();
  }, [fetchAdvisors]);

  const handleInvite = async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !email.trim()) return;
    setSaving(true);

    try {
      const res = await fetch("/api/v1/advisors/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to invite advisor");
        return;
      }

      toast.success("Advisor invited");
      setSheetOpen(false);
      setEmail("");
      fetchAdvisors();
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: string) => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const res = await fetch(`/api/v1/advisors?id=${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });

    if (res.ok) {
      toast.success("Access revoked");
      fetchAdvisors();
    } else {
      toast.error("Failed to revoke access");
    }
  };

  const getStatusBadge = (advisor: Advisor) => {
    if (advisor.revokedAt) return <Badge variant="destructive" className="text-[10px]">Revoked</Badge>;
    if (advisor.acceptedAt && advisor.isActive) return <Badge variant="default" className="text-[10px] bg-emerald-600">Active</Badge>;
    return <Badge variant="outline" className="text-[10px]">Pending</Badge>;
  };

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Advisors</h2>
            <p className="text-sm text-muted-foreground">
              Grant your accountant or bookkeeper read access to your organization.
            </p>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              setEmail("");
              setRole("accountant");
              setSheetOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            Invite Advisor
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : advisors.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="No advisors"
            description="Invite your accountant or bookkeeper to give them access to your financial data."
          >
            <Button size="sm" className="h-8 text-xs gap-1.5 mt-3" onClick={() => setSheetOpen(true)}>
              <Plus className="size-3.5" />
              Invite Advisor
            </Button>
          </EmptyState>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {advisors.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.advisor?.email || a.inviteEmail || "-"}
                    </TableCell>
                    <TableCell>{ROLE_LABELS[a.role] || a.role}</TableCell>
                    <TableCell>{getStatusBadge(a)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(a.invitedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {!a.revokedAt && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-red-600"
                          onClick={() => handleRevoke(a.id)}
                        >
                          <XCircle className="size-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Invite Advisor</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="accountant@example.com"
              />
              <p className="text-xs text-muted-foreground">
                The advisor must have an existing account.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accountant">Accountant</SelectItem>
                  <SelectItem value="auditor">Auditor</SelectItem>
                  <SelectItem value="tax_advisor">Tax Advisor</SelectItem>
                  <SelectItem value="bookkeeper">Bookkeeper</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">Advisor permissions</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Read access to all financial data</li>
                <li>View and export all reports</li>
                <li>Create and edit journal entries</li>
                <li>Manage period locks</li>
              </ul>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={saving || !email.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? "Inviting..." : "Send Invitation"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}
