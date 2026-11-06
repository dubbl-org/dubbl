// Diagrams for the accounting guides, built from the primitives in ./frame.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Amount, Arrow, Box, Frame, Label, Pill, fill, type Tone } from "./frame";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const short = (cents: number) => {
  const d = cents / 100;
  return d >= 1000 ? `$${(d / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k` : `$${Math.round(d)}`;
};

function AcctLegend({ items }: { items: { swatch: string; label: ReactNode; line?: boolean }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-muted-foreground">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {it.line ? <span className={cn("w-4 border-t-2", it.swatch)} /> : <span className={cn("size-2.5 rounded-sm", it.swatch)} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ================================================== chart of accounts */

const ACCOUNT_TYPES: { name: string; range: string; side: "debit" | "credit"; what: string; examples: [string, string][] }[] = [
  { name: "Assets", range: "1000s", side: "debit", what: "What the business owns or is owed", examples: [["1100", "Checking Account"], ["1200", "Accounts Receivable"], ["1620", "Computer Equipment"]] },
  { name: "Liabilities", range: "2000s", side: "credit", what: "What the business owes", examples: [["2000", "Accounts Payable"], ["2230", "Sales Tax Payable"], ["2700", "Long-Term Debt"]] },
  { name: "Equity", range: "3000s", side: "credit", what: "What's left for the owners", examples: [["3000", "Owner's Equity"], ["3100", "Retained Earnings"], ["3200", "Owner's Drawings"]] },
  { name: "Revenue", range: "4000s", side: "credit", what: "Money earned", examples: [["4000", "Sales Revenue"], ["4010", "Service Revenue"], ["4100", "Interest Income"]] },
  { name: "Expenses", range: "5000s", side: "debit", what: "Money spent to earn it", examples: [["5100", "Wages & Salaries"], ["5200", "Rent Expense"], ["5500", "Depreciation Expense"]] },
];

/** The five account types, grouped by the report they land on, with the side that makes each grow. */
export function AccountTypeTree() {
  const group = (title: string, note: string, types: typeof ACCOUNT_TYPES, extra?: ReactNode) => (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <Label>{title}</Label>
        <span className="text-[11.5px] text-muted-foreground">{note}</span>
      </div>
      <div className={cn("mt-3 grid gap-2.5", "sm:grid-cols-3")}>
        {types.map((t) => (
          <div key={t.name} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-medium text-foreground">{t.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{t.range}</span>
            </div>
            <div className="mt-0.5 text-[12px] leading-[1.45] text-muted-foreground">{t.what}</div>
            <div className="mt-2">
              <Pill t={t.side === "debit" ? "info" : "good"}>Grows with a {t.side}</Pill>
            </div>
            <ul className="mt-2.5 space-y-1 border-t border-border/70 pt-2.5">
              {t.examples.map(([code, name]) => (
                <li key={code} className="flex gap-2 text-[12px]">
                  <span className="font-mono text-muted-foreground">{code}</span>
                  <span className="truncate text-foreground">{name}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {extra}
      </div>
    </div>
  );
  return (
    <Frame caption="Codes from the demo company's chart. Yours may number them differently, but every account is one of these five types.">
      <div className="mx-auto mb-3 w-fit rounded-lg border border-foreground/60 bg-background px-4 py-2 text-[13.5px] font-medium text-foreground">Chart of accounts</div>
      <div className="flex flex-col gap-3">
        {group("Balance sheet", "what you have, on a date", ACCOUNT_TYPES.slice(0, 3))}
        {group(
          "Profit and loss",
          "how you did, over a period",
          ACCOUNT_TYPES.slice(3),
          <div className="flex items-center rounded-lg border border-dashed border-border px-3 py-3 text-[12px] leading-[1.5] text-muted-foreground">
            Revenue minus expenses is your profit. When you close a year, it moves into 3100 Retained Earnings and these accounts start again from zero.
          </div>,
        )}
      </div>
    </Frame>
  );
}

/* ================================================== journal entries */

/** An accrual booked at month end that undoes itself on the first of the next month. */
export function AutoReversalPair() {
  const card = (date: string, title: string, lines: [string, number, number][], t: Tone, tag: string) => (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="font-mono text-[11.5px] text-muted-foreground">{date}</span>
        <Pill t={t}>{tag}</Pill>
      </div>
      <div className="px-3 pt-2 text-[13px] font-medium text-foreground">{title}</div>
      <div className="mt-1.5 space-y-0.5">
        {lines.map(([acct, dr, cr]) => (
          <div key={acct} className="flex items-center gap-2 px-3 py-1 text-[12px]">
            <span className="w-5 shrink-0 font-mono text-[10.5px] text-muted-foreground">{dr ? "Dr" : "Cr"}</span>
            <span className="min-w-0 flex-1 truncate text-foreground">{acct}</span>
            <span className="shrink-0 font-mono tabular-nums text-foreground">{`$${((dr || cr) / 100).toLocaleString("en-US")}`}</span>
          </div>
        ))}
      </div>
      <div className="h-2" />
    </div>
  );
  return (
    <Frame caption="December carries the cost, January doesn't count it twice. The reversal is a real posted entry you can open, dated the day you chose.">
      <div className="flex items-center gap-2 max-md:flex-col max-md:items-stretch">
        {card("Dec 31, 2026", "Accountant's fee, not billed yet", [["Accounting Fees", 120000, 0], ["Accrued Expenses", 0, 120000]], "plain", "You post it")}
        <Arrow label="undoes itself" />
        {card("Jan 1, 2027", "Reversal", [["Accrued Expenses", 120000, 0], ["Accounting Fees", 0, 120000]], "info", "dubbl posts it")}
        <Arrow label="then" />
        {card("Jan 12, 2027", "The bill arrives", [["Accounting Fees", 120000, 0], ["Accounts Payable", 0, 120000]], "plain", "From the bill")}
      </div>
      <div className="mt-4 grid gap-2 text-[12.5px] sm:grid-cols-2">
        <div className="rounded-md bg-muted/50 px-3 py-2"><span className="text-muted-foreground">December&apos;s accounting fees: </span><Amount cents={120000} className="text-foreground" /></div>
        <div className="rounded-md bg-muted/50 px-3 py-2"><span className="text-muted-foreground">January&apos;s accounting fees: </span><Amount cents={0} className="text-foreground" /> <span className="text-muted-foreground">(-1,200 + 1,200)</span></div>
      </div>
    </Frame>
  );
}

/* ================================================== recurring journals */

/** A monthly template: what posts on each date, a locked month that's skipped, and today. */
export function RecurringJournalTimeline() {
  const months: { m: string; state: "posted" | "skipped" | "due" | "next" | "later" }[] = [
    { m: "Jan", state: "posted" },
    { m: "Feb", state: "posted" },
    { m: "Mar", state: "skipped" },
    { m: "Apr", state: "posted" },
    { m: "May", state: "posted" },
    { m: "Jun", state: "due" },
    { m: "Jul", state: "next" },
    { m: "Aug", state: "later" },
  ];
  const look = {
    posted: { dot: "bg-foreground border-foreground", text: "Posted" },
    skipped: { dot: "bg-amber-400 border-amber-400", text: "Locked, skipped" },
    due: { dot: "bg-sky-500 border-sky-500", text: "Due today" },
    next: { dot: "bg-background border-foreground/50", text: "Next entry" },
    later: { dot: "bg-background border-border", text: "" },
  } as const;
  return (
    <Frame caption="Monthly office rent starting Jan 1. Each date posts one entry. A date inside a locked period is skipped, and the schedule moves on to the next one.">
      <div className="relative min-w-[520px]">
        <div className="absolute left-[6%] right-[6%] top-[27px] border-t border-dashed border-border" />
        <div className="grid grid-cols-8">
          {months.map(({ m, state }) => (
            <div key={m} className="flex flex-col items-center gap-1.5">
              <span className="text-[11.5px] text-muted-foreground">{m} 1</span>
              <span className={cn("relative z-10 size-3.5 rounded-full border-2", look[state].dot)} />
              <span className={cn("text-center font-mono text-[11px]", state === "posted" || state === "due" ? "text-foreground" : "text-muted-foreground/70")}>
                {state === "skipped" ? "-" : "$3,500"}
              </span>
              <span className={cn("text-center text-[11px] leading-tight", state === "skipped" ? "text-amber-600 dark:text-amber-400" : state === "due" ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground")}>
                {look[state].text}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-md bg-muted/50 px-3 py-2 text-[12.5px] text-muted-foreground">
        Every entry it posts: <span className="text-foreground">5200 Rent Expense</span> debit <Amount cents={350000} className="text-foreground" />, <span className="text-foreground">1100 Checking Account</span> credit <Amount cents={350000} className="text-foreground" />.
      </div>
    </Frame>
  );
}

/* ================================================== accruals */

/** A $1,200 premium spread over 12 months: prepaid balance going down, expense going up. */
export function AccrualSpread() {
  const total = 120000, n = 12, recorded = 4;
  const W = 620, H = 220, pad = { l: 44, r: 12, t: 14, b: 40 };
  const bw = (W - pad.l - pad.r) / n;
  const y = (v: number) => pad.t + (1 - v / total) * (H - pad.t - pad.b);
  const months = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  return (
    <Frame caption="Annual insurance of $1,200 paid up front, spread over 12 months. Four months are recorded; each one moves $100 from Prepaid Expenses to Insurance.">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[440px]" role="img" aria-label="Twelve monthly bars: the prepaid balance falls by $100 each month while the insurance expense rises by $100">
        {[0, 60000, 120000].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray={v ? "3 4" : undefined} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{short(v)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const spent = (i + 1) * (total / n);
          const left = total - spent;
          const done = i < recorded;
          const x = pad.l + i * bw + 5;
          const w = bw - 10;
          return (
            <g key={m} opacity={done ? 1 : 0.35}>
              <rect x={x} y={y(total)} width={w} height={y(left) - y(total)} rx={2} className="fill-amber-400" />
              <rect x={x} y={y(left)} width={w} height={y(0) - y(left)} rx={2} className="fill-sky-500" />
              <text x={x + w / 2} y={H - 22} textAnchor="middle" className="fill-muted-foreground text-[10.5px]">{m}</text>
              <text x={x + w / 2} y={H - 8} textAnchor="middle" className={cn("font-mono text-[9.5px]", done ? "fill-foreground" : "fill-muted-foreground")}>{done ? "done" : i === recorded ? "next" : ""}</text>
            </g>
          );
        })}
      </svg>
      <AcctLegend
        items={[
          { swatch: "bg-sky-500", label: "Still in 1400 Prepaid Expenses" },
          { swatch: "bg-amber-400", label: "Moved to 5400 Insurance so far" },
          { swatch: "bg-muted-foreground/30", label: "Faded: months not recorded yet" },
        ]}
      />
    </Frame>
  );
}

/* ================================================== fixed assets */

function depreciationSchedule(method: "straight_line" | "declining_balance", cost: number, residual: number, months: number) {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < months; i++) {
    const remaining = cost - residual - acc;
    let dep = 0;
    if (remaining <= 0) dep = 0;
    else if (i === months - 1) dep = remaining;
    else if (method === "declining_balance") {
      const bv = cost - acc;
      dep = bv <= residual ? 0 : Math.min(Math.round((bv * (2 / (months / 12))) / 12), bv - residual);
    } else dep = Math.min(Math.round((cost - residual) / months), remaining);
    out.push(dep);
    acc += dep;
  }
  return out;
}

/** Monthly depreciation for a $36,000 van over 36 months: even charges vs front-loaded ones. */
export function DepreciationScheduleChart() {
  const cost = 3600000, residual = 600000, n = 36;
  const sl = depreciationSchedule("straight_line", cost, residual, n);
  const db = depreciationSchedule("declining_balance", cost, residual, n);
  const max = 200000;
  const W = 640, H = 240, pad = { l: 48, r: 12, t: 14, b: 30 };
  const bw = (W - pad.l - pad.r) / n;
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const stop = db.findIndex((v, i) => i > 0 && v < db[i - 1] * 0.8);
  return (
    <Frame caption="Both methods write off the same $30,000 in total (cost less the $6,000 leftover value). Declining balance takes double the even rate on what's left, so it charges more early and reaches the leftover value before the end.">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[460px]" role="img" aria-label="Declining balance charges start at $2,000 a month and fall; straight line stays at $833.33 every month">
        {[0, 50000, 100000, 150000, 200000].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray={v ? "3 4" : undefined} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{short(v)}</text>
          </g>
        ))}
        {db.map((v, i) => (
          <rect key={i} x={pad.l + i * bw + 2} y={y(v)} width={bw - 4} height={Math.max(0, y(0) - y(v))} rx={1.5} className="fill-sky-500/80" />
        ))}
        <polyline points={sl.map((v, i) => `${pad.l + i * bw + bw / 2},${y(v)}`).join(" ")} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-foreground" />
        <text x={pad.l + 20.5 * bw} y={y(sl[0]) - 8} textAnchor="middle" className="fill-foreground text-[11px]">Straight line: {money(sl[0])} a month</text>
        <text x={pad.l + 1.5 * bw + 6} y={y(db[0]) + 2} className="fill-sky-700 text-[11px] dark:fill-sky-300">Declining balance: {money(db[0])} in month 1</text>
        {stop > 0 && (
          <g>
            <line x1={pad.l + stop * bw} x2={pad.l + stop * bw} y1={pad.t + 40} y2={y(0)} strokeDasharray="4 4" className="stroke-foreground/40" />
            <text x={pad.l + stop * bw - 6} y={pad.t + 52} textAnchor="end" className="fill-muted-foreground text-[10.5px]">Leftover value reached</text>
          </g>
        )}
        {[1, 12, 24, 36].map((m) => (
          <text key={m} x={m === 36 ? W - pad.r : m === 1 ? pad.l : pad.l + (m - 0.5) * bw} y={H - 10} textAnchor={m === 36 ? "end" : m === 1 ? "start" : "middle"} className="fill-muted-foreground text-[10.5px]">{`Month ${m}`}</text>
        ))}
      </svg>
      <AcctLegend
        items={[
          { swatch: "border-foreground", line: true, label: "The same amount each month (straight line)" },
          { swatch: "bg-sky-500/80", label: "A yearly share of what's left (declining balance)" },
        ]}
      />
    </Frame>
  );
}

/** From purchase to disposal: what each step records. */
export function FixedAssetLifeFlow() {
  const steps: { title: string; detail: string; t: Tone; tag: string }[] = [
    { title: "Add the asset", detail: "Cost, life, leftover value and its three accounts. Nothing is posted.", t: "plain", tag: "Record only" },
    { title: "Value drops monthly", detail: "Depreciation Expense up, Accumulated Depreciation up.", t: "info", tag: "Each month" },
    { title: "Revalue or write down", detail: "Optional. Moves the value up or down when it's really worth something else.", t: "watch", tag: "When needed" },
    { title: "Sold or written off", detail: "Removes cost and depreciation, books any money received and the gain or loss.", t: "good", tag: "Once" },
  ];
  return (
    <Frame caption="The purchase itself is recorded by the bill or bank payment that paid for it. The asset record tracks the value from then on.">
      <div className="flex items-stretch gap-1 max-md:flex-col">
        {steps.map((s, i) => (
          <div key={s.title} className="flex flex-1 items-stretch gap-1 max-md:flex-col">
            <Box title={s.title} className="min-w-0 flex-1">
              <div className="mb-1.5"><Pill t={s.t}>{s.tag}</Pill></div>
              {s.detail}
            </Box>
            {i < steps.length - 1 && <Arrow />}
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ================================================== loans */

function amortize(principal: number, bp: number, term: number) {
  const r = bp / 10000 / 12;
  const pmt = r === 0 ? Math.round(principal / term) : Math.round((principal * (r * Math.pow(1 + r, term))) / (Math.pow(1 + r, term) - 1));
  const rows: { p: number; i: number; bal: number }[] = [];
  let bal = principal;
  for (let k = 1; k <= term; k++) {
    const i = Math.round(bal * r);
    const p = k === term ? bal : pmt - i;
    bal -= p;
    rows.push({ p, i, bal: Math.max(0, bal) });
  }
  return { pmt, rows };
}

/** A $30,000 loan at 6% over 36 months: each payment's split between principal and interest. */
export function LoanAmortizationSplit() {
  const principal = 3000000;
  const { pmt, rows } = amortize(principal, 600, 36);
  const totalInterest = rows.reduce((s, r) => s + r.i, 0);
  const max = 100000;
  const W = 640, H = 230, pad = { l: 44, r: 12, t: 14, b: 30 };
  const bw = (W - pad.l - pad.r) / rows.length;
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  return (
    <Frame caption={`Every payment is the same ${money(pmt)}. Early on more of it is interest; by the end almost all of it pays down the loan. Total interest over the three years: ${money(totalInterest)}.`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[460px]" role="img" aria-label="Stacked bars for 36 payments: the interest part shrinks and the principal part grows">
        {[0, 25000, 50000, 75000, 100000].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray={v ? "3 4" : undefined} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{v ? `$${v / 100}` : "$0"}</text>
          </g>
        ))}
        {rows.map((r, k) => {
          const x = pad.l + k * bw + 2;
          return (
            <g key={k}>
              <rect x={x} y={y(r.p)} width={bw - 4} height={y(0) - y(r.p)} className="fill-foreground/80" />
              <rect x={x} y={y(r.p + r.i)} width={bw - 4} height={y(r.p) - y(r.p + r.i)} className="fill-amber-400" />
            </g>
          );
        })}
        {[1, 12, 24, 36].map((m) => (
          <text key={m} x={m === 36 ? W - pad.r : m === 1 ? pad.l : pad.l + (m - 0.5) * bw} y={H - 10} textAnchor={m === 36 ? "end" : m === 1 ? "start" : "middle"} className="fill-muted-foreground text-[10.5px]">{`Payment ${m}`}</text>
        ))}
      </svg>
      <AcctLegend
        items={[
          { swatch: "bg-foreground/80", label: `Off the loan (first payment ${money(rows[0].p)})` },
          { swatch: "bg-amber-400", label: `Interest (first payment ${money(rows[0].i)})` },
        ]}
      />
    </Frame>
  );
}

/* ================================================== budgets */

/** Budget against actual for a month, coloured the way the budgets page colours them. */
export function BudgetVsActualBars() {
  const lines: { code: string; name: string; budget: number; actual: number }[] = [
    { code: "5200", name: "Rent Expense", budget: 350000, actual: 350000 },
    { code: "5600", name: "Marketing & Advertising", budget: 50000, actual: 65000 },
    { code: "5230", name: "Software & Subscriptions", budget: 40000, actual: 18000 },
    { code: "5220", name: "Internet & Phone", budget: 10000, actual: 8500 },
  ];
  return (
    <Frame caption="Under 80% of the budget the bar stays neutral, past 80% it turns amber, and over budget it turns red and shows how much over.">
      <div className="space-y-3.5">
        {lines.map((l) => {
          const pct = Math.round((l.actual / l.budget) * 100);
          const over = l.actual > l.budget;
          const t: Tone = over ? "bad" : pct > 80 ? "watch" : "plain";
          return (
            <div key={l.code}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]">
                <span className="text-foreground"><span className="mr-2 font-mono text-muted-foreground">{l.code}</span>{l.name}</span>
                <span className="text-muted-foreground">
                  <Amount cents={l.actual} className="text-foreground" /> / <Amount cents={l.budget} />
                  <span className={cn("ml-2", over ? "text-rose-600 dark:text-rose-400" : "")}>
                    {over ? `Over by ${money(l.actual - l.budget)}` : `${money(l.budget - l.actual)} left`}
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", t === "plain" ? "bg-foreground/60" : fill[t])} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

/* ================================================== periods and closing */

/** Financial years on a line: a closed year behind the lock date, the current year, and the next one. */
export function PeriodLockTimeline() {
  const years: { name: string; dates: string; state: string; t: Tone; locked: boolean }[] = [
    { name: "FY 2025", dates: "Jan 1 to Dec 31, 2025", state: "Closed and locked", t: "plain", locked: true },
    { name: "FY 2026", dates: "Jan 1 to Dec 31, 2026", state: "Current", t: "info", locked: false },
    { name: "FY 2027", dates: "Jan 1 to Dec 31, 2027", state: "Open", t: "plain", locked: false },
  ];
  return (
    <Frame caption="The lock date sits at the end of the last closed year here. You can also lock dates on their own, part way through a year, without closing it.">
      <div className="relative min-w-[520px] pt-8">
        <div className="absolute left-[33.33%] top-0 flex -translate-x-1/2 flex-col items-center">
          <span className="whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">Lock date: Dec 31, 2025</span>
        </div>
        <div className="absolute bottom-0 left-[33.33%] top-6 border-l-2 border-foreground" />
        <div className="grid grid-cols-3 gap-0">
          {years.map((yr, i) => (
            <div
              key={yr.name}
              className={cn(
                "border-y border-border px-3 py-3",
                i === 0 && "rounded-l-lg border-l bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_6px,var(--color-background)_6px_12px)]",
                i === 2 && "rounded-r-lg border-r",
                i === 1 && "bg-sky-50/60 dark:bg-sky-500/5",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-medium text-foreground">{yr.name}</span>
                <Pill t={yr.t}>{yr.state}</Pill>
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">{yr.dates}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 text-[12px]">
          <div className="pr-3 text-rose-700 dark:text-rose-300">Nothing dated here can be added or changed.</div>
          <div className="col-span-2 pl-3 text-emerald-700 dark:text-emerald-300">Work as normal: add, edit, post and reverse.</div>
        </div>
      </div>
    </Frame>
  );
}

/* ================================================== opening balances */

/** Moving from another system: balances on one date become one entry, and dubbl takes over from there. */
export function OpeningBalanceCutover() {
  return (
    <Frame caption="Pick the day before you start working in dubbl. Everything up to that day is summed into one entry; everything after it is recorded in dubbl as it happens.">
      <div className="flex items-stretch gap-1 max-md:flex-col">
        <Box title="Your old books" className="min-w-0 flex-1">Years of transactions in a spreadsheet or another app.</Box>
        <Arrow label="sum up" />
        <Box title="Trial balance on Dec 31" className="min-w-0 flex-1">One balance per account. Debits equal credits.</Box>
        <Arrow label="enter" />
        <Box title="Opening balances" active className="min-w-0 flex-1">One posted entry, dated Dec 31. Replace it any time.</Box>
        <Arrow label="then" />
        <Box title="Day-to-day in dubbl" className="min-w-0 flex-1">Invoices, bills and bank lines from Jan 1 on.</Box>
      </div>
    </Frame>
  );
}

/* ================================================== multi-currency */

/** A euro invoice: recorded at the issue-date rate, paid at a better rate, and the difference booked. */
export function ForeignInvoiceSettlement() {
  const col = (date: string, title: string, rate: string, value: number, note: ReactNode, t: Tone) => (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11.5px] text-muted-foreground">{date}</span>
        <Pill t={t}>{rate}</Pill>
      </div>
      <div className="mt-1.5 text-[13.5px] font-medium text-foreground">{title}</div>
      <div className="mt-1 text-[12.5px] text-muted-foreground">
        €1,000.00 = <Amount cents={value} className="text-foreground" />
      </div>
      <div className="mt-2 text-[12px] leading-[1.45] text-muted-foreground">{note}</div>
    </div>
  );
  return (
    <Frame caption="The invoice stays €1,000 to the customer. Only its value in your base currency changes between the day you issue it and the day they pay.">
      <div className="flex items-stretch gap-1 max-md:flex-col">
        {col("Mar 2", "Invoice issued", "1 EUR = 1.08 USD", 108000, "Accounts Receivable and Sales are recorded at $1,080.", "plain")}
        <Arrow label="rate moves" />
        {col("Apr 10", "Customer pays", "1 EUR = 1.10 USD", 110000, "$1,100 lands in the bank; $1,080 comes off what they owe.", "info")}
        <Arrow />
        <div className="min-w-0 flex-1 rounded-lg border border-emerald-300 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
          <Pill t="good">Realised gain</Pill>
          <div className="mt-1.5 text-[13.5px] font-medium text-foreground"><Amount cents={2000} /> booked</div>
          <div className="mt-2 text-[12px] leading-[1.45] text-muted-foreground">Credited to 4910 Realised Currency Gains. A worse rate would debit 5930 Realised Currency Losses.</div>
        </div>
      </div>
    </Frame>
  );
}

/** Month-end revaluation of open foreign balances, reversed the next day. */
export function FxRevaluationCycle() {
  return (
    <Frame caption="Runs on the 1st of each month for every open foreign-currency invoice and bill. Months that are locked are skipped.">
      <div className="flex items-stretch gap-1 max-md:flex-col">
        <Box title="Mar 31: revalue" className="min-w-0 flex-1">Open balances are valued at the month-end rate. The difference goes to 4920 Unrealised Currency Gains or 5940 Unrealised Currency Losses.</Box>
        <Arrow label="next day" />
        <Box title="Apr 1: undo" className="min-w-0 flex-1">The same entry is reversed, so the invoice is back at its original value.</Box>
        <Arrow label="later" />
        <Box title="Paid: realise" active className="min-w-0 flex-1">The real gain or loss is booked once, when the money moves.</Box>
      </div>
    </Frame>
  );
}
