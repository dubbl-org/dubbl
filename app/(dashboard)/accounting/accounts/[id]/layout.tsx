"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, BookOpen, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface AccountDetail {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: string;
  subType?: string | null;
  description?: string | null;
  currencyCode?: string;
  isActive?: boolean;
}

interface AccountContextValue {
  account: AccountDetail | null;
  setAccount: (fn: (prev: AccountDetail | null) => AccountDetail | null) => void;
  refetch: () => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccountContext() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccountContext must be used within account layout");
  return ctx;
}

const TYPE_STYLE: Record<string, string> = {
  asset: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  liability: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
  equity: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300",
  revenue: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  expense: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

const PAGE_TABS = [
  { value: "ledger", label: "Ledger", icon: BookOpen, href: (id: string) => `/accounting/accounts/${id}` },
  { value: "settings", label: "Settings", icon: Settings2, href: (id: string) => `/accounting/accounts/${id}/settings` },
] as const;

export default function AccountDetailLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchAccount = useCallback(() => {
    if (!orgId) return;
    fetch(`/api/v1/accounts/${id}?limit=1`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.account) setAccount(data.account);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  if (loading) return <BrandLoader />;

  if (!account) {
    return <p className="text-muted-foreground">Account not found.</p>;
  }

  const bal = parseFloat(account.balance || "0");
  const cur = account.currencyCode || "USD";

  return (
    <AccountContext.Provider value={{ account, setAccount, refetch: fetchAccount }}>
      <ContentReveal>
        {/* Back link */}
        <button
          onClick={() => router.push("/accounting/accounts")}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="size-3.5" />
          Back to accounts
        </button>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight">{account.name}</h1>
              <Badge variant="outline" className={TYPE_STYLE[account.type] || ""}>
                {account.type}
              </Badge>
              <Badge variant="outline" className="text-[10px]">{cur}</Badge>
              {account.isActive === false && (
                <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="font-mono">{account.code}</span>
              {account.description && <> · {account.description}</>}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-8">
          <div>
            <p className="text-[11px] text-muted-foreground">Balance</p>
            <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums">
              {formatMoney(Math.round(bal * 100), cur)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ArrowDownRight className="size-3 text-emerald-500" />
              Total Debits
            </p>
            <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-emerald-600">-</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ArrowUpRight className="size-3 text-red-500" />
              Total Credits
            </p>
            <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-red-600">-</p>
          </div>
        </div>

        {/* Page tabs */}
        <nav className="-mt-2 mb-8 flex items-center gap-1 overflow-x-auto border-b border-border">
          {PAGE_TABS.map((t) => {
            const Icon = t.icon;
            const tabHref = t.href(id);
            const active = t.value === "settings"
              ? pathname.endsWith("/settings")
              : !pathname.endsWith("/settings");
            return (
              <button
                key={t.value}
                onClick={() => router.push(tabHref)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-[13px] font-medium transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Tab content - only this animates on route change */}
        <BlurReveal key={pathname}>
          {children}
        </BlurReveal>
      </ContentReveal>
    </AccountContext.Provider>
  );
}
