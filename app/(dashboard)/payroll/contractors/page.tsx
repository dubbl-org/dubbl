"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Briefcase, DollarSign, FileText, Plus, Power, Banknote } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton } from "@/components/dashboard/explorer/action-button";
import { DateCell, MoneyCell, MutedCell, PartyCell, StatusPill, formatDay, parseDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

/**
 * One row of GET /api/v1/payroll/contractors. The API also returns `taxId`
 * and `bankAccountNumber`; they are deliberately left out so they never reach
 * the table, the preview or the CSV export.
 */
interface Contractor {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  /** Cents per hour. */
  hourlyRate: number | null;
  currency: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Payment {
  id: string;
  amount: number;
  currency: string | null;
  description: string | null;
  invoiceNumber: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: "pending" | "paid" | "void";
  paidAt: string | null;
  createdAt: string;
}

const STATUSES: ExplorerStatus[] = [
  { value: "active", label: "Active", color: "#10B981", hint: "Working with you now and can be paid" },
  { value: "inactive", label: "Inactive", color: "#D4D4D8", hint: "No longer working with you" },
];

const PAYMENT_STATUS: Record<Payment["status"], { label: string; className: string }> = {
  pending: { label: "To pay", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  paid: { label: "Paid", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  void: { label: "Cancelled", className: "bg-foreground/[0.055] text-muted-foreground" },
};

const statusOf = (c: Contractor) => (c.isActive ? "active" : "inactive");

async function patchContractor(id: string, body: Record<string, unknown>) {
  const orgId = localStorage.getItem("activeOrgId");
  const res = await fetch(`/api/v1/payroll/contractors/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(orgId ? { "x-organization-id": orgId } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(typeof data.error === "string" ? data.error : "Couldn't update this contractor");
  }
}

function rate(c: Contractor) {
  return c.hourlyRate != null ? `${formatMoney(c.hourlyRate, c.currency || "USD")}/hr` : null;
}

export default function ContractorsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  useDocumentTitle("Payroll · Contractors");

  const config = useMemo<ExplorerConfig<Contractor>>(
    () => ({
      id: "payroll-contractors",
      endpoint: "/api/v1/payroll/contractors",
      noun: { one: "Contractor", many: "Contractors" },
      getId: (c) => c.id,
      href: (c) => `/payroll/contractors/${c.id}`,
      status: { get: statusOf, options: STATUSES },
      date: { get: (c) => c.createdAt, label: "Date added" },
      party: { get: (c) => c.company, label: "Company", many: "Companies" },
      currency: (c) => c.currency,
      search: (c) => [c.name, c.company, c.email],
      defaultSort: { key: "created", dir: "desc" },
      facets: [{ key: "currency", label: "Currency", value: (c) => c.currency }],
      columns: [
        { key: "name", label: "Name", value: (c) => c.name, render: (c) => <PartyCell name={c.name} sub={c.email} /> },
        { key: "company", label: "Company", className: "w-48", value: (c) => c.company, render: (c) => <MutedCell value={c.company} /> },
        { key: "status", label: "Status", className: "w-28", value: statusOf, render: (c) => <StatusPill value={statusOf(c)} options={STATUSES} /> },
        {
          key: "rate",
          label: "Hourly rate",
          align: "right",
          className: "w-32",
          value: (c) => c.hourlyRate,
          render: (c) => (c.hourlyRate != null ? <span className="tabular-nums font-medium">{rate(c)}</span> : <span className="text-muted-foreground/50">—</span>),
          csv: (c) => (c.hourlyRate != null ? (c.hourlyRate / 100).toFixed(2) : ""),
        },
        {
          key: "day",
          label: "Day rate",
          align: "right",
          className: "w-32",
          hint: "Their hourly rate for an 8-hour day",
          value: (c) => (c.hourlyRate != null ? c.hourlyRate * 8 : null),
          render: (c) => (c.hourlyRate != null ? <MoneyCell cents={c.hourlyRate * 8} currency={c.currency} /> : <span className="text-muted-foreground/50">—</span>),
          csv: (c) => (c.hourlyRate != null ? ((c.hourlyRate * 8) / 100).toFixed(2) : ""),
        },
        { key: "currency", label: "Currency", className: "w-24", value: (c) => c.currency },
        { key: "created", label: "Added", className: "w-32", value: (c) => c.createdAt, render: (c) => <DateCell value={c.createdAt} /> },
        { key: "email", label: "Email", hidden: true, value: (c) => c.email, render: (c) => <MutedCell value={c.email} /> },
        { key: "updated", label: "Last changed", className: "w-32", hidden: true, value: (c) => c.updatedAt, render: (c) => <DateCell value={c.updatedAt} /> },
      ],
      metrics: (rows) => {
        const active = rows.filter((c) => c.isActive);
        const rated = active.filter((c) => c.hourlyRate != null && c.hourlyRate > 0);
        const avg = rated.length ? Math.round(rated.reduce((s, c) => s + (c.hourlyRate ?? 0), 0) / rated.length) : 0;
        const top = [...rated].sort((a, b) => (b.hourlyRate ?? 0) - (a.hourlyRate ?? 0))[0];
        const companies = new Set(active.map((c) => c.company).filter(Boolean)).size;
        const thisYear = new Date().getFullYear();
        const added = rows.filter((c) => parseDay(c.createdAt)?.getFullYear() === thisYear).length;
        const noEmail = active.filter((c) => !c.email).length;
        return [
          { key: "active", label: "Active contractors", color: "#10B981", status: "active", value: active.length.toString(), note: `${companies} compan${companies === 1 ? "y" : "ies"}`, hint: "Contractors you're working with now." },
          { key: "inactive", label: "Inactive", color: "#D4D4D8", status: "inactive", value: (rows.length - active.length).toString(), note: `${rows.length} in total`, hint: "Contractors you no longer work with. Their history is kept." },
          { key: "avg", label: "Average hourly rate", color: "#0EA5E9", value: rated.length ? `${formatMoney(avg)}/hr` : "—", note: rated.length ? `Across ${rated.length} with a rate` : "No rates set yet", hint: "The typical hourly rate of active contractors who have one set." },
          { key: "top", label: "Highest rate", color: "#8B5CF6", value: top ? rate(top) : "—", note: top ? top.name : "No rates set yet", hint: "Your most expensive active contractor per hour." },
          { key: "added", label: "Added this year", color: "#EC4899", value: added.toString(), note: `Since Jan 1, ${thisYear}`, hint: "Contractors you added this calendar year." },
          { key: "noEmail", label: "Missing email", color: "#F59E0B", value: noEmail.toString(), note: noEmail ? "Add one to send them documents" : "Everyone has an email", hint: "Active contractors without an email address." },
        ];
      },
      preview: (c, helpers) => (
        <DocumentPreview
          number={c.company || "Contractor"}
          plainTitle
          status={statusOf(c)}
          statusOptions={STATUSES}
          party={c.name}
          partySub={c.email}
          amount={c.hourlyRate ?? undefined}
          amountLabel="an hour"
          currency={c.currency}
          facts={[
            { label: "Hourly rate", value: rate(c) ?? "—" },
            { label: "Day rate (8h)", value: c.hourlyRate != null ? formatMoney(c.hourlyRate * 8, c.currency || "USD") : "—" },
            { label: "Company", value: c.company || "—" },
            { label: "Email", value: c.email || "—" },
            { label: "Currency", value: c.currency || "USD" },
            { label: "Added", value: formatDay(c.createdAt) },
          ]}
          actions={
            <>
              <ActionButton primary icon={<Banknote className="size-3.5" />} run={async () => router.push(`/payroll/contractors/${c.id}`)}>
                Record a payment
              </ActionButton>
              <ActionButton
                icon={<Power className="size-3.5" />}
                success={c.isActive ? "Marked as inactive" : "Marked as active"}
                run={async () => {
                  await patchContractor(c.id, { isActive: !c.isActive });
                  helpers.refresh();
                }}
              >
                {c.isActive ? "Mark inactive" : "Mark active"}
              </ActionButton>
            </>
          }
        >
          <ContractorPayments contractorId={c.id} currency={c.currency} />
        </DocumentPreview>
      ),
      empty: <ContractorsEmpty onCreate={() => openDrawer("contractor")} />,
    }),
    [openDrawer, router]
  );

  return <Explorer config={config} />;
}

/** Payments made or waiting to be made to this contractor. */
function ContractorPayments({ contractorId, currency }: { contractorId: string; currency: string | null }) {
  const [state, setState] = useState<{ id: string; payments: Payment[] } | null>(null);
  const payments = state && state.id === contractorId ? state.payments : null;
  const cur = currency || "USD";

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    fetch(`/api/v1/payroll/contractors/${contractorId}`, { headers: { "x-organization-id": orgId } })
      .then((r) => (r.ok ? r.json() : {}))
      .then((json: { contractor?: { payments?: Payment[] } }) => {
        const list = [...(json.contractor?.payments ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (!cancelled) setState({ id: contractorId, payments: list });
      })
      .catch(() => {
        if (!cancelled) setState({ id: contractorId, payments: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [contractorId]);

  const paid = payments?.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0) ?? 0;
  const pending = payments?.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0) ?? 0;

  return (
    <div className="mt-6">
      <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Payments</p>
      {!payments ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : payments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">No payments yet</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/80">
          <div className="divide-y divide-border/60">
            {payments.slice(0, 12).map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.description || p.invoiceNumber || "Payment"}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {p.periodStart && p.periodEnd ? `${formatDay(p.periodStart)} – ${formatDay(p.periodEnd)}` : formatDay(p.paidAt ?? p.createdAt)}
                    {p.invoiceNumber && p.description ? ` · ${p.invoiceNumber}` : ""}
                  </span>
                </span>
                <span className={cn("rounded px-1.5 py-px text-[11px] font-medium", PAYMENT_STATUS[p.status]?.className)}>{PAYMENT_STATUS[p.status]?.label ?? p.status}</span>
                <span className="w-24 text-right tabular-nums">{formatMoney(p.amount, p.currency || cur)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1 border-t border-border/80 bg-foreground/[0.015] px-3 py-2.5 text-[13px]">
            <div className="flex justify-between text-muted-foreground">
              <span>Waiting to be paid</span>
              <span className="tabular-nums">{formatMoney(pending, cur)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Paid so far</span>
              <span className="tabular-nums">{formatMoney(paid, cur)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

function ContractorsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal className="space-y-6">
      {/* Main hero empty state */}
      <motion.div {...anim(0.2)} className="relative overflow-hidden rounded-2xl border-2 border-dashed">
        <div className="relative flex flex-col items-center justify-center py-20 px-6 text-center">
          {/* Animated icons */}
          <div className="relative mb-6">
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex size-16 items-center justify-center rounded-2xl bg-muted ring-4 ring-muted/50"
            >
              <Briefcase className="size-8 text-foreground" />
            </motion.div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              className="absolute -top-2 -right-3 flex size-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/60 ring-2 ring-blue-100/50 dark:ring-blue-900/30"
            >
              <DollarSign className="size-4 text-blue-600 dark:text-blue-400" />
            </motion.div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.4, delay: 0.6 }}
              className="absolute -bottom-1 -left-3 flex size-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/60 ring-2 ring-amber-100/50 dark:ring-amber-900/30"
            >
              <FileText className="size-3.5 text-amber-600 dark:text-amber-400" />
            </motion.div>
          </div>

          <motion.h3 {...anim(0.4)} className="text-lg font-semibold">
            No contractors yet
          </motion.h3>
          <motion.p {...anim(0.45)} className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
            Add contractors to manage payments and track costs for external workers.
          </motion.p>

          <motion.div {...anim(0.55)} className="mt-8">
            <Button onClick={onCreate} size="lg" className="bg-brand-600 hover:bg-brand-700 shadow-md shadow-brand-600/20">
              <Plus className="mr-2 size-4" />
              Add Your First Contractor
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Ghost rows */}
      <motion.div {...anim(0.6)} className="space-y-3">
        <div className="rounded-xl border border-dashed border-muted-foreground/15 divide-y divide-dashed divide-muted-foreground/10">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5" style={{ opacity: 1 - i * 0.25 }}>
              <div className="size-9 rounded-lg bg-muted/40" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-36 rounded bg-muted/40" />
                <div className="h-3 w-16 rounded bg-muted/30" />
              </div>
              <div className="hidden sm:block h-3.5 w-20 rounded bg-muted/30" />
            </div>
          ))}
        </div>
      </motion.div>
    </ContentReveal>
  );
}
