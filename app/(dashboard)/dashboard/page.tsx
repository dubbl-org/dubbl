"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  Landmark,
  PiggyBank,
  Plus,
  Receipt,
  X,
  type LucideIcon,
} from "lucide-react";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ErrorState } from "@/components/dashboard/error-state";
import { cn } from "@/lib/utils";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { AskTilly } from "@/components/dashboard/assistant/assistant-panel";
import { useApi } from "@/lib/query/use-api";
import {
  Card,
  CardHeader,
  CashFlowChart,
  EmptyNote,
  InfoTip,
  Legend,
  SERIES,
  SplitBar,
  Stat,
  TONE,
  type TrendMonth,
} from "@/components/dashboard/overview/widgets";

const GREETINGS_MORNING = [
  "Good morning",
  "Rise and shine",
  "Morning",
  "Top of the morning",
];

const GREETINGS_AFTERNOON = [
  "Good afternoon",
  "Hope your afternoon is going well",
  "Afternoon",
];

const GREETINGS_EVENING = [
  "Good evening",
  "Evening",
  "Hope you had a great day",
];

const GREETINGS_ANYTIME = [
  "Welcome back",
  "Hey there",
  "Nice to see you",
  "Hello",
  "Hi there",
  "Great to have you back",
  "Ready to go",
];

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function pickGreeting(): string {
  const now = new Date();
  const hour = now.getHours();
  const day = DAY_NAMES[now.getDay()];

  const timePool =
    hour >= 5 && hour < 12
      ? GREETINGS_MORNING
      : hour >= 12 && hour < 17
      ? GREETINGS_AFTERNOON
      : GREETINGS_EVENING;

  const allOptions = [
    ...timePool,
    ...GREETINGS_ANYTIME,
    `Happy ${day}`,
  ];

  return allOptions[Math.floor(Math.random() * allOptions.length)];
}

/* ------------------------------------------------------------------ */
/*  Period                                                             */
/* ------------------------------------------------------------------ */

type Period = "month" | "quarter" | "year";

const PERIODS: { value: Period; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

function isoDate(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function periodRange(period: Period) {
  const now = new Date();
  const year = now.getFullYear();
  const start =
    period === "month"
      ? new Date(year, now.getMonth(), 1)
      : period === "quarter"
      ? new Date(year, Math.floor(now.getMonth() / 3) * 3, 1)
      : new Date(year, 0, 1);
  const label =
    period === "month"
      ? now.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : period === "quarter"
      ? `Q${Math.floor(now.getMonth() / 3) + 1} ${year}`
      : `${year} so far`;
  // How many months the period has run, for monthly burn.
  const months = Math.max(1, (now.getTime() - start.getTime()) / (30.44 * 86_400_000));
  return { startDate: isoDate(start), endDate: isoDate(now), label, months };
}

function PeriodSwitch({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div role="radiogroup" aria-label="Period" className="flex items-center gap-0.5">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          type="button"
          role="radio"
          aria-checked={value === p.value}
          onClick={() => onChange(p.value)}
          className={cn(
            "h-8 rounded-lg px-3 text-[13px] font-medium transition-colors",
            value === p.value
              ? "bg-foreground/[0.055] text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Data shapes                                                        */
/* ------------------------------------------------------------------ */

interface Entry {
  id: string;
  entryNumber: number;
  date: string;
  description: string;
  status: "draft" | "posted" | "void";
  totalDebit: string;
}

interface PnLData {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  expenses: { accountName: string; balance: number }[];
}

interface AgingBucket {
  label: string;
  total: number;
  count: number;
  invoices?: { id: string; contactName: string; amountDue: number; daysOverdue: number }[];
  bills?: { id: string; contactName: string; amountDue: number; daysOverdue: number }[];
}

interface Aging {
  buckets: AgingBucket[];
  grandTotal: number;
}

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string | null;
  bankName: string | null;
  balance: number;
  currencyCode: string;
  isActive: boolean;
}

interface ForecastEntry {
  date: string;
  type: string;
  description: string;
  amount: number;
}

interface Forecast {
  totalInflows: number;
  totalOutflows: number;
  netForecast: number;
  entries: ForecastEntry[];
}

interface Ratios {
  netMargin: number | null;
  dso: number | null;
  dpo: number | null;
}

interface Alerts {
  overdueInvoices: { count: number; total: number };
  overdueBills: { count: number; total: number };
  uncategorizedTransactions: number;
  accountsNeedingReconciliation: { bankAccountName: string; lastReconDate: string | null }[];
}

interface BudgetAlert {
  accountName: string;
  pct: number;
  actual: number;
}

const columns: Column<Entry>[] = [
  {
    key: "number",
    header: "#",
    className: "w-16",
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground">
        {r.entryNumber}
      </span>
    ),
  },
  {
    key: "date",
    header: "Date",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.date}</span>,
  },
  {
    key: "description",
    header: "Description",
    render: (r) => <span className="text-sm font-medium">{r.description}</span>,
  },
  {
    key: "status",
    header: "Status",
    className: "w-24",
    render: (r) => (
      <Badge
        variant="outline"
        className={
          r.status === "void"
            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
            : ""
        }
      >
        {r.status}
      </Badge>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    className: "w-28 text-right",
    render: (r) => (
      <span className="text-sm tabular-nums">
        {formatMoney(Math.round(parseFloat(r.totalDebit) * 100))}
      </span>
    ),
  },
];

const AGING_COLORS = ["#10B981", "#84CC16", "#F59E0B", "#F97316", "#EF4444"];

function orgHeaders(): Record<string, string> {
  const id = localStorage.getItem("activeOrgId");
  return id ? { "x-organization-id": id } : {};
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Monthly Retainer - Metro Services - Metro Services" → "Monthly Retainer · Metro Services" */
function tidy(description: string) {
  const parts = description.split(" - ");
  return parts.filter((p, i) => parts.indexOf(p) === i).join(" · ");
}

/* ------------------------------------------------------------------ */
/*  Pieces                                                             */
/* ------------------------------------------------------------------ */

interface Task {
  key: string;
  icon: LucideIcon;
  tint: string;
  title: string;
  detail: string;
  amount?: string;
  href: string;
}

function TaskRow({ task, last }: { task: Task; last: boolean }) {
  const Icon = task.icon;
  return (
    <Link
      href={task.href}
      className={cn(
        "group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-foreground/[0.03]",
        !last && "border-b border-foreground/[0.05]"
      )}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${task.tint}17`, color: task.tint }}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">{task.title}</p>
        <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground/85">{task.detail}</p>
      </div>
      {task.amount && <span className="shrink-0 text-[13.5px] font-medium tabular-nums">{task.amount}</span>}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function HealthTile({
  label,
  hint,
  value,
  note,
  status,
}: {
  label: string;
  hint: ReactNode;
  value: string;
  note: string;
  status: "good" | "watch" | "bad" | "none";
}) {
  const dot = { good: "#10B981", watch: "#F59E0B", bad: "#EF4444", none: "#A3A39E" }[status];
  return (
    <div className="rounded-lg bg-foreground/[0.025] px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <p className="text-[12.5px] text-muted-foreground">{label}</p>
        <InfoTip>{hint}</InfoTip>
      </div>
      <p className="mt-1.5 text-[20px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</p>
      <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted-foreground/85">
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
        <span className="truncate">{note}</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] || "";
  const [greeting] = useState(() => pickGreeting());
  const [period, setPeriod] = useState<Period>("year");
  // Getting-started checklist: show while the org has never completed onboarding.
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [dismissingOnboarding, setDismissingOnboarding] = useState(false);

  useDocumentTitle("Dashboard · Overview");

  const range = periodRange(period);

  // Everything that doesn't depend on the period
  const arQuery = useApi<Aging>("/api/v1/reports/aged-receivables");
  const apQuery = useApi<Aging>("/api/v1/reports/aged-payables");
  const trendQuery = useApi<{ months?: TrendMonth[] }>("/api/v1/reports/monthly-trends?months=12");
  const bankQuery = useApi<{ bankAccounts?: BankAccount[] }>("/api/v1/bank-accounts");
  const { data: alertsData } = useApi<Alerts>("/api/v1/dashboard/alerts");
  const { data: forecastData } = useApi<Forecast>("/api/v1/reports/cash-flow-forecast?weeks=8");
  const { data: budgetData } = useApi<{ comparisons?: { accountName: string; budgeted: number; actual: number }[] }>("/api/v1/reports/budget-vs-actual");
  const { data: entriesData } = useApi<{ entries?: Record<string, string | number>[] }>("/api/v1/entries?limit=8");
  // Decide whether to show the getting-started checklist (org never onboarded).
  const { data: orgData } = useApi<{ organization?: { name?: string; onboardingCompletedAt?: string | null } }>("/api/v1/organization");

  // Profit and loss and ratios for the selected period
  const qs = `startDate=${range.startDate}&endDate=${range.endDate}`;
  const { data: pnlData } = useApi<Partial<PnLData>>(`/api/v1/reports/profit-and-loss?${qs}`, { keepPrevious: true });
  const { data: ratiosData } = useApi<{ ratios?: Ratios }>(`/api/v1/reports/financial-ratios?${qs}`, { keepPrevious: true });

  const loading = arQuery.loading || apQuery.loading || trendQuery.loading || bankQuery.loading;
  const coreQueries = [arQuery, apQuery, trendQuery, bankQuery];
  const error = coreQueries.every((q) => q.error && !q.data) ? "Failed to load dashboard data. Please check your connection." : null;

  const receivables: Aging = arQuery.data?.buckets ? arQuery.data : { buckets: [], grandTotal: 0 };
  const payables: Aging = apQuery.data?.buckets ? apQuery.data : { buckets: [], grandTotal: 0 };
  const trend = useMemo(() => trendQuery.data?.months ?? [], [trendQuery.data]);
  const accounts = useMemo(
    () => bankQuery.data?.bankAccounts?.filter((a) => a.isActive) ?? null,
    [bankQuery.data]
  );
  const alerts = alertsData ?? null;
  const forecast = forecastData?.entries ? forecastData : null;
  const ratios = ratiosData?.ratios ?? null;
  const pnl: PnLData = {
    totalRevenue: pnlData?.totalRevenue || 0,
    totalExpenses: pnlData?.totalExpenses || 0,
    netIncome: pnlData?.netIncome || 0,
    expenses: pnlData?.expenses || [],
  };
  const budgetAlerts = useMemo<BudgetAlert[]>(
    () =>
      (budgetData?.comparisons ?? [])
        .filter((c) => c.budgeted > 0 && c.actual / c.budgeted >= 0.9)
        .map((c) => ({
          accountName: c.accountName,
          pct: Math.round((c.actual / c.budgeted) * 100),
          actual: c.actual,
        })),
    [budgetData]
  );
  const entries = useMemo<Entry[]>(
    () =>
      (entriesData?.entries ?? []).map((e) => ({
        ...e,
        totalDebit: (e.totalDebit as string) || "0.00",
      })) as unknown as Entry[],
    [entriesData]
  );
  const orgName = orgData?.organization?.name || "";
  const showOnboarding = !!orgData?.organization && !orgData.organization.onboardingCompletedAt && !onboardingDismissed;

  const dismissOnboarding = () => {
    setDismissingOnboarding(true);
    fetch("/api/v1/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...orgHeaders() },
      body: JSON.stringify({ onboardingCompleted: true }),
    })
      .then(() => setOnboardingDismissed(true))
      .catch(() => {})
      .finally(() => setDismissingOnboarding(false));
  };

  /* ---------------- derived numbers ---------------- */

  const cash = accounts?.reduce((s, a) => s + a.balance, 0) ?? 0;
  const overdueCount = alerts?.overdueInvoices.count ?? 0;
  const receivableCount = receivables.buckets.reduce((s, b) => s + b.count, 0);
  const payableCount = payables.buckets.reduce((s, b) => s + b.count, 0);

  const monthlyBurn = pnl.netIncome < 0 ? -pnl.netIncome / range.months : 0;
  const runway = monthlyBurn > 0 && cash > 0 ? cash / monthlyBurn : null;

  // Debtors, biggest balance first
  const debtors = Object.values(
    receivables.buckets
      .flatMap((b) => b.invoices ?? [])
      .reduce<Record<string, { name: string; amount: number; days: number; count: number }>>((acc, inv) => {
        const d = (acc[inv.contactName] ??= { name: inv.contactName, amount: 0, days: 0, count: 0 });
        d.amount += inv.amountDue;
        d.days = Math.max(d.days, inv.daysOverdue);
        d.count += 1;
        return acc;
      }, {})
  ).sort((a, b) => b.amount - a.amount);

  const oldestInvoiceDays = debtors.reduce((m, d) => Math.max(m, d.days), 0);
  const oldestBillDays = payables.buckets
    .flatMap((b) => b.bills ?? [])
    .reduce((m, b) => Math.max(m, b.daysOverdue), 0);

  const topExpenses = [...pnl.expenses].sort((a, b) => b.balance - a.balance);
  const expenseRows = topExpenses.slice(0, 5);
  const otherExpenses = topExpenses.slice(5).reduce((s, e) => s + e.balance, 0);
  if (otherExpenses > 0) expenseRows.push({ accountName: "Everything else", balance: otherExpenses });

  const tasks: Task[] = [
    ...(alerts && alerts.overdueInvoices.count > 0
      ? [{
          key: "invoices",
          icon: FileText,
          tint: TONE.late,
          title: `Chase ${plural(alerts.overdueInvoices.count, "overdue invoice")}`,
          detail: oldestInvoiceDays ? `The oldest is ${oldestInvoiceDays} days late` : "Send a reminder",
          amount: formatMoney(alerts.overdueInvoices.total),
          href: "/sales",
        }]
      : []),
    ...(alerts && alerts.overdueBills.count > 0
      ? [{
          key: "bills",
          icon: Receipt,
          tint: TONE.youOwe,
          title: `Pay ${plural(alerts.overdueBills.count, "overdue bill")}`,
          detail: oldestBillDays ? `The oldest is ${oldestBillDays} days late` : "Due to suppliers",
          amount: formatMoney(alerts.overdueBills.total),
          href: "/purchases",
        }]
      : []),
    ...(alerts && alerts.uncategorizedTransactions > 0
      ? [{
          key: "uncategorized",
          icon: ArrowLeftRight,
          tint: TONE.cash,
          title: `Sort ${plural(alerts.uncategorizedTransactions, "bank transaction")}`,
          detail: "Pick a category so your reports stay right",
          href: "/accounting/banking",
        }]
      : []),
    ...(alerts && alerts.accountsNeedingReconciliation.length > 0
      ? [{
          key: "reconcile",
          icon: Landmark,
          tint: "#14B8A6",
          title: `Reconcile ${plural(alerts.accountsNeedingReconciliation.length, "bank account")}`,
          detail: "Check dubbl matches your bank statement",
          href: "/accounting/banking",
        }]
      : []),
    ...budgetAlerts.slice(0, 2).map((b) => ({
      key: `budget-${b.accountName}`,
      icon: PiggyBank,
      tint: TONE.owedToYou,
      title: `${b.accountName} is at ${b.pct}% of budget`,
      detail: `${formatMoney(b.actual)} spent so far`,
      href: "/accounting/budgets",
    })),
  ];

  const upcoming = (forecast?.entries ?? []).slice().sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);

  const dso = ratios?.dso ?? null;
  const dpo = ratios?.dpo ?? null;
  const margin = ratios?.netMargin ?? (pnl.totalRevenue > 0 ? Math.round((pnl.netIncome / pnl.totalRevenue) * 1000) / 10 : null);

  return (
    <MotionConfig reducedMotion="never">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loader"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: "blur(6px)" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <BrandLoader />
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <ErrorState message={error} onRetry={() => window.location.reload()} />
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="@container space-y-4"
          >
            {/* Heading */}
            <div className="flex flex-col gap-4 pb-2 @4xl:flex-row @4xl:items-end @4xl:justify-between">
              <div className="min-w-0">
                <h2 className="text-[26px] font-semibold tracking-[-0.025em] sm:text-[28px]">
                  {greeting}{firstName ? `, ${firstName}` : ""}
                </h2>
                <p className="mt-1.5 max-w-3xl text-[14.5px] leading-relaxed text-muted-foreground">
                  {accounts && accounts.length > 0 && (
                    <>You have <span className="font-medium text-foreground">{formatMoney(cash)}</span> in the bank. </>
                  )}
                  Customers owe you <span className="font-medium text-foreground">{formatMoney(receivables.grandTotal)}</span>
                  {overdueCount > 0 ? <>, and <span className="font-medium text-red-600 dark:text-red-400">{plural(overdueCount, "invoice")} {overdueCount === 1 ? "is" : "are"} overdue</span>. </> : ". "}
                  {payables.grandTotal > 0 && (
                    <>You owe suppliers <span className="font-medium text-foreground">{formatMoney(payables.grandTotal)}</span>.</>
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <AskTilly prompt="Look at my numbers and tell me the three most important things I should do this week.">
                    What should I do next?
                  </AskTilly>
                  <AskTilly prompt="Summarise how the business did this month compared with last month, in plain English.">
                    How did this month go?
                  </AskTilly>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-[13px] text-muted-foreground">
                  {range.label}{orgName ? ` · ${orgName}` : ""}
                </span>
                <PeriodSwitch value={period} onChange={setPeriod} />
              </div>
            </div>

            {/* Getting started checklist */}
            {showOnboarding && (
              <Card className="relative p-5">
                <button
                  onClick={dismissOnboarding}
                  disabled={dismissingOnboarding}
                  aria-label="Dismiss getting started"
                  className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:opacity-50"
                >
                  <X className="size-4" />
                </button>
                <h3 className="text-[15px] font-semibold">Getting started</h3>
                <p className="mt-1 text-[13.5px] text-muted-foreground">
                  A few quick steps to set up your books. Tackle them in any order.
                </p>
                <div className="mt-4 grid gap-2 @xl:grid-cols-2 @4xl:grid-cols-4">
                  {[
                    {
                      label: "Add a bank account",
                      desc: "Connect or add the account you bank with",
                      href: "/accounting/banking",
                    },
                    {
                      label: "Set opening balances",
                      desc: "Enter what you had when you started",
                      href: "/accounting/opening-balances",
                    },
                    {
                      label: "Set up tax",
                      desc: "Choose the tax rates you charge and pay",
                      href: "/tax",
                    },
                    {
                      label: "Create your first invoice",
                      desc: "Bill a customer and get paid",
                      href: "/sales",
                    },
                  ].map((step) => (
                    <button
                      key={step.href}
                      onClick={() => router.push(step.href)}
                      className="flex items-start gap-3 rounded-lg border border-border/80 p-3 text-left transition-colors hover:bg-foreground/[0.03]"
                    >
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground/40" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{step.label}</p>
                        <p className="text-xs text-muted-foreground">{step.desc}</p>
                      </div>
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/40" />
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={dismissOnboarding}
                    disabled={dismissingOnboarding}
                  >
                    {dismissingOnboarding ? "Saving…" : "Dismiss / All done"}
                  </Button>
                </div>
              </Card>
            )}

            {/* Figures */}
            <div className="grid gap-4 @xl:grid-cols-2 @3xl:grid-cols-3 @[72rem]:grid-cols-6">
              <Stat
                label="Cash in bank"
                hint="What's in your bank accounts right now, across every account you've added."
                value={formatMoney(cash)}
                note={accounts && accounts.length > 0 ? `Across ${plural(accounts.length, "account")}` : "Add a bank account"}
                tone={TONE.cash}
                href="/accounting/banking"
              />
              <Stat
                label="Money in"
                hint="Revenue: what you earned from customers in this period, whether or not they've paid yet."
                value={formatMoney(pnl.totalRevenue)}
                note="Earned from customers"
                tone={TONE.moneyIn}
                spark={trend.map((m) => m.revenue)}
                href="/reports/profit-and-loss"
              />
              <Stat
                label="Money out"
                hint="Expenses: what the business spent in this period: bills, wages, subscriptions and so on."
                value={formatMoney(pnl.totalExpenses)}
                note="Bills, wages and spending"
                tone={TONE.moneyOut}
                spark={trend.map((m) => m.expenses)}
                href="/reports/profit-and-loss"
              />
              <Stat
                label="Profit"
                hint="Net income: money in minus money out. Negative means you spent more than you earned."
                value={formatMoney(pnl.netIncome)}
                note={pnl.netIncome < 0 ? "You spent more than you earned" : "You earned more than you spent"}
                tone={pnl.netIncome < 0 ? TONE.late : TONE.moneyIn}
                spark={trend.map((m) => m.revenue - m.expenses)}
                negative={pnl.netIncome < 0}
                href="/reports/profit-and-loss"
              />
              <Stat
                label="Owed to you"
                hint="Accounts receivable: invoices you've sent that customers haven't paid yet."
                value={formatMoney(receivables.grandTotal)}
                note={overdueCount > 0 ? `${plural(overdueCount, "invoice")} overdue` : `${plural(receivableCount, "open invoice")}`}
                tone={TONE.owedToYou}
                href="/reports/aged-receivables"
              />
              <Stat
                label="You owe"
                hint="Accounts payable: supplier bills you've received but haven't paid yet."
                value={formatMoney(payables.grandTotal)}
                note={`${plural(payableCount, "unpaid bill")}`}
                tone={TONE.youOwe}
                href="/reports/aged-payables"
              />
            </div>

            {/* Cash flow + to-do */}
            <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1fr)_380px]">
              <Card className="flex flex-col px-5 pb-4 pt-5">
                <div className="mb-5">
                  <CardHeader
                    title="Money in and out"
                    hint="Each pair of bars is one month: what you earned next to what you spent."
                    aside={
                      <Legend
                        items={[
                          { label: "In", color: TONE.moneyIn },
                          { label: "Out", color: TONE.moneyOut, faded: true },
                        ]}
                      />
                    }
                  />
                  <p className="mt-1 text-[12.5px] text-muted-foreground/85">Last 12 months</p>
                </div>
                {trend.some((m) => m.revenue || m.expenses) ? (
                  <CashFlowChart months={trend} />
                ) : (
                  <EmptyNote>Record a sale or an expense and your months will show up here.</EmptyNote>
                )}
              </Card>

              <Card className="px-5 pb-2 pt-5">
                <CardHeader
                  title="Your to-do list"
                  hint="The things that most need you right now. Click one to jump straight to it."
                  aside={<AskTilly prompt="Go through my to-do list and help me clear it, starting with whatever matters most.">Help me</AskTilly>}
                />
                <div className="mt-3">
                  {tasks.length > 0 ? (
                    tasks.slice(0, 6).map((t, i, arr) => <TaskRow key={t.key} task={t} last={i === arr.length - 1} />)
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-14 text-center">
                      <CheckCircle2 className="size-5 text-emerald-500" />
                      <p className="text-[13.5px] text-muted-foreground">You&apos;re all caught up.</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Who owes you · where money goes · bank accounts */}
            <div className="grid gap-4 @3xl:grid-cols-2 @[72rem]:grid-cols-3">
              <Card className="p-5">
                <CardHeader
                  title="Who owes you"
                  hint="Unpaid invoices grouped by how late they are. Green is on time, red is more than 90 days late."
                  href="/reports/aged-receivables"
                />
                <p className="mt-3 text-[22px] font-semibold tracking-[-0.02em] tabular-nums">{formatMoney(receivables.grandTotal)}</p>
                <div className="mt-3">
                  <SplitBar
                    parts={receivables.buckets.map((b, i) => ({ label: b.label, value: b.total, color: AGING_COLORS[i] ?? "#A3A39E" }))}
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-muted-foreground">
                  {receivables.buckets.map((b, i) => (
                    <span key={b.label} className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: AGING_COLORS[i] }} />
                      {b.label === "Current" ? "Not due" : b.label}
                    </span>
                  ))}
                </div>
                <div className="mt-4 border-t border-foreground/[0.05] pt-1">
                  {debtors.length > 0 ? (
                    debtors.slice(0, 4).map((d) => (
                      <div key={d.name} className="flex items-center gap-3 border-b border-foreground/[0.05] py-2.5 last:border-0">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-[10.5px] font-semibold text-foreground/70">
                          {d.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium">{d.name}</p>
                          <p className={cn("text-[12px]", d.days > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground/85")}>
                            {d.days > 0 ? `${d.days} days late` : "Not due yet"}
                            {d.count > 1 ? ` · ${d.count} invoices` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-[13.5px] font-medium tabular-nums">{formatMoney(d.amount)}</span>
                      </div>
                    ))
                  ) : (
                    <EmptyNote>Nobody owes you anything right now.</EmptyNote>
                  )}
                </div>
              </Card>

              <Card className="p-5">
                <CardHeader
                  title="Where the money goes"
                  hint="Your biggest expense categories for the selected period."
                  href="/reports/profit-and-loss"
                />
                <p className="mt-3 text-[22px] font-semibold tracking-[-0.02em] tabular-nums">{formatMoney(pnl.totalExpenses)}</p>
                <div className="mt-3">
                  <SplitBar parts={expenseRows.map((e, i) => ({ label: e.accountName, value: e.balance, color: SERIES[i % SERIES.length] }))} />
                </div>
                <div className="mt-4 border-t border-foreground/[0.05] pt-1">
                  {expenseRows.length > 0 ? (
                    expenseRows.map((e, i) => (
                      <div key={e.accountName} className="flex items-center gap-2.5 border-b border-foreground/[0.05] py-2.5 last:border-0">
                        <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: SERIES[i % SERIES.length] }} />
                        <span className="min-w-0 flex-1 truncate text-[13.5px]">{e.accountName}</span>
                        <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                          {pnl.totalExpenses > 0 ? `${Math.round((e.balance / pnl.totalExpenses) * 100)}%` : ""}
                        </span>
                        <span className="w-24 shrink-0 text-right text-[13.5px] font-medium tabular-nums">{formatMoney(e.balance)}</span>
                      </div>
                    ))
                  ) : (
                    <EmptyNote>No spending recorded for this period.</EmptyNote>
                  )}
                </div>
              </Card>

              <Card className="p-5 lg:col-span-2 2xl:col-span-1">
                <CardHeader
                  title="Bank accounts"
                  hint="Balances of the bank and card accounts you've added to dubbl."
                  href="/accounting/banking"
                  linkLabel="Banking"
                />
                <p className="mt-3 text-[22px] font-semibold tracking-[-0.02em] tabular-nums">{formatMoney(cash)}</p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground/85">Total across all accounts</p>
                <div className="mt-4 border-t border-foreground/[0.05] pt-1">
                  {accounts && accounts.length > 0 ? (
                    accounts.map((a, i) => (
                      <Link
                        key={a.id}
                        href={`/accounting/banking/${a.id}`}
                        className="-mx-2 flex items-center gap-3 rounded-lg border-b border-foreground/[0.05] px-2 py-2.5 transition-colors last:border-0 hover:bg-foreground/[0.03]"
                      >
                        <span
                          className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                          style={{ backgroundColor: `${SERIES[i % SERIES.length]}17`, color: SERIES[i % SERIES.length] }}
                        >
                          <Landmark className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium">{a.accountName}</p>
                          <p className="truncate text-[12px] text-muted-foreground/85">
                            {[a.bankName, a.accountNumber].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <span className={cn("shrink-0 text-[13.5px] font-medium tabular-nums", a.balance < 0 && "text-red-600 dark:text-red-400")}>
                          {formatMoney(a.balance, a.currencyCode)}
                        </span>
                      </Link>
                    ))
                  ) : (
                    <button
                      type="button"
                      onClick={() => openDrawer("bankAccount")}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-6 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Plus className="size-4" />
                      Add your first bank account
                    </button>
                  )}
                </div>
              </Card>
            </div>

            {/* Coming up + health */}
            <div className="grid gap-4 @3xl:grid-cols-2">
              <Card className="p-5">
                <CardHeader
                  title="Coming up"
                  hint="Recurring invoices and bills scheduled for the next 8 weeks."
                  href="/reports/cash-flow-forecast"
                  linkLabel="Forecast"
                />
                {forecast && (
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted-foreground">
                    <span>Expected in <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(forecast.totalInflows)}</span></span>
                    <span>Going out <span className="font-medium tabular-nums text-orange-600 dark:text-orange-400">{formatMoney(forecast.totalOutflows)}</span></span>
                    <span>Net <span className="font-medium tabular-nums text-foreground">{formatMoney(forecast.netForecast)}</span></span>
                  </div>
                )}
                <div className="mt-3 border-t border-foreground/[0.05] pt-1">
                  {upcoming.length > 0 ? (
                    upcoming.map((e, i) => (
                      <div key={`${e.date}-${i}`} className="flex items-center gap-3 border-b border-foreground/[0.05] py-2.5 last:border-0">
                        <span className="w-12 shrink-0 text-[12px] tabular-nums text-muted-foreground">{shortDate(e.date)}</span>
                        <span
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                          style={{
                            backgroundColor: `${e.amount >= 0 ? TONE.moneyIn : TONE.moneyOut}17`,
                            color: e.amount >= 0 ? "#047857" : "#C2410C",
                          }}
                        >
                          {e.amount >= 0 ? "Invoice" : "Bill"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13.5px]">{tidy(e.description)}</span>
                        <span className={cn("shrink-0 text-[13.5px] font-medium tabular-nums", e.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                          {e.amount >= 0 ? "+" : "−"}{formatMoney(Math.abs(e.amount))}
                        </span>
                      </div>
                    ))
                  ) : (
                    <EmptyNote>Nothing scheduled. Set up a recurring invoice or bill to see it here.</EmptyNote>
                  )}
                </div>
              </Card>

              <Card className="p-5">
                <CardHeader
                  title="Business health"
                  hint="A few signals that tell you how the business is doing, in plain English."
                  aside={<AskTilly prompt="Explain my profit margin, cash runway, time to get paid and time to pay bills. What do they say about my business and what can I improve?">Explain</AskTilly>}
                  href="/reports/financial-ratios"
                  linkLabel="Ratios"
                />
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <HealthTile
                    label="Profit margin"
                    hint="How much of every dollar you earn is left after costs. Net margin = profit ÷ revenue."
                    value={margin != null ? `${margin}%` : "—"}
                    note={margin == null ? "Not enough data yet" : margin < 0 ? "Costs are higher than income" : `You keep ${Math.round(margin)}¢ of every $1`}
                    status={margin == null ? "none" : margin < 0 ? "bad" : margin < 10 ? "watch" : "good"}
                  />
                  <HealthTile
                    label="Cash runway"
                    hint="How long your cash would last if you kept losing money at this period's pace."
                    value={pnl.netIncome >= 0 ? "Profitable" : runway != null ? `${Math.round(runway)} months` : "—"}
                    note={pnl.netIncome >= 0 ? "You're not burning cash" : `Burning ${formatMoney(Math.round(monthlyBurn))} a month`}
                    status={pnl.netIncome >= 0 ? "good" : runway == null ? "none" : runway < 6 ? "bad" : runway < 12 ? "watch" : "good"}
                  />
                  <HealthTile
                    label="Time to get paid"
                    hint="Days sales outstanding (DSO): on average, how long customers take to pay your invoices."
                    value={dso != null ? `${dso} days` : "—"}
                    note={dso == null ? "Not enough data yet" : dso > 60 ? "Customers are paying slowly" : dso > 30 ? "A little slow" : "Customers pay quickly"}
                    status={dso == null ? "none" : dso > 60 ? "bad" : dso > 30 ? "watch" : "good"}
                  />
                  <HealthTile
                    label="Time to pay bills"
                    hint="Days payables outstanding (DPO): on average, how long you take to pay suppliers."
                    value={dpo != null ? `${dpo} days` : "—"}
                    note={dpo == null ? "Not enough data yet" : dpo > 60 ? "Suppliers may be waiting" : "You pay on a normal schedule"}
                    status={dpo == null ? "none" : dpo > 60 ? "watch" : "good"}
                  />
                </div>
              </Card>
            </div>

            {/* Recent activity */}
            <div className="grid gap-4 pt-2 @4xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold">Recent entries</h3>
                  <Link href="/accounting" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                    View all
                  </Link>
                </div>
                <DataTable
                  columns={columns}
                  data={entries}
                  loading={false}
                  emptyMessage="No journal entries yet."
                  emptyAction={{
                    label: "Create your first entry",
                    onClick: () => openDrawer("entry"),
                  }}
                  onRowClick={(r) => router.push(`/accounting/${r.id}`)}
                />
              </div>
              <div>
                <ActivityFeed />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
