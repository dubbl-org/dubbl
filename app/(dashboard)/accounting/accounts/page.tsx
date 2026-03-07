"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BlurReveal } from "@/components/ui/blur-reveal";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subType: string | null;
  isActive: boolean;
  description: string | null;
  currencyCode: string;
}

const TYPE_COLORS: Record<string, string> = {
  asset: "border-blue-200 bg-blue-50 text-blue-700",
  liability: "border-orange-200 bg-orange-50 text-orange-700",
  equity: "border-purple-200 bg-purple-50 text-purple-700",
  revenue: "border-emerald-200 bg-emerald-50 text-emerald-700",
  expense: "border-red-200 bg-red-50 text-red-700",
};

const TYPE_BORDER_COLORS: Record<string, string> = {
  asset: "border-l-blue-500",
  liability: "border-l-orange-500",
  equity: "border-l-purple-500",
  revenue: "border-l-emerald-500",
  expense: "border-l-red-500",
};

const ALL_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;

const columns: Column<Account>[] = [
  {
    key: "code",
    header: "Code",
    className: "w-24",
    render: (r) => <span className="font-mono text-sm">{r.code}</span>,
  },
  {
    key: "name",
    header: "Name",
    render: (r) => (
      <div>
        <p className="text-sm font-medium">{r.name}</p>
        {r.description && (
          <p className="text-xs text-muted-foreground truncate max-w-xs">
            {r.description}
          </p>
        )}
      </div>
    ),
  },
  {
    key: "type",
    header: "Type",
    className: "w-28",
    render: (r) => (
      <Badge variant="outline" className={TYPE_COLORS[r.type] || ""}>
        {r.type}
      </Badge>
    ),
  },
  {
    key: "currency",
    header: "Currency",
    className: "w-24",
    render: (r) => (
      <span className="text-sm text-muted-foreground">{r.currencyCode}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "w-20",
    render: (r) => (
      <span className={`text-xs ${r.isActive ? "text-emerald-600" : "text-muted-foreground"}`}>
        {r.isActive ? "Active" : "Inactive"}
      </span>
    ),
  },
];

export default function AccountsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  function fetchAccounts() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.accounts) setAccounts(data.accounts);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    const handler = () => fetchAccounts();
    window.addEventListener("accounts-changed", handler);
    return () => window.removeEventListener("accounts-changed", handler);
  }, []);

  const typeBreakdown = accounts.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});

  if (!loading && accounts.length === 0) {
    const TYPE_BG: Record<string, string> = {
      asset: "bg-blue-500/10 dark:bg-blue-500/15",
      liability: "bg-orange-500/10 dark:bg-orange-500/15",
      equity: "bg-purple-500/10 dark:bg-purple-500/15",
      revenue: "bg-emerald-500/10 dark:bg-emerald-500/15",
      expense: "bg-red-500/10 dark:bg-red-500/15",
    };
    const TYPE_DOT: Record<string, string> = {
      asset: "bg-blue-500",
      liability: "bg-orange-500",
      equity: "bg-purple-500",
      revenue: "bg-emerald-500",
      expense: "bg-red-500",
    };
    const TYPE_EXAMPLES: Record<string, string[]> = {
      asset: ["1000 · Cash", "1100 · Accounts Receivable", "1200 · Equipment", "1300 · Inventory"],
      liability: ["2000 · Accounts Payable", "2100 · Loans", "2200 · Credit Cards"],
      equity: ["3000 · Owner Capital", "3100 · Retained Earnings", "3200 · Drawings"],
      revenue: ["4000 · Sales Revenue", "4100 · Service Income", "4200 · Interest"],
      expense: ["5000 · Rent", "5100 · Payroll", "5200 · Utilities", "5300 · Supplies"],
    };

    return (
      <BlurReveal className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Chart of Accounts</h2>
          <Button
            onClick={() => openDrawer("account")}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Account
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {ALL_TYPES.map((type) => (
            <div
              key={type}
              className={`rounded-xl ${TYPE_BG[type]} p-4 space-y-3`}
            >
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${TYPE_DOT[type]}`} />
                <p className="text-sm font-semibold capitalize">{type}</p>
              </div>
              <div className="space-y-1">
                {TYPE_EXAMPLES[type].map((ex) => (
                  <p key={ex} className="text-[12px] text-muted-foreground font-mono">{ex}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal className="space-y-6 sm:space-y-10">
      <Section title="Overview" description="Chart of accounts summary across all account types and statuses.">
        <div className="space-y-4">
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {ALL_TYPES.map((type) => (
              <div
                key={type}
                className={`rounded-lg border border-l-4 ${TYPE_BORDER_COLORS[type]} bg-card p-4`}
              >
                <p className="text-xs font-medium text-muted-foreground capitalize">{type}</p>
                <p className="text-2xl font-semibold mt-1 tabular-nums">{typeBreakdown[type] || 0}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => openDrawer("account")}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Account
            </Button>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Accounts" description="View and manage all accounts in your chart of accounts.">
        <DataTable
          columns={columns}
          data={accounts}
          loading={loading}
          onRowClick={(r) => router.push(`/accounting/accounts/${r.id}`)}
        />
      </Section>

    </BlurReveal>
  );
}

