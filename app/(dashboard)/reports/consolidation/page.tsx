"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface ConsolidationGroupMember {
  id: string;
  orgId: string;
  label: string | null;
  organization: { id: string; name: string };
}

interface ConsolidationGroup {
  id: string;
  name: string;
  parentOrgId: string;
  members: ConsolidationGroupMember[];
  createdAt: string;
}

interface EntityPnL {
  orgId: string;
  label: string;
  revenue: number;
  expenses: number;
  netIncome: number;
}

interface EntityBS {
  orgId: string;
  label: string;
  assets: number;
  liabilities: number;
  equity: number;
}

interface AccountRow {
  type: string;
  name: string;
  code: string;
  total: number;
  byEntity: Record<string, number>;
}

interface ConsolidatedReport {
  group: { id: string; name: string };
  members: { orgId: string; label: string; orgName: string }[];
  startDate: string;
  endDate: string;
  consolidatedPnL: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
    byEntity: EntityPnL[];
    accounts: AccountRow[];
  };
  consolidatedBalanceSheet: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    byEntity: EntityBS[];
    accounts: AccountRow[];
  };
}

function getOrgId() {
  return typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
}

function apiFetch(url: string, options: RequestInit = {}) {
  const orgId = getOrgId();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(orgId ? { "x-organization-id": orgId } : {}),
      ...options.headers,
    },
  });
}

export default function ConsolidationPage() {
  const now = new Date();
  const [groups, setGroups] = useState<ConsolidationGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [report, setReport] = useState<ConsolidatedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [tab, setTab] = useState<"pnl" | "balance-sheet">("pnl");

  const [newGroupName, setNewGroupName] = useState("");
  const [addOrgId, setAddOrgId] = useState("");
  const [addLabel, setAddLabel] = useState("");

  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/v1/consolidation/groups");
      const data = await res.json();
      setGroups(data.groups || []);
      setSelectedGroupId((prev) => {
        if (!prev && data.groups?.length > 0) return data.groups[0].id;
        return prev;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReport = useCallback(async () => {
    if (!selectedGroupId) return;
    setReportLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await apiFetch(`/api/v1/consolidation/groups/${selectedGroupId}/report?${params}`);
      const data = await res.json();
      setReport(data);
    } finally {
      setReportLoading(false);
    }
  }, [selectedGroupId, startDate, endDate]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    if (selectedGroupId) fetchReport();
  }, [selectedGroupId, fetchReport]);

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    const res = await apiFetch("/api/v1/consolidation/groups", {
      method: "POST",
      body: JSON.stringify({ name: newGroupName.trim() }),
    });
    const data = await res.json();
    if (data.group) {
      setGroups((prev) => [{ ...data.group, members: [] }, ...prev]);
      setSelectedGroupId(data.group.id);
      setNewGroupName("");
    }
  };

  const deleteGroup = async (groupId: string) => {
    await apiFetch(`/api/v1/consolidation/groups/${groupId}`, { method: "DELETE" });
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    if (selectedGroupId === groupId) {
      setSelectedGroupId(groups.find((g) => g.id !== groupId)?.id || null);
      setReport(null);
    }
  };

  const addMember = async () => {
    if (!selectedGroupId || !addOrgId.trim()) return;
    const res = await apiFetch(`/api/v1/consolidation/groups/${selectedGroupId}/members`, {
      method: "POST",
      body: JSON.stringify({ orgId: addOrgId.trim(), label: addLabel.trim() || undefined }),
    });
    if (res.ok) {
      setAddOrgId("");
      setAddLabel("");
      await fetchGroups();
      await fetchReport();
    }
  };

  const removeMember = async (orgId: string) => {
    if (!selectedGroupId) return;
    await apiFetch(`/api/v1/consolidation/groups/${selectedGroupId}/members`, {
      method: "DELETE",
      body: JSON.stringify({ orgId }),
    });
    await fetchGroups();
    await fetchReport();
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const pnl = report?.consolidatedPnL;
  const bs = report?.consolidatedBalanceSheet;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consolidation"
        description="Combined financial statements across multiple entities."
      />

      {/* Group Management */}
      <div className="rounded-xl border border-border/50 bg-card/80 p-4 sm:p-6 space-y-4">
        <h2 className="text-sm font-semibold">Consolidation Groups</h2>

        {/* Create group */}
        <div className="flex gap-2">
          <Input
            placeholder="New group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createGroup()}
            className="max-w-xs"
          />
          <Button onClick={createGroup} size="sm" disabled={!newGroupName.trim()}>
            <Plus className="size-4 mr-1" />
            Create
          </Button>
        </div>

        {/* Group selector */}
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGroupId(g.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                  selectedGroupId === g.id
                    ? "border-emerald-500/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-border/50 hover:border-border"
                )}
              >
                <Building2 className="size-4" />
                {g.name}
                <Badge variant="secondary" className="text-xs">
                  {g.members.length}
                </Badge>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteGroup(g.id);
                  }}
                  className="ml-1 rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="size-3 text-muted-foreground hover:text-red-500" />
                </button>
              </button>
            ))}
          </div>
        )}

        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Create your first consolidation group to combine financial statements across entities.
          </p>
        )}
      </div>

      {/* Member Management */}
      {selectedGroup && (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 sm:p-6 space-y-4">
          <h2 className="text-sm font-semibold">
            Members of &quot;{selectedGroup.name}&quot;
          </h2>

          {/* Add member */}
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Organization ID"
              value={addOrgId}
              onChange={(e) => setAddOrgId(e.target.value)}
              className="max-w-xs"
            />
            <Input
              placeholder="Label (optional)"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              className="max-w-[200px]"
            />
            <Button onClick={addMember} size="sm" disabled={!addOrgId.trim()}>
              <Plus className="size-4 mr-1" />
              Add Entity
            </Button>
          </div>

          {/* Member list */}
          {selectedGroup.members.length > 0 ? (
            <div className="divide-y divide-border/50 rounded-lg border border-border/50">
              {selectedGroup.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Building2 className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{m.organization.name}</p>
                      {m.label && (
                        <p className="text-xs text-muted-foreground">{m.label}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMember(m.orgId)}
                    className="text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No member entities yet. Add organizations by their ID.
            </p>
          )}
        </div>
      )}

      {/* Report Section */}
      {selectedGroup && selectedGroup.members.length > 0 && (
        <>
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onDateChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />

          {/* Tab Switcher */}
          <div className="flex gap-1 rounded-lg bg-muted/50 p-1 w-fit">
            <button
              onClick={() => setTab("pnl")}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                tab === "pnl"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Profit & Loss
            </button>
            <button
              onClick={() => setTab("balance-sheet")}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                tab === "balance-sheet"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Balance Sheet
            </button>
          </div>

          {reportLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* P&L Tab */}
              {tab === "pnl" && pnl && (
                <div className="space-y-6">
                  {/* Stats */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard title="Total Revenue" value={formatMoney(pnl.totalRevenue)} icon={TrendingUp} changeType="positive" />
                    <StatCard title="Total Expenses" value={formatMoney(pnl.totalExpenses)} icon={TrendingDown} changeType="negative" />
                    <StatCard
                      title="Net Income"
                      value={formatMoney(pnl.netIncome)}
                      icon={DollarSign}
                      changeType={pnl.netIncome >= 0 ? "positive" : "negative"}
                    />
                  </div>

                  {/* Per Entity Summary */}
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <div className="bg-muted/30 px-4 py-3">
                      <h3 className="text-sm font-semibold">Per Entity Summary</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/50">
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Entity</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Expenses</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Net Income</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pnl.byEntity.map((e) => (
                            <tr key={e.orgId} className="border-b border-border/30">
                              <td className="px-4 py-3 font-medium">{e.label}</td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(e.revenue)}</td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(e.expenses)}</td>
                              <td className={cn("px-4 py-3 text-right font-mono tabular-nums", e.netIncome >= 0 ? "text-emerald-600" : "text-red-600")}>
                                {formatMoney(e.netIncome)}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-muted/30 font-semibold">
                            <td className="px-4 py-3">Total</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(pnl.totalRevenue)}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(pnl.totalExpenses)}</td>
                            <td className={cn("px-4 py-3 text-right font-mono tabular-nums", pnl.netIncome >= 0 ? "text-emerald-600" : "text-red-600")}>
                              {formatMoney(pnl.netIncome)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Account Detail */}
                  <AccountDetailTable
                    title="Account Detail"
                    accounts={pnl.accounts}
                    members={report!.members}
                  />
                </div>
              )}

              {/* Balance Sheet Tab */}
              {tab === "balance-sheet" && bs && (
                <div className="space-y-6">
                  {/* Stats */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard title="Total Assets" value={formatMoney(bs.totalAssets)} icon={TrendingUp} changeType="positive" />
                    <StatCard title="Total Liabilities" value={formatMoney(bs.totalLiabilities)} icon={TrendingDown} changeType="negative" />
                    <StatCard title="Total Equity" value={formatMoney(bs.totalEquity)} icon={DollarSign} changeType="positive" />
                  </div>

                  {/* Per Entity Summary */}
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <div className="bg-muted/30 px-4 py-3">
                      <h3 className="text-sm font-semibold">Per Entity Summary</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/50">
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Entity</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Assets</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Liabilities</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Equity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bs.byEntity.map((e) => (
                            <tr key={e.orgId} className="border-b border-border/30">
                              <td className="px-4 py-3 font-medium">{e.label}</td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(e.assets)}</td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(e.liabilities)}</td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(e.equity)}</td>
                            </tr>
                          ))}
                          <tr className="bg-muted/30 font-semibold">
                            <td className="px-4 py-3">Total</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(bs.totalAssets)}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(bs.totalLiabilities)}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(bs.totalEquity)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Account Detail */}
                  <AccountDetailTable
                    title="Account Detail"
                    accounts={bs.accounts}
                    members={report!.members}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function AccountDetailTable({
  title,
  accounts,
  members,
}: {
  title: string;
  accounts: AccountRow[];
  members: { orgId: string; label: string; orgName: string }[];
}) {
  if (accounts.length === 0) return null;

  // Group by type
  const grouped = new Map<string, AccountRow[]>();
  for (const a of accounts) {
    const existing = grouped.get(a.type) || [];
    existing.push(a);
    grouped.set(a.type, existing);
  }

  const typeLabels: Record<string, string> = {
    revenue: "Revenue",
    expense: "Expenses",
    asset: "Assets",
    liability: "Liabilities",
    equity: "Equity",
  };

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <div className="bg-muted/30 px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Account</th>
              {members.map((m) => (
                <th key={m.orgId} className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  {m.label}
                </th>
              ))}
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(grouped.entries()).map(([type, typeAccounts]) => (
              <GroupSection key={type} type={type} label={typeLabels[type] || type} accounts={typeAccounts} members={members} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupSection({
  label,
  accounts,
  members,
}: {
  type: string;
  label: string;
  accounts: AccountRow[];
  members: { orgId: string; label: string; orgName: string }[];
}) {
  const groupTotal = accounts.reduce((sum, a) => sum + a.total, 0);
  const entityTotals: Record<string, number> = {};
  for (const m of members) {
    entityTotals[m.orgId] = accounts.reduce((sum, a) => sum + (a.byEntity[m.orgId] || 0), 0);
  }

  return (
    <>
      <tr className="bg-muted/20">
        <td colSpan={members.length + 2} className="px-4 py-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </td>
      </tr>
      {accounts.map((a) => (
        <tr key={`${a.type}:${a.code}`} className="border-b border-border/20">
          <td className="px-4 py-2.5">
            <span className="font-mono text-xs text-muted-foreground mr-2">{a.code}</span>
            {a.name}
          </td>
          {members.map((m) => (
            <td key={m.orgId} className="px-4 py-2.5 text-right font-mono tabular-nums">
              {formatMoney(a.byEntity[m.orgId] || 0)}
            </td>
          ))}
          <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
            {formatMoney(a.total)}
          </td>
        </tr>
      ))}
      <tr className="border-b border-border/50 bg-muted/10">
        <td className="px-4 py-2 font-semibold text-sm">Total {label}</td>
        {members.map((m) => (
          <td key={m.orgId} className="px-4 py-2 text-right font-mono tabular-nums font-semibold">
            {formatMoney(entityTotals[m.orgId] || 0)}
          </td>
        ))}
        <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold">
          {formatMoney(groupTotal)}
        </td>
      </tr>
    </>
  );
}
