"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Landmark, Wallet, Banknote, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, DueCell, MoneyCell, MutedCell, StatusPill, daysUntil, formatDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface Loan {
  id: string;
  name: string;
  principalAmount: number;
  /** Basis points: 500 = 5% */
  interestRate: number;
  termMonths: number;
  startDate: string;
  monthlyPayment: number;
  status: string;
  createdAt: string;
  bankAccount: { accountName: string; bankName: string | null } | null;
  principalAccount: { code: string; name: string } | null;
  interestAccount: { code: string; name: string } | null;
}

interface ScheduleEntry {
  id: string;
  periodNumber: number;
  date: string | null;
  principalAmount: number;
  interestAmount: number;
  totalPayment: number;
  remainingBalance: number;
  posted: boolean;
  sortOrder: number;
}

/** Where a loan stands, worked out from its repayment schedule. */
interface LoanPlan {
  schedule: ScheduleEntry[];
  paymentsMade: number;
  owed: number;
  principalPaid: number;
  interestPaid: number;
  interestLeft: number;
  next: ScheduleEntry | null;
  endDate: string | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "active", label: "Paying off", color: "#0EA5E9", hint: "Payments are up to date" },
  { value: "behind", label: "Payment due", color: "#F59E0B", hint: "A scheduled payment date has passed without a payment recorded" },
  { value: "paid_off", label: "Paid off", color: "#10B981", hint: "Every payment has been made" },
  { value: "defaulted", label: "Defaulted", color: "#EF4444", hint: "Marked as not being repaid" },
];

const rate = (bp: number) => `${(bp / 100).toFixed(2)}%`;

function lengthLabel(months: number) {
  if (months % 12 === 0) return `${months / 12} yr${months === 12 ? "" : "s"}`;
  return months > 12 ? `${(months / 12).toFixed(1)} yrs` : `${months} mo`;
}

function planFrom(loan: Loan, schedule: ScheduleEntry[]): LoanPlan {
  const sorted = [...schedule].sort((a, b) => a.sortOrder - b.sortOrder);
  const paid = sorted.filter((e) => e.posted);
  const open = sorted.filter((e) => !e.posted);
  return {
    schedule: sorted,
    paymentsMade: paid.length,
    owed: open.length || paid.length ? open.reduce((s, e) => s + e.principalAmount, 0) : loan.principalAmount,
    principalPaid: paid.reduce((s, e) => s + e.principalAmount, 0),
    interestPaid: paid.reduce((s, e) => s + e.interestAmount, 0),
    interestLeft: open.reduce((s, e) => s + e.interestAmount, 0),
    next: open[0] ?? null,
    endDate: sorted[sorted.length - 1]?.date ?? null,
  };
}

/**
 * The list route doesn't include repayment schedules, so load each loan's
 * schedule once to answer "how much do we still owe" and "what's due next".
 */
function useLoanPlans(version: number) {
  const [plans, setPlans] = useState<Record<string, LoanPlan> | null>(null);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    const headers = { "x-organization-id": orgId };
    (async () => {
      try {
        const loans: Loan[] = [];
        for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
          const json = await fetch(`/api/v1/loans?page=${page}&limit=100`, { headers }).then((r) => r.json());
          loans.push(...((json.data ?? []) as Loan[]));
          pages = json.pagination?.totalPages ?? 1;
        }
        const details = await Promise.all(
          loans.map((l) =>
            fetch(`/api/v1/loans/${l.id}`, { headers })
              .then((r) => (r.ok ? r.json() : null))
              .then((json) => [l.id, planFrom(l, (json?.schedule ?? []) as ScheduleEntry[])] as const)
              .catch(() => [l.id, planFrom(l, [])] as const)
          )
        );
        if (!cancelled) setPlans(Object.fromEntries(details));
      } catch {
        if (!cancelled) setPlans({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  return plans;
}

export default function LoansPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [planVersion, setPlanVersion] = useState(0);
  const plans = useLoanPlans(planVersion);

  useDocumentTitle("Accounting · Loans");

  const config = useMemo<ExplorerConfig<Loan>>(() => {
    const planOf = (l: Loan) => plans?.[l.id];
    const statusOf = (l: Loan) => {
      const next = planOf(l)?.next;
      if (l.status === "active" && next?.date && (daysUntil(next.date) ?? 0) < 0) return "behind";
      return l.status;
    };
    const isActive = (l: Loan) => l.status === "active";
    const pending = <span className="text-muted-foreground/50">…</span>;

    return {
      id: "loans",
      endpoint: "/api/v1/loans",
      noun: { one: "Loan", many: "Loans" },
      getId: (l) => l.id,
      href: (l) => `/accounting/loans/${l.id}`,
      status: { get: statusOf, options: STATUSES },
      date: { get: (l) => l.startDate, label: "Start date" },
      amount: (l) => l.principalAmount,
      amountLabel: "Borrowed",
      search: (l) => [l.name, l.bankAccount?.accountName, l.bankAccount?.bankName, l.principalAccount?.name, l.interestAccount?.name],
      defaultSort: { key: "start", dir: "desc" },
      facets: [
        { key: "bank", label: "Paid from", value: (l) => l.bankAccount?.accountName ?? "No bank account" },
        { key: "length", label: "Length", value: (l) => lengthLabel(l.termMonths) },
      ],
      columns: [
        {
          key: "name",
          label: "Loan",
          value: (l) => l.name,
          render: (l) => <span className="block truncate font-medium">{l.name}</span>,
        },
        { key: "borrowed", label: "Borrowed", align: "right", className: "w-32", money: true, value: (l) => l.principalAmount },
        { key: "rate", label: "Interest", align: "right", className: "w-24", hint: "Yearly interest rate", value: (l) => l.interestRate, render: (l) => <span className="tabular-nums">{rate(l.interestRate)}</span>, csv: (l) => rate(l.interestRate) },
        { key: "monthly", label: "Monthly payment", align: "right", className: "w-36", money: true, value: (l) => l.monthlyPayment },
        {
          key: "owed",
          label: "Still owed",
          align: "right",
          className: "w-32",
          money: true,
          hint: "What's left to pay back, not counting future interest",
          value: (l) => planOf(l)?.owed ?? 0,
          render: (l) => (plans ? <MoneyCell cents={planOf(l)?.owed ?? 0} className={isActive(l) ? "font-medium" : undefined} /> : pending),
        },
        {
          key: "progress",
          label: "Paid back",
          className: "w-40",
          hint: "Payments recorded out of the total number of payments",
          value: (l) => (planOf(l) ? planOf(l)!.paymentsMade / Math.max(1, l.termMonths) : null),
          render: (l) => {
            const p = planOf(l);
            if (!p) return pending;
            const pct = Math.min(100, Math.round((p.paymentsMade / Math.max(1, l.termMonths)) * 100));
            return (
              <span className="flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-12 text-right text-[12px] tabular-nums text-muted-foreground">{p.paymentsMade}/{l.termMonths}</span>
              </span>
            );
          },
          csv: (l) => (planOf(l) ? `${planOf(l)!.paymentsMade}/${l.termMonths}` : ""),
        },
        {
          key: "next",
          label: "Next payment",
          className: "w-44",
          value: (l) => (isActive(l) ? planOf(l)?.next?.date : null),
          render: (l) => (plans ? isActive(l) && planOf(l)?.next ? <DueCell value={planOf(l)!.next!.date} open /> : <span className="text-muted-foreground/50">—</span> : pending),
        },
        { key: "status", label: "Status", className: "w-32", value: statusOf, render: (l) => <StatusPill value={statusOf(l)} options={STATUSES} /> },
        { key: "start", label: "Started", className: "w-32", hidden: true, value: (l) => l.startDate, render: (l) => <DateCell value={l.startDate} /> },
        { key: "ends", label: "Last payment", className: "w-32", hidden: true, value: (l) => planOf(l)?.endDate, render: (l) => <DateCell value={planOf(l)?.endDate} /> },
        { key: "term", label: "Length", align: "right", className: "w-24", hidden: true, value: (l) => l.termMonths, render: (l) => <span className="tabular-nums">{lengthLabel(l.termMonths)}</span> },
        { key: "interestPaid", label: "Interest paid", align: "right", className: "w-32", money: true, hidden: true, value: (l) => planOf(l)?.interestPaid ?? 0 },
        { key: "interestLeft", label: "Interest to come", align: "right", className: "w-32", money: true, hidden: true, hint: "Interest still to pay if the loan runs to the end", value: (l) => planOf(l)?.interestLeft ?? 0 },
        { key: "bank", label: "Paid from", className: "w-40", hidden: true, value: (l) => l.bankAccount?.accountName, render: (l) => <MutedCell value={l.bankAccount?.accountName} /> },
        { key: "loanAccount", label: "Loan account", className: "w-44", hidden: true, value: (l) => l.principalAccount?.name, render: (l) => <MutedCell value={l.principalAccount?.name} /> },
        { key: "interestAccount", label: "Interest account", className: "w-44", hidden: true, value: (l) => l.interestAccount?.name, render: (l) => <MutedCell value={l.interestAccount?.name} /> },
        { key: "created", label: "Added", className: "w-32", hidden: true, value: (l) => l.createdAt, render: (l) => <DateCell value={l.createdAt} /> },
      ],
      metrics: (rows) => {
        const active = rows.filter(isActive);
        const ready = plans !== null;
        const waiting = "…";
        const owed = active.reduce((s, l) => s + (planOf(l)?.owed ?? 0), 0);
        const upcoming = active
          .map((l) => ({ loan: l, next: planOf(l)?.next }))
          .filter((x): x is { loan: Loan; next: ScheduleEntry } => Boolean(x.next?.date))
          .sort((a, b) => (a.next.date ?? "").localeCompare(b.next.date ?? ""));
        const first = upcoming[0];
        const behind = rows.filter((l) => statusOf(l) === "behind");
        const interestPaid = rows.reduce((s, l) => s + (planOf(l)?.interestPaid ?? 0), 0);
        const interestLeft = active.reduce((s, l) => s + (planOf(l)?.interestLeft ?? 0), 0);
        const borrowed = rows.reduce((s, l) => s + l.principalAmount, 0);
        const repaid = rows.reduce((s, l) => s + (planOf(l)?.principalPaid ?? 0), 0);
        return [
          { key: "owed", label: "You still owe", color: "#F59E0B", value: ready ? formatMoney(owed) : waiting, note: `${active.length} active loan${active.length === 1 ? "" : "s"}`, hint: "What's left to pay back on active loans, not counting future interest." },
          {
            key: "next",
            label: "Next payment",
            color: "#0EA5E9",
            value: ready ? (first ? formatDay(first.next.date) : "—") : waiting,
            note: first ? `${formatMoney(first.next.totalPayment)} · ${first.loan.name}` : "Nothing scheduled",
            hint: "The soonest scheduled payment across all active loans.",
          },
          { key: "monthly", label: "Monthly payments", color: "#6366F1", value: formatMoney(active.reduce((s, l) => s + l.monthlyPayment, 0)), note: "Across active loans", hint: "What leaves your bank each month to cover your loans." },
          { key: "interest", label: "Interest paid so far", color: "#EC4899", value: ready ? formatMoney(interestPaid) : waiting, note: ready ? `${formatMoney(interestLeft)} still to come` : "Working it out", hint: "The cost of borrowing: interest on payments already recorded, and what's left if loans run to the end." },
          { key: "repaid", label: "Paid back", color: "#10B981", value: ready ? formatMoney(repaid) : waiting, note: borrowed ? `${Math.round((repaid / borrowed) * 100)}% of what you borrowed` : "Nothing borrowed", hint: "How much of the original amounts you've repaid so far." },
          { key: "behind", label: "Payments due", color: "#EF4444", status: "behind", value: ready ? behind.length.toLocaleString() : waiting, note: behind.length ? "Record them to keep balances right" : "All up to date", hint: "Active loans with a scheduled payment date in the past that hasn't been recorded." },
        ];
      },
      preview: (l, helpers) => {
        const plan = planOf(l);
        const next = plan?.next;
        return (
          <DocumentPreview
            number={l.name}
            status={statusOf(l)}
            statusOptions={STATUSES}
            amount={plan ? plan.owed : l.principalAmount}
            amountLabel={plan ? "still owed" : "borrowed"}
            facts={[
              { label: "Borrowed", value: formatMoney(l.principalAmount) },
              { label: "Interest rate", value: rate(l.interestRate) },
              { label: "Monthly payment", value: formatMoney(l.monthlyPayment) },
              { label: "Payments made", value: plan ? `${plan.paymentsMade} of ${l.termMonths}` : "…" },
              { label: "Started", value: formatDay(l.startDate) },
              { label: "Last payment", value: formatDay(plan?.endDate) },
              { label: "Interest paid", value: plan ? formatMoney(plan.interestPaid) : "…" },
              { label: "Paid from", value: l.bankAccount?.accountName ?? "—" },
            ]}
            actions={
              <>
                {l.status === "active" && next && (
                  <ActionButton
                    primary
                    icon={<Banknote className="size-3.5" />}
                    run={() =>
                      confirm({
                        title: "Record this month's payment?",
                        description: `This logs payment #${next.periodNumber} of ${formatMoney(next.totalPayment)} — ${formatMoney(next.principalAmount)} off the loan and ${formatMoney(next.interestAmount)} in interest.`,
                        confirmLabel: "Record payment",
                        onConfirm: async () => {
                          try {
                            await postJson(`/api/v1/loans/${l.id}/post-payment`);
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Couldn't record the payment");
                            throw err;
                          }
                          toast.success("Payment recorded");
                          setPlanVersion((v) => v + 1);
                          helpers.refresh();
                        },
                      })
                    }
                  >
                    Record next payment
                  </ActionButton>
                )}
                <ActionButton icon={<ArrowUpRight className="size-3.5" />} run={async () => router.push(`/accounting/loans/${l.id}`)}>
                  Open loan
                </ActionButton>
              </>
            }
          >
            <LoanSchedulePreview plan={plan} />
          </DocumentPreview>
        );
      },
      empty: <LoansEmpty onCreate={() => openDrawer("loan")} />,
    };
  }, [plans, confirm, openDrawer, router]);

  return (
    <>
      <Explorer config={config} />
      {confirmDialog}
    </>
  );
}

function LoanSchedulePreview({ plan }: { plan: LoanPlan | undefined }) {
  if (!plan) {
    return (
      <div className="mt-6 space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    );
  }
  const upcoming = plan.schedule.filter((e) => !e.posted).slice(0, 6);
  const recent = plan.schedule.filter((e) => e.posted).slice(-3).reverse();
  const rows = [...upcoming.map((e) => ({ e, done: false })), ...recent.map((e) => ({ e, done: true }))];
  return (
    <div className="mt-6">
      <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Payments</p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">No repayment schedule</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/80">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="h-8 bg-foreground/[0.025] text-[11.5px] text-muted-foreground">
                <th className="px-3 text-left font-medium">Date</th>
                <th className="w-24 px-2 text-right font-medium">Loan</th>
                <th className="w-24 px-2 text-right font-medium">Interest</th>
                <th className="w-24 px-3 text-right font-medium">Payment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, done }, i) => (
                <tr key={e.id} className={cn("border-t border-border/60", done && "text-muted-foreground", done && i === upcoming.length && "border-t-border")}>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatDay(e.date)}</span>
                      {done ? (
                        <span className="rounded bg-emerald-500/10 px-1.5 py-px text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Paid</span>
                      ) : (
                        <span className="text-[11.5px] text-muted-foreground">#{e.periodNumber}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatMoney(e.principalAmount)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatMoney(e.interestAmount)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(e.totalPayment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-1 border-t border-border/80 bg-foreground/[0.015] px-3 py-2.5 text-[13px]">
            <div className="flex justify-between text-muted-foreground">
              <span>Paid back so far</span>
              <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(plan.principalPaid)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Still owed</span>
              <span className="tabular-nums">{formatMoney(plan.owed)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoansEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div className="pt-12 pb-12 space-y-10">
        {/* Top: title + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Loans</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Track money you&apos;ve borrowed, see how each monthly payment splits between the loan and interest, and record payments as you make them.
            </p>
          </div>
          <Button onClick={onCreate} className="bg-brand-600 hover:bg-brand-700 shrink-0">
            <Plus className="mr-2 size-4" />
            New loan
          </Button>
        </div>

        <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
          {/* Left: how it works */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How a loan works</p>
            </div>
            <div className="divide-y">
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                    <Landmark className="size-3.5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Amount borrowed</p>
                    <p className="text-[11px] text-muted-foreground">Equipment loan</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium">$10,000.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 bg-brand-50/30 dark:bg-brand-950/10">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-950/40">
                    <Wallet className="size-3.5 text-brand-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-700 dark:text-brand-300">Monthly payment</p>
                    <p className="text-[11px] text-muted-foreground">Part loan, part interest</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium text-brand-600 dark:text-brand-400">-$880.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="size-7" />
                  <p className="text-sm font-semibold">Paid off over time</p>
                </div>
                <span className="font-mono text-sm font-bold">$0.00</span>
              </div>
            </div>
          </div>

          {/* Right: Use cases */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">When to use</p>
            {[
              { title: "Bank or business loan", desc: "Borrowed a lump sum you repay in fixed monthly instalments.", color: "border-l-blue-400" },
              { title: "Equipment or vehicle finance", desc: "Financed a big purchase? Track what you still owe and each payment.", color: "border-l-brand-400" },
              { title: "See the interest you pay", desc: "Every payment is split for you between the loan itself and interest.", color: "border-l-amber-400" },
              { title: "Keep your books accurate", desc: "Record each payment so your loan balance always matches reality.", color: "border-l-purple-400" },
            ].map(({ title, desc, color }) => (
              <div key={title} className={`rounded-lg border border-l-[3px] ${color} bg-card px-4 py-3`}>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ContentReveal>
  );
}
