"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ArrowLeft,
  Building2,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ChevronsUpDown,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExportButton } from "@/components/dashboard/export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface UserOrg {
  id: string;
  name: string;
  slug: string;
  country: string | null;
}

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
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<ConsolidationGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [report, setReport] = useState<ConsolidatedReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [tab, setTab] = useState<"pnl" | "balance-sheet">("pnl");

  const [newGroupName, setNewGroupName] = useState("");
  const [userOrgs, setUserOrgs] = useState<UserOrg[]>([]);
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);

  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));

  const activeOrgId = getOrgId();

  useEffect(() => {
    fetch("/api/v1/organization")
      .then((r) => r.json())
      .then((data) => {
        if (data.organizations) {
          setUserOrgs(data.organizations);
        }
      })
      .catch(() => {});
  }, []);

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
      setInitialLoad(false);
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

  const addMember = async (orgId: string, label: string) => {
    if (!selectedGroupId || !orgId) return;
    const res = await apiFetch(`/api/v1/consolidation/groups/${selectedGroupId}/members`, {
      method: "POST",
      body: JSON.stringify({ orgId, label: label || undefined }),
    });
    if (res.ok) {
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

  // Filter out orgs that are already members or the active (parent) org
  const availableOrgs = useMemo(() => {
    const memberOrgIds = new Set(selectedGroup?.members.map((m) => m.orgId) || []);
    return userOrgs.filter(
      (o) => o.id !== activeOrgId && !memberOrgIds.has(o.id)
    );
  }, [userOrgs, activeOrgId, selectedGroup?.members]);

  // Build export data
  const exportData = useMemo(() => {
    if (!report) return [];
    if (tab === "pnl" && pnl) {
      return pnl.accounts.map((a) => {
        const row: Record<string, string | number> = {
          type: a.type,
          code: a.code,
          name: a.name,
          total: a.total,
        };
        for (const m of report.members) {
          row[m.label] = a.byEntity[m.orgId] || 0;
        }
        return row;
      });
    }
    if (tab === "balance-sheet" && bs) {
      return bs.accounts.map((a) => {
        const row: Record<string, string | number> = {
          type: a.type,
          code: a.code,
          name: a.name,
          total: a.total,
        };
        for (const m of report.members) {
          row[m.label] = a.byEntity[m.orgId] || 0;
        }
        return row;
      });
    }
    return [];
  }, [report, tab, pnl, bs]);

  const exportColumns = useMemo(() => {
    if (!report) return [];
    const memberCols = report.members.map((m) => m.label);
    return ["type", "code", "name", ...memberCols, "total"];
  }, [report]);

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Consolidation"
        description="Combined financial statements across multiple entities."
      >
        {report && exportData.length > 0 && (
          <ExportButton
            data={exportData}
            columns={exportColumns}
            filename={`consolidation-${tab}`}
          />
        )}
      </PageHeader>

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

          {/* Add member - org picker */}
          {availableOrgs.length > 0 ? (
            <Popover open={orgPickerOpen} onOpenChange={setOrgPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="size-4" />
                  Add Entity
                  <ChevronsUpDown className="size-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search organizations..." />
                  <CommandList>
                    <CommandEmpty>No organizations found.</CommandEmpty>
                    <CommandGroup>
                      {availableOrgs.map((org) => (
                        <CommandItem
                          key={org.id}
                          value={`${org.name} ${org.slug}`}
                          onSelect={() => {
                            addMember(org.id, org.name);
                            setOrgPickerOpen(false);
                          }}
                        >
                          <Building2 className="size-4 mr-2 shrink-0 text-muted-foreground" />
                          <div className="flex flex-col min-w-0">
                            <span className="truncate text-sm">{org.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {org.slug}{org.country ? ` · ${org.country}` : ""}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : (
            <p className="text-xs text-muted-foreground">
              {userOrgs.length <= 1
                ? "You only belong to one organization. Create another org to add it here."
                : "All your organizations have been added to this group."}
            </p>
          )}

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
              No member entities yet. Select an organization to add.
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
            <BrandLoader className="h-48" />
          ) : report ? (
            <div className="space-y-6">
              {/* P&L Tab */}
              {tab === "pnl" && pnl && (
                <>
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
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/50">
                          <TableHead className="px-4">Entity</TableHead>
                          <TableHead className="px-4 text-right">Revenue</TableHead>
                          <TableHead className="px-4 text-right">Expenses</TableHead>
                          <TableHead className="px-4 text-right">Net Income</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pnl.byEntity.map((e) => (
                          <TableRow key={e.orgId} className="border-border/30">
                            <TableCell className="px-4 py-3 font-medium">{e.label}</TableCell>
                            <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(e.revenue)}</TableCell>
                            <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(e.expenses)}</TableCell>
                            <TableCell className={cn("px-4 py-3 text-right font-mono tabular-nums", e.netIncome >= 0 ? "text-emerald-600" : "text-red-600")}>
                              {formatMoney(e.netIncome)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/30 font-semibold hover:bg-muted/30">
                          <TableCell className="px-4 py-3">Total</TableCell>
                          <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(pnl.totalRevenue)}</TableCell>
                          <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(pnl.totalExpenses)}</TableCell>
                          <TableCell className={cn("px-4 py-3 text-right font-mono tabular-nums", pnl.netIncome >= 0 ? "text-emerald-600" : "text-red-600")}>
                            {formatMoney(pnl.netIncome)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <AccountDetailTable
                    title="Account Detail"
                    accounts={pnl.accounts}
                    members={report.members}
                  />
                </>
              )}

              {/* Balance Sheet Tab */}
              {tab === "balance-sheet" && bs && (
                <>
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
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/50">
                          <TableHead className="px-4">Entity</TableHead>
                          <TableHead className="px-4 text-right">Assets</TableHead>
                          <TableHead className="px-4 text-right">Liabilities</TableHead>
                          <TableHead className="px-4 text-right">Equity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bs.byEntity.map((e) => (
                          <TableRow key={e.orgId} className="border-border/30">
                            <TableCell className="px-4 py-3 font-medium">{e.label}</TableCell>
                            <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(e.assets)}</TableCell>
                            <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(e.liabilities)}</TableCell>
                            <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(e.equity)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/30 font-semibold hover:bg-muted/30">
                          <TableCell className="px-4 py-3">Total</TableCell>
                          <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(bs.totalAssets)}</TableCell>
                          <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(bs.totalLiabilities)}</TableCell>
                          <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(bs.totalEquity)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <AccountDetailTable
                    title="Account Detail"
                    accounts={bs.accounts}
                    members={report.members}
                  />
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </ContentReveal>
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
      <Table>
        <TableHeader>
          <TableRow className="border-border/50">
            <TableHead className="px-4">Account</TableHead>
            {members.map((m) => (
              <TableHead key={m.orgId} className="px-4 text-right">
                {m.label}
              </TableHead>
            ))}
            <TableHead className="px-4 text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from(grouped.entries()).map(([type, typeAccounts]) => (
            <GroupSection key={type} type={type} label={typeLabels[type] || type} accounts={typeAccounts} members={members} />
          ))}
        </TableBody>
      </Table>
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
      <TableRow className="bg-muted/20 hover:bg-muted/20">
        <TableCell colSpan={members.length + 2} className="px-4 py-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </TableCell>
      </TableRow>
      {accounts.map((a) => (
        <TableRow key={`${a.type}:${a.code}`} className="border-border/20">
          <TableCell className="px-4 py-2.5">
            <span className="font-mono text-xs text-muted-foreground mr-2">{a.code}</span>
            {a.name}
          </TableCell>
          {members.map((m) => (
            <TableCell key={m.orgId} className="px-4 py-2.5 text-right font-mono tabular-nums">
              {formatMoney(a.byEntity[m.orgId] || 0)}
            </TableCell>
          ))}
          <TableCell className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
            {formatMoney(a.total)}
          </TableCell>
        </TableRow>
      ))}
      <TableRow className="border-border/50 bg-muted/10 hover:bg-muted/10">
        <TableCell className="px-4 py-2 font-semibold text-sm">Total {label}</TableCell>
        {members.map((m) => (
          <TableCell key={m.orgId} className="px-4 py-2 text-right font-mono tabular-nums font-semibold">
            {formatMoney(entityTotals[m.orgId] || 0)}
          </TableCell>
        ))}
        <TableCell className="px-4 py-2 text-right font-mono tabular-nums font-semibold">
          {formatMoney(groupTotal)}
        </TableCell>
      </TableRow>
    </>
  );
}
