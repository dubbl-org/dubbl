import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Amount, Arrow, Box, Frame, Label, Pill, type Tone } from "./frame";

// Diagrams for the tax and reports docs, built from the primitives in ./frame.
// Amounts are always integer cents, like the app.

const money = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/* ------------------------------------------------------------------ tax */

/**
 * Tax you charged on sales, minus tax you paid on purchases, is what the
 * return asks for (or gives back).
 */
export function TaxNetFlow({
  collected = 450000,
  paid = 120000,
  taxName = "VAT",
  authority = "the tax office",
  caption,
}: {
  collected?: number;
  paid?: number;
  taxName?: string;
  authority?: string;
  caption?: string;
}) {
  const net = collected - paid;
  const max = Math.max(collected, paid, Math.abs(net), 1);
  const rows: { label: string; from: string; cents: number; bar: string; sign: string }[] = [
    { label: `${taxName} you charged on sales`, from: "Added to your invoices. Held in Output VAT / GST Payable.", cents: collected, bar: "bg-sky-500", sign: "" },
    { label: `${taxName} you paid on purchases`, from: "Added to your bills. Held in Input VAT / GST Receivable.", cents: paid, bar: "bg-amber-400", sign: "minus" },
  ];
  return (
    <Frame caption={caption ?? `What you collected for ${authority}, less what you can claim back, is the figure on the return.`}>
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.label} className="grid items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,240px)_1fr_auto]">
            <div>
              <div className="flex items-center gap-2 text-[13.5px] font-medium text-foreground">
                {r.sign && <span className="font-mono text-muted-foreground">-</span>}
                {r.label}
              </div>
              <div className="text-[12px] leading-[1.45] text-muted-foreground">{r.from}</div>
            </div>
            <div className="h-2.5 rounded-full bg-muted">
              <div className={cn("h-full rounded-full", r.bar)} style={{ width: `${(r.cents / max) * 100}%` }} />
            </div>
            <Amount cents={r.cents} className="text-[13.5px] text-foreground sm:text-right" />
          </div>
        ))}
        <div className="grid items-center gap-x-4 gap-y-1.5 border-t border-border pt-4 sm:grid-cols-[minmax(0,240px)_1fr_auto]">
          <div>
            <div className="text-[13.5px] font-semibold text-foreground">{net >= 0 ? `You pay ${authority}` : `${authority.charAt(0).toUpperCase()}${authority.slice(1)} pays you back`}</div>
            <div className="text-[12px] text-muted-foreground">{net >= 0 ? "Charged more than you paid." : "Paid more than you charged: a refund."}</div>
          </div>
          <div className="h-2.5 rounded-full bg-muted">
            <div className={cn("h-full rounded-full", net >= 0 ? "bg-foreground/70" : "bg-emerald-500")} style={{ width: `${(Math.abs(net) / max) * 100}%` }} />
          </div>
          <Amount cents={Math.abs(net)} className="text-[15px] font-semibold text-foreground sm:text-right" />
        </div>
      </div>
    </Frame>
  );
}

type BoxSource = "ledger" | "documents" | "sum" | "contacts" | "fixed";

const SOURCE: Record<BoxSource, { t: Tone; name: string }> = {
  ledger: { t: "info", name: "From your ledger" },
  documents: { t: "plain", name: "From invoices and bills" },
  sum: { t: "good", name: "Worked out" },
  contacts: { t: "watch", name: "Cross-border contacts" },
  fixed: { t: "bad", name: "Always 0 for now" },
};

/** Where each box or line on a return gets its number. */
export function TaxReturnMap({
  rows,
  caption,
}: {
  rows: { box: string; label: string; from: string; source: BoxSource; key?: boolean }[];
  caption?: string;
}) {
  const used = [...new Set(rows.map((r) => r.source))];
  return (
    <Frame caption={caption} className="p-0 md:p-0">
      <div className="divide-y divide-border/70">
        {rows.map((r) => (
          <div key={r.box} className={cn("grid items-center gap-x-4 gap-y-1 px-5 py-2.5 sm:grid-cols-[44px_minmax(0,1fr)_minmax(0,1.1fr)]", r.key && "bg-muted/50")}>
            <span
              className={cn(
                "flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 font-mono text-[11.5px] font-semibold",
                r.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
              )}
            >
              {r.box}
            </span>
            <span className={cn("text-[13.5px] text-foreground", r.key && "font-semibold")}>{r.label}</span>
            <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <span className={cn("size-2 shrink-0 rounded-full", DOT[r.source])} />
              {r.from}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border bg-muted/30 px-5 py-3">
        {used.map((s) => (
          <Pill key={s} t={SOURCE[s].t}>
            {SOURCE[s].name}
          </Pill>
        ))}
      </div>
    </Frame>
  );
}

const DOT: Record<BoxSource, string> = {
  ledger: "bg-sky-500",
  documents: "bg-muted-foreground/50",
  sum: "bg-emerald-500",
  contacts: "bg-amber-400",
  fixed: "bg-rose-500",
};

const TREATMENTS: { name: string; back: number; cost: number; note: string; reverse?: boolean }[] = [
  { name: "Standard (fully reclaimable)", back: 100, cost: 0, note: "All of it comes back on your return." },
  { name: "Partly reclaimable (50%)", back: 50, cost: 50, note: "Half comes back. Half stays part of the cost." },
  { name: "Not reclaimable", back: 0, cost: 100, note: "None comes back. It's part of what the purchase cost you." },
  { name: "Reverse charge", back: 100, cost: 0, reverse: true, note: "The supplier charges none. You record it on both sides yourself, so it nets to zero." },
  { name: "Exempt, or No tax", back: 0, cost: 0, note: "No tax on the line at all." },
];

/** What happens to the tax on a $1,000 bill under each tax treatment. */
export function TaxTreatmentSplit() {
  return (
    <Frame caption="A $1,000 purchase with $200 of tax at 20%. The treatment decides how much of the $200 you claim back.">
      <div className="space-y-3">
        {TREATMENTS.map((t) => (
          <div key={t.name} className="grid items-center gap-x-5 gap-y-1.5 md:grid-cols-[210px_1fr]">
            <div className="text-[13px] font-medium text-foreground">{t.name}</div>
            <div>
              <div className="flex h-6 overflow-hidden rounded-md border border-border bg-background text-[11px] font-medium">
                {t.back > 0 && (
                  <div className="flex items-center justify-center bg-emerald-500/85 text-white" style={{ width: `${t.back}%` }}>
                    {t.reverse ? "$200 out, $200 back" : `$${2 * t.back} back`}
                  </div>
                )}
                {t.cost > 0 && (
                  <div className="flex items-center justify-center bg-amber-400/80 text-amber-950" style={{ width: `${t.cost}%` }}>
                    ${2 * t.cost} into cost
                  </div>
                )}
                {t.back === 0 && t.cost === 0 && <div className="flex flex-1 items-center px-2 text-muted-foreground">No tax</div>}
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">{t.note}</div>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Invoice lines rolled up into the Sales Tax Report, rate by rate. */
export function SalesTaxRollup() {
  const lines = [
    { doc: "INV-0141", what: "Website build", rate: "Texas 8.25%", net: 100000, tax: 8250 },
    { doc: "INV-0142", what: "Hosting, 12 months", rate: "Texas 8.25%", net: 40000, tax: 3300 },
    { doc: "INV-0143", what: "Design work", rate: "Colorado 2.9%", net: 50000, tax: 1450 },
    { doc: "INV-0144", what: "Consulting, out of state", rate: "", net: 60000, tax: 0 },
  ];
  const groups = [
    { rate: "Texas 8.25%", count: 2, net: 140000, tax: 11550 },
    { rate: "Colorado 2.9%", count: 1, net: 50000, tax: 1450 },
    { rate: "No tax rate", count: 1, net: 60000, tax: 0, exempt: true },
  ];
  return (
    <Frame caption="Four invoice lines become one card per rate. The line with no rate counts toward Exempt Sales.">
      <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1.15fr)_auto_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label>Invoice lines in the period</Label>
          {lines.map((l) => (
            <div key={l.doc} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-[12.5px]">
              <div className="min-w-0">
                <div className="truncate text-foreground">{l.what}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {l.doc} · {l.rate || "no rate"}
                </div>
              </div>
              <div className="text-right font-mono tabular-nums">
                <div className="text-foreground">{money(l.net)}</div>
                <div className="text-[11.5px] text-muted-foreground">tax <Amount cents={l.tax} /></div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-center text-muted-foreground max-md:rotate-90">
          <svg width="28" height="16" viewBox="0 0 28 16" aria-hidden className="stroke-border">
            <path d="M1 8h24M19 2l6 6-6 6" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="space-y-1.5">
          <Label>Breakdown by Rate</Label>
          {groups.map((g) => (
            <div key={g.rate} className={cn("rounded-md border px-3 py-2.5 text-[12.5px]", g.exempt ? "border-dashed border-border bg-muted/40" : "border-border bg-card")}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">{g.rate}</span>
                <Amount cents={g.tax} className={cn("font-semibold", g.exempt ? "text-muted-foreground" : "text-sky-700 dark:text-sky-300")} />
              </div>
              <div className="flex items-center justify-between gap-3 text-[11.5px] text-muted-foreground">
                <span>
                  {g.count} invoice{g.count === 1 ? "" : "s"}
                </span>
                <span>on {money(g.net)}</span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-md bg-foreground px-3 py-2 text-[12.5px] text-background">
            <span className="font-medium">Total Tax Collected</span>
            <Amount cents={13000} className="font-semibold" />
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** What each reporting basis picks up, as dubbl works it out. */
export function ReportBasisTimeline() {
  const rows: { what: string; when: string; accrual: [string, Tone]; cash: [string, Tone] }[] = [
    { what: "Invoice", when: "Raised Mar 28, paid Apr 9", accrual: ["Counted Mar 28", "info"], cash: ["Not counted", "watch"] },
    { what: "Cash sale", when: "Mar 30, paid on the spot", accrual: ["Counted Mar 30", "info"], cash: ["Counted Mar 30", "good"] },
    { what: "Bank transaction", when: "Categorized, Mar 31", accrual: ["Counted Mar 31", "info"], cash: ["Counted Mar 31", "good"] },
  ];
  return (
    <Frame caption="When money moves keeps only entries that move money themselves: payments, categorized bank transactions and anything that touches a bank account. Income, costs and tax on an invoice or bill stay on its own date, so they drop out of that view.">
      <div className="grid grid-cols-[minmax(0,1.3fr)_1fr_1fr] gap-px overflow-hidden rounded-lg border border-border bg-border text-[13px]">
        <div className="bg-muted/50 px-3 py-2" />
        {["When invoiced or billed", "When money moves"].map((m) => (
          <div key={m} className="bg-muted/50 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {m}
          </div>
        ))}
        {rows.map((r) => (
          <div key={r.what} className="contents">
            <div className="bg-background px-3 py-3">
              <div className="font-medium text-foreground">{r.what}</div>
              <div className="text-[12px] text-muted-foreground">{r.when}</div>
            </div>
            <div className="flex items-center bg-background px-3 py-3">
              <Pill t={r.accrual[1]}>{r.accrual[0]}</Pill>
            </div>
            <div className="flex items-center bg-background px-3 py-3">
              <Pill t={r.cash[1]}>{r.cash[0]}</Pill>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** US 1099: who crosses the reporting threshold, with card payments left out. */
export function Form1099Threshold() {
  const threshold = 60000;
  const vendors = [
    { name: "Freelancer Jane", counted: 480000, card: 0 },
    { name: "Studio Nine Design", counted: 125000, card: 40000 },
    { name: "Ortiz Photography", counted: 60000, card: 30000 },
    { name: "Copy by Kim", counted: 45000, card: 0 },
  ];
  const max = 500000;
  const W = 640;
  const left = 150;
  const right = 92;
  const rowH = 34;
  const top = 26;
  const H = top + vendors.length * rowH + 12;
  const x = (c: number) => left + (c / max) * (W - left - right);
  return (
    <Frame caption="Only payments you made that weren't by card count. Anyone at or over $600 in the year needs a 1099.">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[460px]" role="img" aria-label="Payments per contractor against the $600 threshold">
        <line x1={x(threshold)} x2={x(threshold)} y1={14} y2={H - 6} strokeDasharray="4 4" strokeWidth="1.5" className="stroke-foreground/50" />
        <text x={x(threshold) + 6} y={16} className="fill-foreground text-[11px] font-medium">$600 threshold</text>
        {vendors.map((v, i) => {
          const y = top + i * rowH;
          const needs = v.counted >= threshold;
          return (
            <g key={v.name}>
              <text x={0} y={y + 15} className="fill-foreground text-[12px]">{v.name}</text>
              <rect x={left} y={y + 4} width={x(v.counted) - left} height={16} rx={3} className={needs ? "fill-emerald-500" : "fill-muted-foreground/35"} />
              {v.card > 0 && (
                <rect x={x(v.counted)} y={y + 4} width={x(v.counted + v.card) - x(v.counted)} height={16} rx={3} strokeDasharray="3 3" className="fill-none stroke-muted-foreground/60" />
              )}
              <text x={W - right + 10} y={y + 16} className={cn("text-[11.5px] font-medium", needs ? "fill-emerald-700 dark:fill-emerald-300" : "fill-muted-foreground")}>
                {needs ? "Needs a 1099" : "Below"}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-5 rounded-sm bg-emerald-500" />Counted, at or over $600</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-5 rounded-sm bg-muted-foreground/35" />Counted, under $600</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-5 rounded-sm border border-dashed border-muted-foreground/60" />Paid by card, left out</span>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------- reports */

const QUESTIONS: { q: string; report: string; href: string }[] = [
  { q: "Am I making money?", report: "Profit and loss", href: "/docs/guides/profit-and-loss" },
  { q: "What do I own and owe today?", report: "Balance sheet", href: "/docs/guides/balance-sheet" },
  { q: "Why is the bank lower than my profit?", report: "Cash flow", href: "/docs/guides/cash-flow" },
  { q: "Who owes me, and how late are they?", report: "Aged receivables", href: "/docs/guides/aged-receivables-and-payables" },
  { q: "Which bills are coming due?", report: "Aged payables", href: "/docs/guides/aged-receivables-and-payables" },
  { q: "What's behind this number?", report: "General ledger", href: "/docs/guides/general-ledger" },
  { q: "What goes on my tax return?", report: "VAT return, sales tax, BAS", href: "/docs/guides/vat-return" },
  { q: "How are all my companies doing together?", report: "Consolidation", href: "/docs/guides/consolidation" },
];

/** The question you have, and the report that answers it. */
export function ReportQuestionMap() {
  return (
    <Frame caption="Start from the question. Every report in dubbl answers one.">
      <div className="grid gap-2 sm:grid-cols-2">
        {QUESTIONS.map((r) => (
          <a key={r.q} href={r.href} className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3 no-underline transition-colors hover:bg-muted/60">
            <span className="text-[13.5px] text-foreground">{r.q}</span>
            <span className="shrink-0 text-[12px] font-medium text-muted-foreground group-hover:text-foreground">{r.report} &rarr;</span>
          </a>
        ))}
      </div>
    </Frame>
  );
}

interface WaterfallStep {
  label: string;
  cents: number;
  kind: "start" | "up" | "down" | "total";
}

function Waterfall({ steps, label }: { steps: WaterfallStep[]; label: string }) {
  const W = 680;
  const H = 280;
  const pad = { l: 8, r: 8, t: 30, b: 50 };
  const n = steps.length;
  const slot = (W - pad.l - pad.r) / n;
  const barW = Math.min(64, slot * 0.6);
  // Each bar starts where the running total stands; start and total bars rise from zero.
  const bars: (WaterfallStep & { from: number; to: number })[] = [];
  let run = 0;
  for (const s of steps) {
    const from = s.kind === "start" || s.kind === "total" ? 0 : run;
    const to = s.kind === "start" ? s.cents : s.kind === "total" ? run : run + (s.kind === "down" ? -Math.abs(s.cents) : Math.abs(s.cents));
    run = to;
    bars.push({ ...s, from, to });
  }
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const hi = Math.max(...bars.map((b) => Math.max(b.from, b.to)));
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const cls = (k: WaterfallStep["kind"]) =>
    k === "up" ? "fill-emerald-500" : k === "down" ? "fill-rose-400 dark:fill-rose-500" : "fill-foreground/75";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]" role="img" aria-label={label}>
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="stroke-border" />
      {bars.map((b, i) => {
        const cx = pad.l + slot * i + slot / 2;
        const top = y(Math.max(b.from, b.to));
        const h = Math.max(2, Math.abs(y(b.from) - y(b.to)));
        const next = bars[i + 1];
        const words = b.label.split(" ");
        const mid = Math.ceil(words.length / 2);
        const lines = b.label.length > 14 ? [words.slice(0, mid).join(" "), words.slice(mid).join(" ")] : [b.label];
        const shown = b.kind === "down" ? -Math.abs(b.cents) : b.kind === "total" ? b.to : b.cents;
        return (
          <g key={i}>
            <rect x={cx - barW / 2} y={top} width={barW} height={h} rx={3} className={cls(b.kind)} />
            {next && (
              <line x1={cx + barW / 2} x2={cx + slot - barW / 2} y1={y(b.to)} y2={y(b.to)} strokeDasharray="3 3" className="stroke-muted-foreground/50" />
            )}
            <text x={cx} y={top - 8} textAnchor="middle" className="fill-foreground font-mono text-[11.5px]">
              {b.kind === "up" ? "+" : ""}
              {money(shown)}
            </text>
            {lines.map((l, j) => (
              <text key={j} x={cx} y={H - pad.b + 20 + j * 14} textAnchor="middle" className={cn("text-[11.5px]", b.kind === "total" || b.kind === "start" ? "fill-foreground font-medium" : "fill-muted-foreground")}>
                {l}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** Profit and loss as a waterfall: money in, each cost stepping down, profit left at the end. */
export function ProfitWaterfall() {
  return (
    <Frame caption="Read a profit and loss top to bottom: start with everything you earned, take away each cost, and what's left is profit.">
      <Waterfall
        label="Waterfall from money in of $48,000 down to a profit of $11,000"
        steps={[
          { label: "Money in", cents: 4800000, kind: "start" },
          { label: "Wages", cents: 2400000, kind: "down" },
          { label: "Rent", cents: 700000, kind: "down" },
          { label: "Software", cents: 260000, kind: "down" },
          { label: "Everything else", cents: 340000, kind: "down" },
          { label: "Profit", cents: 0, kind: "total" },
        ]}
      />
    </Frame>
  );
}

/** Cash flow as a bridge from opening to closing cash. */
export function CashFlowBridge() {
  return (
    <Frame caption="The three sections explain the change: what you started with, plus or minus each kind of activity, is what you end with.">
      <Waterfall
        label="Bridge from opening cash of $25,000 to closing cash of $37,400"
        steps={[
          { label: "Cash at the start", cents: 2500000, kind: "start" },
          { label: "Day-to-day trading", cents: 840000, kind: "up" },
          { label: "Buying and selling things", cents: 600000, kind: "down" },
          { label: "Funding", cents: 1000000, kind: "up" },
          { label: "Cash at the end", cents: 0, kind: "total" },
        ]}
      />
    </Frame>
  );
}

/** Profit and cash are different numbers: why a profitable month can still drain the bank. */
export function ProfitVsCash() {
  const rows: { what: string; profit: string; cash: string }[] = [
    { what: "You invoice a customer $5,000", profit: "+$5,000 now", cash: "Nothing until they pay" },
    { what: "You buy a $3,000 laptop", profit: "A little each year, as it wears out", cash: "-$3,000 today" },
    { what: "You take a $10,000 loan", profit: "Nothing (it's not income)", cash: "+$10,000 today" },
    { what: "You pay last month's bill", profit: "Nothing (counted last month)", cash: "-$1,200 today" },
  ];
  return (
    <Frame caption="Profit counts what you earned and used up. Cash counts what actually moved.">
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[1.3fr_1fr_1fr] bg-muted/50 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          <div className="px-3 py-2">What happens</div>
          <div className="px-3 py-2">Profit and loss</div>
          <div className="px-3 py-2">Cash flow</div>
        </div>
        {rows.map((r) => (
          <div key={r.what} className="grid grid-cols-[1.3fr_1fr_1fr] border-t border-border/70 text-[13px]">
            <div className="px-3 py-2.5 text-foreground">{r.what}</div>
            <div className="px-3 py-2.5 text-muted-foreground">{r.profit}</div>
            <div className="px-3 py-2.5 text-muted-foreground">{r.cash}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Assets on one side, liabilities and equity on the other, always the same height. */
export function BalanceSheetEquation() {
  const own = [
    { name: "Bank accounts", cents: 3500000 },
    { name: "Owed to you", cents: 3000000 },
    { name: "Equipment", cents: 1500000 },
  ];
  const owe = [
    { name: "Bills to pay", cents: 1200000 },
    { name: "Loan", cents: 1000000 },
  ];
  const left = [
    { name: "Owner's money in", cents: 4000000 },
    { name: "Current Year Earnings", cents: 1800000 },
  ];
  const total = own.reduce((s, r) => s + r.cents, 0);
  const H = 260;
  const block = (rows: { name: string; cents: number }[], cls: string) =>
    rows.map((r) => (
      <div key={r.name} className={cn("flex items-center justify-between gap-2 border-t border-background/60 px-3 text-[12px] first:border-t-0", cls)} style={{ height: (r.cents / total) * H }}>
        <span className="truncate">{r.name}</span>
        <span className="font-mono tabular-nums">{money(r.cents)}</span>
      </div>
    ));
  return (
    <Frame caption="What you own always equals what you owe plus what's left over for you. Current Year Earnings is this year's profit, not yet closed into retained earnings.">
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <div>
          <Label className="mb-2">What you own</Label>
          <div className="overflow-hidden rounded-lg">{block(own, "bg-sky-500/15 text-sky-900 dark:text-sky-200")}</div>
          <div className="mt-2 flex justify-between text-[13px] font-medium text-foreground"><span>Total</span><span className="font-mono">{money(total)}</span></div>
        </div>
        <div className="pb-[140px] text-center font-mono text-[22px] text-muted-foreground max-sm:hidden">=</div>
        <div>
          <Label className="mb-2">What you owe, and what’s yours</Label>
          <div className="overflow-hidden rounded-lg">
            {block(owe, "bg-amber-400/20 text-amber-900 dark:text-amber-200")}
            {block(left, "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200")}
          </div>
          <div className="mt-2 flex justify-between text-[13px] font-medium text-foreground"><span>Total</span><span className="font-mono">{money(total)}</span></div>
        </div>
      </div>
    </Frame>
  );
}

const BUCKETS: { label: string; cents: number; cls: string; t: Tone }[] = [
  { label: "Current", cents: 1240000, cls: "bg-emerald-500", t: "good" },
  { label: "1-30 days", cents: 680000, cls: "bg-sky-500", t: "info" },
  { label: "31-60 days", cents: 310000, cls: "bg-amber-300", t: "watch" },
  { label: "61-90 days", cents: 145000, cls: "bg-amber-500", t: "watch" },
  { label: "90+ days", cents: 225000, cls: "bg-rose-500", t: "bad" },
];

/** Unpaid invoices sorted into buckets by how far past their due date they are. */
export function AgingBuckets({ who = "customers owe you" }: { who?: string }) {
  const total = BUCKETS.reduce((s, b) => s + b.cents, 0);
  return (
    <Frame caption={`Everything ${who}, split by days past the due date. The further right, the harder it usually is to collect.`}>
      <div className="flex h-9 overflow-hidden rounded-lg">
        {BUCKETS.map((b) => (
          <div key={b.label} className={cn("h-full border-r-2 border-card last:border-r-0", b.cls)} style={{ width: `${(b.cents / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {BUCKETS.map((b) => (
          <div key={b.label} className="rounded-lg border border-border bg-background px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className={cn("size-2.5 rounded-sm", b.cls)} />
              <span className="text-[12px] font-medium text-foreground">{b.label}</span>
            </div>
            <Amount cents={b.cents} className="mt-1 block text-[13.5px] text-foreground" />
            <div className="text-[11.5px] text-muted-foreground">{Math.round((b.cents / total) * 100)}% of the total</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** From a figure on a report down to the document that caused it. */
export function LedgerDrilldown() {
  return (
    <Frame caption="Every number on a report is a sum of ledger lines, and every line comes from something you did.">
      <div className="flex items-stretch gap-2 max-md:flex-col">
        <Box title="A report line" className="flex-1">Accounts Receivable on the balance sheet: $30,470.84</Box>
        <Arrow label="click it" />
        <Box title="The account in the ledger" className="flex-1" active>Each entry that touched it, with a running balance</Box>
        <Arrow label="entry #" />
        <Box title="The journal entry" className="flex-1">Its debit and credit lines, balanced</Box>
        <Arrow />
        <Box title="What caused it" className="flex-1">An invoice, a bill, a bank payment or a manual journal</Box>
      </div>
    </Frame>
  );
}

/** Build, run, save and schedule a custom report. */
export function CustomReportPipeline() {
  return (
    <Frame caption="Build a report once, save it, and it can be run again or emailed on a schedule.">
      <div className="flex items-stretch gap-2 max-md:flex-col">
        <Box title="Pick the data" className="flex-1">Invoices, contacts, inventory or bank transactions</Box>
        <Arrow />
        <Box title="Pick the columns" className="flex-1">Click a column to add or remove it</Box>
        <Arrow />
        <Box title="Run" className="flex-1">See the first 50 rows</Box>
        <Arrow />
        <Box title="Save" className="flex-1" active>Run it again or export a CSV</Box>
        <Arrow />
        <Box title="Schedule" className="flex-1">Email it every day, week, month or quarter</Box>
      </div>
    </Frame>
  );
}

/* --------------------------------------------------------- consolidation */

const CONSOL: { row: string; a: number; b: number; elim: number }[] = [
  { row: "Sales", a: 12000000, b: 8000000, elim: -1500000 },
  { row: "Costs", a: 9000000, b: 6000000, elim: -1500000 },
  { row: "Owed to you", a: 3000000, b: 2000000, elim: -500000 },
  { row: "You owe", a: 1800000, b: 1200000, elim: -500000 },
];

/** Two companies added together, with what they did with each other taken out. */
export function ConsolidationRollup() {
  const cols: { head: ReactNode; get: (r: (typeof CONSOL)[number]) => number; cls?: string }[] = [
    { head: <><span className="block text-foreground">Northwind US</span><span>in USD</span></>, get: (r) => r.a },
    { head: <><span className="block text-foreground">Northwind UK</span><span>converted to USD</span></>, get: (r) => r.b },
    { head: <><span className="block text-rose-700 dark:text-rose-300">Between them</span><span>taken out</span></>, get: (r) => r.elim, cls: "text-rose-700 dark:text-rose-300" },
    { head: <><span className="block text-foreground">Combined</span><span>the group</span></>, get: (r) => r.a + r.b + r.elim, cls: "font-semibold text-foreground" },
  ];
  return (
    <Frame caption="The UK company sold $15,000 of services to the US one and $5,000 of it is still unpaid. Counted twice it would inflate the group, so it comes out of both sides.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              <th className="py-2 pr-4 font-medium" />
              {cols.map((c, i) => (
                <th key={i} className={cn("px-3 py-2 text-right font-medium", i === 3 && "bg-muted/60")}>{c.head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONSOL.map((r) => (
              <tr key={r.row} className="border-t border-border/70">
                <td className="py-2.5 pr-4 font-medium text-foreground">{r.row}</td>
                {cols.map((c, i) => (
                  <td key={i} className={cn("px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground", c.cls, i === 3 && "bg-muted/60")}>
                    {money(c.get(r))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

/** How a combined report is built, step by step. */
export function ConsolidationSteps() {
  return (
    <Frame caption="dubbl builds the combined figures each time you open the report. Nothing is posted to either company's books.">
      <div className="flex items-stretch gap-2 max-md:flex-col">
        <Box title="Each company's books" className="flex-1">Posted balances, in that company’s own currency</Box>
        <Arrow label="convert" />
        <Box title="One currency" className="flex-1">Assets and debts at the closing rate, income and costs at the average rate</Box>
        <Arrow label="add up" />
        <Box title="Side by side" className="flex-1">Every account, per business and in total</Box>
        <Arrow label="take out" />
        <Box title="Combined" className="flex-1" active>Sales and balances between the businesses removed</Box>
      </div>
    </Frame>
  );
}
