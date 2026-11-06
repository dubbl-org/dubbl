"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
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
import { formatMoney as formatMoneyIn } from "@/lib/money";
import { CurrencySelect } from "@/components/ui/currency-select";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { cn } from "@/lib/utils";
import { useApi, useApiCache } from "@/lib/query/use-api";

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
  presentationCurrency?: string;
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

interface EliminationRule {
  id: string;
  name: string;
  kind: "ar_ap" | "sales_cogs" | "investment_equity" | "custom";
  debitAccountMatch: string | null;
  creditAccountMatch: string | null;
  description: string | null;
}

const RULE_KINDS: Record<EliminationRule["kind"], string> = {
  ar_ap: "Money they owe each other (receivables vs payables)",
  sales_cogs: "Sales between them (income vs costs)",
  investment_equity: "Investment in each other (not calculated yet)",
  custom: "Custom accounts",
};

interface ConsolidatedReport {
  group: { id: string; name: string; presentationCurrency?: string };
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
  const cache = useApiCache();
  const { data: groupsData, loading } = useApi<{ groups?: ConsolidationGroup[] }>("/api/v1/consolidation/groups");
  const groups = groupsData?.groups || [];
  // The picked group, or the first one until the user picks.
  const [pickedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const selectedGroupId = (pickedGroupId && groups.some((g) => g.id === pickedGroupId) ? pickedGroupId : groups[0]?.id) ?? null;
  const [tab, setTab] = useState<"pnl" | "balance-sheet">("pnl");

  const [newGroupName, setNewGroupName] = useState("");
  const [userOrgs, setUserOrgs] = useState<UserOrg[]>([]);
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);

  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));

  const activeOrgId = getOrgId();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const reportQuery = useApi<ConsolidatedReport>(
    selectedGroupId ? `/api/v1/consolidation/groups/${selectedGroupId}/report?${new URLSearchParams({ startDate, endDate })}` : null,
    { keepPrevious: true }
  );
  // Keep the last figures while the dates change, but not another group's.
  const otherGroup = !!reportQuery.data && reportQuery.data.group?.id !== selectedGroupId;
  const report = selectedGroupId && !otherGroup ? reportQuery.data ?? null : null;
  const reportLoading = reportQuery.loading || otherGroup;

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

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    const res = await apiFetch("/api/v1/consolidation/groups", {
      method: "POST",
      body: JSON.stringify({ name: newGroupName.trim() }),
    });
    const data = await res.json();
    if (data.group) {
      cache.update<{ groups?: ConsolidationGroup[] }>("/api/v1/consolidation/groups", (d) => ({ ...d, groups: [{ ...data.group, members: [] }, ...(d.groups || [])] }));
      setSelectedGroupId(data.group.id);
      setNewGroupName("");
    }
  };

  const deleteGroup = async (groupId: string) => {
    await apiFetch(`/api/v1/consolidation/groups/${groupId}`, { method: "DELETE" });
    cache.update<{ groups?: ConsolidationGroup[] }>("/api/v1/consolidation/groups", (d) => ({ ...d, groups: (d.groups || []).filter((g) => g.id !== groupId) }));
    if (selectedGroupId === groupId) {
      setSelectedGroupId(groups.find((g) => g.id !== groupId)?.id || null);
    }
  };

  const addMember = async (orgId: string, label: string) => {
    if (!selectedGroupId || !orgId) return;
    // The cache refreshes the group and its report once this lands.
    await apiFetch(`/api/v1/consolidation/groups/${selectedGroupId}/members`, {
      method: "POST",
      body: JSON.stringify({ orgId, label: label || undefined }),
    });
  };

  const removeMember = async (orgId: string) => {
    if (!selectedGroupId) return;
    await apiFetch(`/api/v1/consolidation/groups/${selectedGroupId}/members`, {
      method: "DELETE",
      body: JSON.stringify({ orgId }),
    });
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const currency = report?.group?.presentationCurrency || selectedGroup?.presentationCurrency || "USD";
  const formatMoney = (cents: number) => formatMoneyIn(cents, currency);

  const rulesQuery = useApi<{ rules?: EliminationRule[] }>(
    selectedGroupId ? `/api/v1/consolidation/groups/${selectedGroupId}/elimination-rules` : null
  );
  const rules = rulesQuery.data?.rules || [];
  const [ruleName, setRuleName] = useState("");
  const [ruleKind, setRuleKind] = useState<EliminationRule["kind"]>("ar_ap");
  const [ruleDebit, setRuleDebit] = useState("1200");
  const [ruleCredit, setRuleCredit] = useState("2000");

  const setGroupCurrency = async (code: string) => {
    if (!selectedGroupId) return;
    const res = await apiFetch(`/api/v1/consolidation/groups/${selectedGroupId}`, {
      method: "PATCH",
      body: JSON.stringify({ presentationCurrency: code }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Couldn't change the currency");
    }
  };

  const addRule = async () => {
    if (!selectedGroupId || !ruleName.trim()) return;
    const res = await apiFetch(`/api/v1/consolidation/groups/${selectedGroupId}/elimination-rules`, {
      method: "POST",
      body: JSON.stringify({
        name: ruleName.trim(),
        kind: ruleKind,
        debitAccountMatch: ruleDebit.trim() || null,
        creditAccountMatch: ruleCredit.trim() || null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Couldn't add the rule");
      return;
    }
    setRuleName("");
    toast.success("Rule added");
  };

  const deleteRule = (rule: EliminationRule) => {
    if (!selectedGroupId) return;
    confirm({
      title: `Remove "${rule.name}"?`,
      description: "These amounts will no longer be removed from the combined reports.",
      confirmLabel: "Remove rule",
      destructive: true,
      onConfirm: async () => {
        await apiFetch(`/api/v1/consolidation/groups/${selectedGroupId}/elimination-rules/${rule.id}`, { method: "DELETE" });
      },
    });
  };

  const pnl = report?.consolidatedPnL;
  const bs = report?.consolidatedBalanceSheet;

  // Every business you belong to can join, this one included (a parent
  // company is usually part of its own group). Hide the ones already in it.
  const availableOrgs = useMemo(() => {
    const memberOrgIds = new Set(selectedGroup?.members.map((m) => m.orgId) || []);
    return userOrgs
      .filter((o) => !memberOrgIds.has(o.id))
      .sort((a, b) => (a.id === activeOrgId ? -1 : b.id === activeOrgId ? 1 : 0));
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

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      {confirmDialog}
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Combined company reports"
        description="One set of reports that adds up several of your businesses together. Sales and bills between those businesses are removed so you don't count them twice, and amounts in other currencies are converted into one currency."
      >
        {report && exportData.length > 0 && (
          <ExportButton
            data={exportData}
            columns={exportColumns}
            moneyColumns={exportColumns.filter((c) => c !== "type" && c !== "code" && c !== "name")}
            filename={`consolidation-${tab}`}
          />
        )}
      </PageHeader>

      {/* Group Management */}
      <div className="rounded-xl border border-border/50 bg-card/80 p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Company groups</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A group is the set of businesses you want to report on together. Create one, then add each business below.
          </p>
        </div>

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
                    ? "border-brand-500/50 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
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
                    confirm({
                      title: `Delete the group "${g.name}"?`,
                      description: "Only the group is deleted. The businesses in it and their books are not changed.",
                      confirmLabel: "Delete group",
                      destructive: true,
                      onConfirm: () => deleteGroup(g.id),
                    });
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
            Create your first group to report on several of your businesses together.
          </p>
        )}
      </div>

      {/* Member Management */}
      {selectedGroup && (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 sm:p-6 space-y-4">
          <h2 className="text-sm font-semibold">
            Businesses in &quot;{selectedGroup.name}&quot;
          </h2>

          {/* Add member - org picker */}
          {availableOrgs.length > 0 ? (
            <Popover open={orgPickerOpen} onOpenChange={setOrgPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="size-4" />
                  Add a business
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
                            <span className="truncate text-sm">
                              {org.name}
                              {org.id === activeOrgId ? " (this business)" : ""}
                            </span>
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
              All your businesses are in this group.
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
              No businesses added yet. Add one above to include it in the combined reports.
            </p>
          )}
        </div>
      )}

      {/* Currency and elimination rules */}
      {selectedGroup && (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 sm:p-6 space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Report currency</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Every business is converted into this currency for the combined reports.
              </p>
            </div>
            <CurrencySelect
              value={selectedGroup.presentationCurrency || currency}
              onValueChange={setGroupCurrency}
              className="w-full sm:w-56"
            />
          </div>

          <div className="h-px bg-border" />

          <div>
            <h2 className="text-sm font-semibold">Amounts to remove between your businesses</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Each rule names two account codes (or the start of them). When your businesses owe or sell to each
              other, the matching amounts are taken out so the combined reports don&apos;t count them twice.
            </p>
          </div>

          {rules.length > 0 ? (
            <div className="divide-y divide-border/50 rounded-lg border border-border/50">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {RULE_KINDS[r.kind]}
                      {r.debitAccountMatch || r.creditAccountMatch
                        ? ` · accounts ${r.debitAccountMatch || "any"} against ${r.creditAccountMatch || "any"}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${r.name}`}
                    onClick={() => deleteRule(r)}
                    className="text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No rules yet, so nothing is removed.</p>
          )}

          <div className="grid gap-3 sm:grid-cols-[1.2fr_1.4fr_0.7fr_0.7fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Rule name</Label>
              <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="Owed between companies" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">What it removes</Label>
              <Select
                value={ruleKind}
                onValueChange={(v) => {
                  const kind = v as EliminationRule["kind"];
                  setRuleKind(kind);
                  if (kind === "ar_ap") { setRuleDebit("1200"); setRuleCredit("2000"); }
                  if (kind === "sales_cogs") { setRuleDebit("4"); setRuleCredit("5"); }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RULE_KINDS) as EliminationRule["kind"][]).map((k) => (
                    <SelectItem key={k} value={k}>{RULE_KINDS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">First account code</Label>
              <Input value={ruleDebit} onChange={(e) => setRuleDebit(e.target.value)} placeholder="1200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Second account code</Label>
              <Input value={ruleCredit} onChange={(e) => setRuleCredit(e.target.value)} placeholder="2000" />
            </div>
            <Button size="sm" onClick={addRule} disabled={!ruleName.trim()}>
              <Plus className="size-4 mr-1" />
              Add rule
            </Button>
          </div>
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
          ) : (
            <ContentReveal>
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
                      <h3 className="text-sm font-semibold">Each business</h3>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/50">
                          <TableHead className="px-4">Business</TableHead>
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
                            <TableCell className={cn("px-4 py-3 text-right font-mono tabular-nums", e.netIncome >= 0 ? "text-brand-600" : "text-red-600")}>
                              {formatMoney(e.netIncome)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/30 font-semibold">
                          <TableCell className="px-4 py-3">Total</TableCell>
                          <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(pnl.totalRevenue)}</TableCell>
                          <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(pnl.totalExpenses)}</TableCell>
                          <TableCell className={cn("px-4 py-3 text-right font-mono tabular-nums", pnl.netIncome >= 0 ? "text-brand-600" : "text-red-600")}>
                            {formatMoney(pnl.netIncome)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  {/* Account Detail */}
                  <AccountDetailTable
                    title="Account breakdown"
                    accounts={pnl.accounts}
                    members={report!.members}
                    currency={currency}
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
                      <h3 className="text-sm font-semibold">Each business</h3>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/50">
                          <TableHead className="px-4">Business</TableHead>
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
                        <TableRow className="bg-muted/30 font-semibold">
                          <TableCell className="px-4 py-3">Total</TableCell>
                          <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(bs.totalAssets)}</TableCell>
                          <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(bs.totalLiabilities)}</TableCell>
                          <TableCell className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(bs.totalEquity)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  {/* Account Detail */}
                  <AccountDetailTable
                    title="Account breakdown"
                    accounts={bs.accounts}
                    members={report!.members}
                    currency={currency}
                  />
                </div>
              )}
            </ContentReveal>
          )}
        </>
      )}
    </ContentReveal>
  );
}

function AccountDetailTable({
  title,
  accounts,
  members,
  currency,
}: {
  title: string;
  accounts: AccountRow[];
  members: { orgId: string; label: string; orgName: string }[];
  currency: string;
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
            <GroupSection key={type} type={type} label={typeLabels[type] || type} accounts={typeAccounts} members={members} currency={currency} />
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
  currency,
}: {
  type: string;
  label: string;
  accounts: AccountRow[];
  members: { orgId: string; label: string; orgName: string }[];
  currency: string;
}) {
  const formatMoney = (cents: number) => formatMoneyIn(cents, currency);
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
