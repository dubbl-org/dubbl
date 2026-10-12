"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, Mail, ScrollText } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton } from "@/components/dashboard/explorer/action-button";
import { DateCell, DueCell, MoneyCell, PartyCell, StatusPill, formatDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";
import { AgingBar, StatementPreview, agingBucketLabel, type BalanceRow } from "@/components/dashboard/contacts/balance-bits";
import {
  STATEMENT_PERIODS,
  downloadStatementPdfs,
  emailStatements,
  periodRange,
  type StatementPeriod,
} from "@/components/dashboard/contacts/actions";

type Side = "customer" | "supplier";

const STANDING: ExplorerStatus[] = [
  { value: "overdue", label: "Overdue", color: "#EF4444", hint: "Something on the statement is past due" },
  { value: "open", label: "Not yet due", color: "#0EA5E9", hint: "Open balance, nothing late yet" },
];
const standing = (c: BalanceRow) => (c.overdue > 0 ? "overdue" : "open");

export default function StatementsPage() {
  useDocumentTitle("Contacts · Statements");
  const [side, setSide] = useState<Side>("customer");
  const [period, setPeriod] = useState<StatementPeriod>("12m");
  const range = useMemo(() => periodRange(period), [period]);
  const periodLabel = STATEMENT_PERIODS.find((p) => p.value === period)?.label ?? "";

  const config = useMemo<ExplorerConfig<BalanceRow>>(() => {
    const customer = side === "customer";
    return {
      id: `contacts-statements-${side}`,
      endpoint: "/api/v1/contacts/balances",
      params: { side, open: "1" },
      noun: customer ? { one: "Customer statement", many: "Customer statements" } : { one: "Supplier statement", many: "Supplier statements" },
      getId: (c) => c.id,
      href: (c) => `/contacts/${c.id}/statement`,
      status: { get: standing, options: STANDING },
      amount: (c) => c.outstanding,
      amountLabel: customer ? "To collect" : "To pay",
      currency: (c) => c.currencyCode,
      chart: false,
      search: (c) => [c.name, c.email],
      defaultSort: { key: "outstanding", dir: "desc" },
      facets: [
        { key: "age", label: "How late", value: (c) => agingBucketLabel(c.aging, c.outstanding) },
        { key: "email", label: "Email", value: (c) => (c.email ? "Has an email" : "No email") },
        { key: "currency", label: "Currency", value: (c) => c.currencyCode },
      ],
      actions: (
        <div className="flex items-center gap-2">
          <div className="flex h-8 items-center gap-0.5 rounded-lg bg-foreground/[0.04] p-0.5">
            {(["customer", "supplier"] as Side[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[13px] transition-colors",
                  side === s ? "bg-foreground/[0.07] font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s === "customer" ? "Customers" : "Suppliers"}
              </button>
            ))}
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as StatementPeriod)}>
            <SelectTrigger size="sm" className="h-8 w-[150px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATEMENT_PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ),
      columns: [
        {
          key: "name",
          label: customer ? "Customer" : "Supplier",
          value: (c) => c.name,
          render: (c) => <PartyCell name={c.name} sub={c.email ?? "No email — download the PDF instead"} />,
        },
        { key: "standing", label: "Standing", className: "w-36", value: standing, render: (c) => <StatusPill value={standing(c)} options={STANDING} /> },
        {
          key: "outstanding",
          label: customer ? "Balance" : "You owe",
          align: "right",
          className: "w-32",
          money: true,
          value: (c) => c.outstanding,
          render: (c) => <MoneyCell cents={c.outstanding} currency={c.currencyCode} className="font-medium" />,
        },
        {
          key: "overdue",
          label: "Overdue",
          align: "right",
          className: "w-32",
          money: true,
          value: (c) => c.overdue,
          render: (c) => <MoneyCell cents={c.overdue} currency={c.currencyCode} className={c.overdue > 0 ? "font-semibold text-red-600 dark:text-red-400" : undefined} />,
        },
        {
          key: "oldest",
          label: "Oldest overdue",
          className: "w-44",
          value: (c) => c.oldestOverdueDate,
          render: (c) => (c.oldestOverdueDate ? <DueCell value={c.oldestOverdueDate} open /> : <span className="text-muted-foreground/50">—</span>),
        },
        { key: "openCount", label: customer ? "Open invoices" : "Open bills", align: "right", className: "w-28", value: (c) => c.openCount },
        { key: "lastPay", label: "Last payment", className: "w-32", value: (c) => c.lastPaymentDate, render: (c) => (c.lastPaymentDate ? <DateCell value={c.lastPaymentDate} /> : <span className="text-muted-foreground/50">Never</span>) },
      ],
      metrics: (rows) => {
        const total = rows.reduce((s, c) => s + c.outstanding, 0);
        const overdue = rows.reduce((s, c) => s + c.overdue, 0);
        const late = rows.filter((c) => c.overdue > 0).length;
        const over90 = rows.reduce((s, c) => s + c.aging.over90, 0);
        const withEmail = rows.filter((c) => c.email).length;
        return [
          { key: "total", label: customer ? "To collect" : "To pay", color: "#0EA5E9", value: formatMoney(total), note: `${rows.length} open balance${rows.length === 1 ? "" : "s"}`, hint: customer ? "What customers with an open balance owe you in total." : "What you owe suppliers with an open balance." },
          { key: "overdue", label: "Overdue", color: "#EF4444", status: "overdue", value: formatMoney(overdue), note: `${late} with late items`, hint: "Past due on these statements. Click to show only them." },
          { key: "over90", label: "Over 90 days", color: "#B91C1C", value: formatMoney(over90), note: over90 ? "Worth a phone call" : "Nothing that old", hint: "Items more than 90 days past due." },
          customer
            ? { key: "email", label: "Can be emailed", color: "#10B981", value: `${withEmail} of ${rows.length}`, note: rows.length - withEmail ? `${rows.length - withEmail} missing an email` : "Everyone has an email", hint: "Statements are emailed to the contact's main email address." }
            : { key: "spend", label: "Spent this year", color: "#10B981", value: formatMoney(rows.reduce((s, c) => s + c.totalThisYear, 0)), note: "With these suppliers", hint: "Everything these suppliers billed you since 1 January." },
          customer
            ? { key: "credit", label: "Credit on account", color: "#8B5CF6", value: formatMoney(rows.reduce((s, c) => s + c.unappliedCredit, 0)), note: "Prepayments not yet used", hint: "Prepayments customers have with you that aren't used on an invoice yet." }
            : (() => {
                const paid = rows.filter((c) => c.avgDaysToPay != null && c.paidCount > 0);
                const n = paid.reduce((s, c) => s + c.paidCount, 0);
                const days = n ? Math.round(paid.reduce((s, c) => s + (c.avgDaysToPay ?? 0) * c.paidCount, 0) / n) : null;
                return { key: "payDays", label: "Avg. days to pay", color: "#8B5CF6", value: days == null ? "—" : `${days} days`, note: n ? `${n} paid bills` : "No paid bills yet", hint: "How long you usually take to pay these suppliers." };
              })(),
          { key: "period", label: "Statement period", color: "#A1A1AA", value: periodLabel, note: `${formatDay(range.startDate)} – ${formatDay(range.endDate)}`, hint: "Change it with the period picker above." },
        ];
      },
      bulkActions: (selected) => (
        <>
          {customer && (
            <ActionButton icon={<Mail className="size-3.5" />} run={() => emailStatements(selected, range)} className={selected.some((c) => c.email) ? undefined : "pointer-events-none opacity-40"}>
              Email {selected.length > 1 ? `${selected.filter((c) => c.email).length} statements` : "statement"}
            </ActionButton>
          )}
          <ActionButton icon={<Download className="size-3.5" />} run={() => downloadStatementPdfs(selected, range)}>
            Download PDF{selected.length > 1 ? "s" : ""}
          </ActionButton>
        </>
      ),
      preview: (c) => (
        <DocumentPreview
          plainTitle
          number={`${periodLabel} statement`}
          status={standing(c)}
          statusOptions={STANDING}
          party={c.name}
          partySub={c.email ?? "No email on file"}
          amount={c.outstanding}
          amountLabel={customer ? "owes you" : "you owe"}
          currency={c.currencyCode}
          facts={[
            { label: "Overdue", value: c.overdue > 0 ? <span className="text-red-600 dark:text-red-400">{formatMoney(c.overdue, c.currencyCode || "USD")}</span> : "Nothing late" },
            { label: customer ? "Open invoices" : "Open bills", value: `${c.openCount}${c.overdueCount ? ` · ${c.overdueCount} late` : ""}` },
            { label: "Last payment", value: c.lastPaymentDate ? formatDay(c.lastPaymentDate) : "Never" },
            { label: customer ? "Sent to" : "Email", value: c.email || "—" },
          ]}
          actions={
            <>
              {customer && (
                <ActionButton primary icon={<Mail className="size-3.5" />} run={() => emailStatements([c], range)} className={c.email ? undefined : "pointer-events-none opacity-40"}>
                  Email statement
                </ActionButton>
              )}
              <ActionButton primary={!customer} icon={<Download className="size-3.5" />} run={() => downloadStatementPdfs([c], range)}>
                Download PDF
              </ActionButton>
              <Link href={`/contacts/${c.id}/statement`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-[13px] font-medium hover:bg-foreground/[0.03]">
                <ScrollText className="size-3.5" />
                Full statement
              </Link>
            </>
          }
        >
          <AgingBar aging={c.aging} currency={c.currencyCode} />
          <StatementPreview contactId={c.id} side={side} startDate={range.startDate} endDate={range.endDate} currency={c.currencyCode} />
        </DocumentPreview>
      ),
      empty: <AllSettled side={side} onSwitch={() => setSide(side === "customer" ? "supplier" : "customer")} />,
    };
  }, [side, range, period, periodLabel]);

  return <Explorer key={side} config={config} />;
}

function AllSettled({ side, onSwitch }: { side: Side; onSwitch: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10">
        <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="mt-4 text-[17px] font-semibold tracking-tight">{side === "customer" ? "No customer owes you anything" : "You don't owe any supplier"}</h2>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
        Statements show up here for every {side} with an open balance, ready to email or download.
      </p>
      <button type="button" onClick={onSwitch} className="mt-4 text-[13px] font-medium underline-offset-2 hover:underline">
        Show {side === "customer" ? "supplier" : "customer"} statements
      </button>
    </div>
  );
}
