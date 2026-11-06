import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Arrow, Box, Frame, Label, Pill, TAccount, fill, type Tone } from "./frame";

// Diagrams for the Learn section: plain-language accounting, drawn. Every
// figure is self-contained sample data (whole dollars unless noted), built on
// the primitives in ./frame so it matches the app in light and dark.

/* ------------------------------------------------------------ helpers */

const usd = (n: number, cents = false) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

const signed = (n: number, cents = false) => (n > 0 ? `+${usd(n, cents)}` : usd(n, cents));

type Kind = "asset" | "liability" | "equity" | "revenue" | "expense";

/** One colour per account type, used the same way in every diagram. */
const KIND: Record<Kind, { name: string; one: string; dot: string; soft: string; svgFill: string; svgStroke: string }> = {
  asset: {
    name: "Assets",
    one: "Asset",
    dot: "bg-sky-500",
    soft: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/30",
    svgFill: "fill-sky-100 dark:fill-sky-500/20",
    svgStroke: "stroke-sky-300 dark:stroke-sky-500/50",
  },
  liability: {
    name: "Liabilities",
    one: "Liability",
    dot: "bg-amber-500",
    soft: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30",
    svgFill: "fill-amber-100 dark:fill-amber-500/20",
    svgStroke: "stroke-amber-300 dark:stroke-amber-500/50",
  },
  equity: {
    name: "Equity",
    one: "Equity",
    dot: "bg-violet-500",
    soft: "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/30",
    svgFill: "fill-violet-100 dark:fill-violet-500/20",
    svgStroke: "stroke-violet-300 dark:stroke-violet-500/50",
  },
  revenue: {
    name: "Revenue",
    one: "Revenue",
    dot: "bg-emerald-500",
    soft: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30",
    svgFill: "fill-emerald-100 dark:fill-emerald-500/20",
    svgStroke: "stroke-emerald-300 dark:stroke-emerald-500/50",
  },
  expense: {
    name: "Expenses",
    one: "Expense",
    dot: "bg-rose-500",
    soft: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/30",
    svgFill: "fill-rose-100 dark:fill-rose-500/20",
    svgStroke: "stroke-rose-300 dark:stroke-rose-500/50",
  },
};

function KindChip({ k, children }: { k: Kind; children?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset", KIND[k].soft)}>
      <span className={cn("size-1.5 rounded-full", KIND[k].dot)} />
      {children ?? KIND[k].one}
    </span>
  );
}

function Dot({ k, className }: { k: Kind; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", KIND[k].dot, className)} aria-hidden="true" />;
}

function Legend({ items }: { items: { swatch: string; label: ReactNode; line?: boolean; dashed?: boolean }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted-foreground">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {it.line ? (
            <span className={cn("h-0 w-5 border-t-2", it.dashed && "border-dashed", it.swatch)} />
          ) : (
            <span className={cn("size-2.5 rounded-sm", it.swatch)} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** A small numbered marker that ties the same number together across cards. */
function Tie({ n, t }: { n: string; t: "a" | "b" }) {
  return (
    <span
      className={cn(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold text-white",
        t === "a" ? "bg-emerald-500" : "bg-sky-500",
      )}
    >
      {n}
    </span>
  );
}

/**
 * Boxes joined by arrows: a row on wide screens, a column on narrow ones. Built
 * on grid templates rather than flex-direction overrides, so the docs' own
 * stylesheet can't flip it back.
 */
const FLOW_COLS: Record<number, string> = {
  2: "md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
  3: "md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]",
  4: "md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]",
};

function FlowRow({ children }: { children: ReactNode[] }) {
  return (
    <div className={cn("grid items-stretch gap-1 md:items-center", FLOW_COLS[children.length])}>
      {children.flatMap((c, i) => (i === 0 ? [<div key={i} className="h-full">{c}</div>] : [<Arrow key={`a${i}`} />, <div key={i} className="h-full">{c}</div>]))}
    </div>
  );
}

/* ================================================== the learn home page */

const PIPELINE = [
  { title: "Something happens", body: "You send an invoice, pay a bill, run payroll, or money moves in the bank." },
  { title: "A journal entry", body: "dubbl writes it down as debits and credits that always balance." },
  { title: "Accounts", body: "Each line lands in an account from your chart: Bank, Sales, Rent and so on." },
  { title: "Reports", body: "Accounts add up into the profit and loss, the balance sheet and cash flow." },
];

/** How everyday work turns into reports. */
export function BooksPipeline() {
  return (
    <Frame caption="Every screen in dubbl feeds the same set of books. The reports are just the accounts, added up.">
      <FlowRow>
        {PIPELINE.map((p, i) => (
          <div key={p.title} className="h-full rounded-lg border border-border bg-background px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-foreground text-[11px] font-medium text-background">{i + 1}</span>
              <span className="text-[14px] font-medium text-foreground">{p.title}</span>
            </div>
            <div className="mt-1.5 text-[12.5px] leading-[1.5] text-muted-foreground">{p.body}</div>
          </div>
        ))}
      </FlowRow>
    </Frame>
  );
}

/* ======================================================= double entry */

/** The accounting equation as a balance: what you own on one side, who has a claim on it on the other. */
export function EquationScale() {
  const scale = 140 / 16000;
  const left = [
    { label: "Cash in the bank", v: 8000 },
    { label: "Equipment", v: 4000 },
    { label: "Owed to you", v: 4000 },
  ];
  const right: { label: string; v: number; k: Kind }[] = [
    { label: "Bank loan", v: 6000, k: "liability" },
    { label: "Your stake", v: 10000, k: "equity" },
  ];
  const stack = (items: { label: string; v: number; k?: Kind }[], x: number, k: Kind) => {
    let y = 200;
    return items.map((it) => {
      const h = it.v * scale;
      y -= h;
      const top = y;
      const kind = it.k ?? k;
      return (
        <g key={it.label}>
          <rect x={x} y={top + 1} width={200} height={h - 2} rx={6} strokeWidth={1} className={cn(KIND[kind].svgFill, KIND[kind].svgStroke)} />
          <text x={x + 10} y={top + h / 2 + 4} className="fill-foreground text-[12px]">{it.label}</text>
          <text x={x + 190} y={top + h / 2 + 4} textAnchor="end" className="fill-foreground font-mono text-[11.5px]">{usd(it.v)}</text>
        </g>
      );
    });
  };
  return (
    <Frame caption="Assets = Liabilities + Equity. Every transaction keeps the two sides level.">
      <svg viewBox="0 0 640 272" className="mx-auto h-auto w-full max-w-[640px] min-w-[420px]" role="img" aria-label="A balance: assets of $16,000 on the left equal a $6,000 loan plus $10,000 of equity on the right">
        <text x={160} y={24} textAnchor="middle" className="fill-foreground text-[14px] font-medium">Assets · $16,000</text>
        <text x={160} y={42} textAnchor="middle" className="fill-muted-foreground text-[11.5px]">what the business owns</text>
        <text x={480} y={24} textAnchor="middle" className="fill-foreground text-[14px] font-medium">Liabilities + Equity · $16,000</text>
        <text x={480} y={42} textAnchor="middle" className="fill-muted-foreground text-[11.5px]">who has a claim on it</text>
        <text x={320} y={140} textAnchor="middle" className="fill-muted-foreground text-[34px] font-light">=</text>
        {stack(left, 60, "asset")}
        {stack(right, 380, "liability")}
        <rect x={40} y={200} width={560} height={8} rx={4} className="fill-foreground" opacity={0.85} />
        <polygon points="320,208 292,256 348,256" className="fill-muted-foreground" opacity={0.45} />
        <line x1={230} x2={410} y1={257} y2={257} strokeWidth={1.5} className="stroke-border" />
      </svg>
      <Legend
        items={[
          { swatch: KIND.asset.dot, label: "Assets: things you own or are owed" },
          { swatch: KIND.liability.dot, label: "Liabilities: what you owe others" },
          { swatch: KIND.equity.dot, label: "Equity: what's left for the owners" },
        ]}
      />
    </Frame>
  );
}

const MOVES: { what: string; a: string[]; l: string[]; e: string[]; tot: [number, number, number] }[] = [
  { what: "You put $10,000 of savings into the business", a: ["+$10,000 cash"], l: [], e: ["+$10,000 put in"], tot: [10000, 0, 10000] },
  { what: "You borrow $6,000 from the bank", a: ["+$6,000 cash"], l: ["+$6,000 loan"], e: [], tot: [16000, 6000, 10000] },
  { what: "You buy a $4,000 machine", a: ["+$4,000 equipment", "-$4,000 cash"], l: [], e: [], tot: [16000, 6000, 10000] },
  { what: "You invoice a customer $4,000", a: ["+$4,000 owed to you"], l: [], e: ["+$4,000 income"], tot: [20000, 6000, 14000] },
  { what: "You pay $4,000 of wages", a: ["-$4,000 cash"], l: [], e: ["-$4,000 expense"], tot: [16000, 6000, 10000] },
];

function MoveCell({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-muted-foreground/50">·</span>;
  return (
    <div className="space-y-0.5">
      {items.map((s) => (
        <div key={s} className={cn("font-mono text-[12px] tabular-nums", s.startsWith("-") ? "text-rose-600 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300")}>
          {s}
        </div>
      ))}
    </div>
  );
}

/** Five transactions and how each one keeps the equation balanced. */
export function EquationLedger() {
  return (
    <Frame caption="Each row changes at least two things. After every row, the left side still equals the right." className="p-0 md:p-0">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-[1.5fr_1.1fr_0.9fr_1fr_1.5fr] gap-3 border-b border-border px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          <span>What happened</span>
          <span className="inline-flex items-center gap-1.5"><Dot k="asset" />Assets</span>
          <span className="inline-flex items-center gap-1.5"><Dot k="liability" />Liabilities</span>
          <span className="inline-flex items-center gap-1.5"><Dot k="equity" />Equity</span>
          <span className="text-right">Totals: A = L + E</span>
        </div>
        {MOVES.map((m, i) => (
          <div key={i} className="grid grid-cols-[1.5fr_1.1fr_0.9fr_1fr_1.5fr] items-center gap-3 border-b border-border/70 px-5 py-2.5 text-[13px] last:border-b-0">
            <span className="text-foreground">{m.what}</span>
            <MoveCell items={m.a} />
            <MoveCell items={m.l} />
            <MoveCell items={m.e} />
            <span className="whitespace-nowrap text-right font-mono text-[11.5px] tabular-nums text-muted-foreground">
              {m.tot[0].toLocaleString("en-US")} = {m.tot[1].toLocaleString("en-US")} + {m.tot[2].toLocaleString("en-US")}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** A sale and its payment, followed through three T-accounts. */
export function SaleTAccounts() {
  return (
    <Frame caption="Sending the invoice puts $4,500 on the left of Accounts receivable. The payment takes it off again and puts it in the bank.">
      <div className="mb-4 flex flex-wrap gap-2">
        <Pill t="info">1 · Invoice sent</Pill>
        <Pill t="good">2 · Customer pays</Pill>
      </div>
      <div className="flex flex-wrap gap-3">
        <TAccount name="Checking account" debits={[{ label: "2", cents: 450000 }]} />
        <TAccount name="Accounts receivable" debits={[{ label: "1", cents: 450000 }]} credits={[{ label: "2", cents: 450000 }]} />
        <TAccount name="Sales" credits={[{ label: "1", cents: 450000 }]} />
      </div>
      <div className="mt-4 grid gap-2 text-[12.5px] text-muted-foreground sm:grid-cols-3">
        <div className="flex items-start gap-2"><Dot k="asset" className="mt-1.5" />The bank is up $4,500.</div>
        <div className="flex items-start gap-2"><Dot k="asset" className="mt-1.5" />Receivables are back to zero: nobody owes you for this job any more.</div>
        <div className="flex items-start gap-2"><Dot k="revenue" className="mt-1.5" />Sales are up $4,500, counted when you invoiced.</div>
      </div>
    </Frame>
  );
}

/* ================================================== debits and credits */

const SIDES: { k: Kind; examples: string; up: "debit" | "credit" }[] = [
  { k: "asset", examples: "Bank, equipment, stock, what customers owe you", up: "debit" },
  { k: "expense", examples: "Rent, wages, software, cost of goods sold", up: "debit" },
  { k: "liability", examples: "Supplier bills, loans, tax you've collected", up: "credit" },
  { k: "equity", examples: "Money you put in, profits kept in the business", up: "credit" },
  { k: "revenue", examples: "Sales, fees, interest earned", up: "credit" },
];

function MiniT({ up }: { up: "debit" | "credit" }) {
  const half = (side: "debit" | "credit") => {
    const grows = side === up;
    return (
      <div className={cn("px-2 py-2 text-center", side === "debit" && "border-r-2 border-foreground/70", grows && "bg-emerald-50 dark:bg-emerald-500/10")}>
        <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{side === "debit" ? "Debit" : "Credit"}</div>
        <div className={cn("mt-0.5 text-[18px] font-semibold leading-none", grows ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground/60")}>{grows ? "+" : "−"}</div>
        <div className={cn("mt-1 text-[11px]", grows ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>{grows ? "increases" : "decreases"}</div>
      </div>
    );
  };
  return (
    <div className="mt-3 border-t-2 border-foreground/70">
      <div className="grid grid-cols-2">{half("debit")}{half("credit")}</div>
    </div>
  );
}

/** The five account types and the side that makes each one grow. */
export function AccountTypeSides() {
  const group = (up: "debit" | "credit") => SIDES.filter((s) => s.up === up);
  return (
    <Frame caption="Debit means left, credit means right. Which one adds depends on the type of account.">
      <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
        {(["debit", "credit"] as const).map((up) => (
          <div key={up}>
            <Label>{up === "debit" ? "Grow with a debit" : "Grow with a credit"}</Label>
            <div className={cn("mt-2 grid gap-2", up === "debit" ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
              {group(up).map((s) => (
                <div key={s.k} className="flex flex-col rounded-lg border border-border bg-background p-3">
                  <KindChip k={s.k}>{KIND[s.k].name}</KindChip>
                  <div className="mt-2 flex-1 text-[12px] leading-[1.45] text-muted-foreground">{s.examples}</div>
                  <MiniT up={s.up} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

const EVERYDAY: { what: string; dr: [Kind, string]; cr: [Kind, string] }[] = [
  { what: "You send an invoice", dr: ["asset", "Accounts receivable"], cr: ["revenue", "Sales"] },
  { what: "The customer pays it", dr: ["asset", "Checking account"], cr: ["asset", "Accounts receivable"] },
  { what: "A supplier's bill arrives", dr: ["expense", "Office expenses"], cr: ["liability", "Accounts payable"] },
  { what: "You pay that bill", dr: ["liability", "Accounts payable"], cr: ["asset", "Checking account"] },
  { what: "You pay rent by card", dr: ["expense", "Rent"], cr: ["liability", "Credit card payable"] },
  { what: "You put your own money in", dr: ["asset", "Checking account"], cr: ["equity", "Owner's contribution"] },
  { what: "You take money out for yourself", dr: ["equity", "Owner's draw"], cr: ["asset", "Checking account"] },
];

/** Everyday transactions and which account takes the debit and which the credit. */
export function EverydayDebitsCredits() {
  return (
    <Frame caption="Seven transactions cover most of a small business's year. dubbl writes all of these for you." className="p-0 md:p-0">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            <th className="px-5 py-2.5 font-medium">What happened</th>
            <th className="px-5 py-2.5 font-medium">Debit (left)</th>
            <th className="px-5 py-2.5 font-medium">Credit (right)</th>
          </tr>
        </thead>
        <tbody>
          {EVERYDAY.map((r) => (
            <tr key={r.what} className="border-t border-border/70">
              <td className="px-5 py-2.5 text-foreground">{r.what}</td>
              <td className="px-5 py-2.5"><span className="inline-flex items-center gap-2 text-foreground"><Dot k={r.dr[0]} />{r.dr[1]}</span></td>
              <td className="px-5 py-2.5"><span className="inline-flex items-center gap-2 text-foreground"><Dot k={r.cr[0]} />{r.cr[1]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border px-5 py-3 text-[12px] text-muted-foreground">
        {(Object.keys(KIND) as Kind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5"><Dot k={k} />{KIND[k].one}</span>
        ))}
      </div>
    </Frame>
  );
}

/* =================================================== chart of accounts */

const RANGES: { k: Kind; from: number; to: number; label: string; examples: [string, string][] }[] = [
  { k: "asset", from: 0, to: 200, label: "000 to 199", examples: [["090", "Checking Account"], ["120", "Accounts Receivable"], ["140", "Inventory"], ["160", "Computer Equipment"]] },
  { k: "liability", from: 200, to: 300, label: "200s", examples: [["200", "Accounts Payable"], ["220", "Sales Tax"], ["270", "Credit Card Payable"], ["290", "Loan"]] },
  { k: "equity", from: 300, to: 400, label: "300s", examples: [["300", "Owner's Contribution"], ["310", "Owner's Draw"], ["320", "Retained Earnings"]] },
  { k: "revenue", from: 400, to: 500, label: "400s", examples: [["400", "Sales"], ["460", "Other Revenue"], ["470", "Interest Income"]] },
  { k: "expense", from: 500, to: 900, label: "500 to 899", examples: [["500", "Cost of Goods Sold"], ["660", "Rent"], ["668", "Wages and Salaries"], ["700", "Depreciation"]] },
];

/** How the account codes in dubbl's US chart are laid out. */
export function ChartCodeRanges() {
  return (
    <Frame caption="The chart dubbl sets up for a new US business. Charts for other countries use their own numbering, but the five types are the same everywhere.">
      <div className="flex h-3 overflow-hidden rounded-full">
        {RANGES.map((r) => (
          <div key={r.k} className={KIND[r.k].dot} style={{ width: `${((r.to - r.from) / 900) * 100}%` }} />
        ))}
      </div>
      <div className="relative mt-1.5 h-4 font-mono text-[11px] tabular-nums text-muted-foreground">
        {[0, 200, 300, 400, 500, 900].map((v) => (
          <span key={v} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${(v / 900) * 100}%` }}>
            {String(v).padStart(3, "0")}
          </span>
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {RANGES.map((r) => (
          <div key={r.k} className="rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <KindChip k={r.k}>{KIND[r.k].name}</KindChip>
              <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">{r.label}</span>
            </div>
            <ul className="mt-2.5 space-y-1.5 text-[12px] leading-[1.35]">
              {r.examples.map(([code, name]) => (
                <li key={code} className="flex gap-1.5">
                  <span className="w-7 shrink-0 font-mono text-muted-foreground">{code}</span>
                  <span className="text-foreground">{name}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Which account types feed which report. */
export function ChartToReports() {
  return (
    <Frame caption="Three types describe where you stand. Two describe how you did. Profit is what connects them.">
      <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="text-[14px] font-medium text-foreground">Profit and loss</div>
          <div className="text-[12px] text-muted-foreground">How you did over a period</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <KindChip k="revenue" />
            <KindChip k="expense" />
          </div>
          <div className="mt-3 border-t border-border pt-2.5 text-[12.5px] text-foreground">Revenue minus expenses = <b className="font-medium">profit</b></div>
        </div>
        <div className="flex flex-col items-center justify-center px-1">
          <Arrow label="profit adds to equity" />
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="text-[14px] font-medium text-foreground">Balance sheet</div>
          <div className="text-[12px] text-muted-foreground">Where you stand on one date</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <KindChip k="asset" />
            <KindChip k="liability" />
            <KindChip k="equity" />
          </div>
          <div className="mt-3 border-t border-border pt-2.5 text-[12.5px] text-foreground">Assets = liabilities + <b className="font-medium">equity</b></div>
        </div>
      </div>
    </Frame>
  );
}

/* ===================================================== accrual vs cash */

const MONTHS3 = ["March", "April", "May"];

/** One job and one bill, counted two ways. */
export function AccrualCashTimeline() {
  const events = [
    ["Mar 20 · Job done, $3,000 invoice sent", "Mar 28 · $800 bill for materials arrives"],
    ["Apr 18 · Customer pays the $3,000"],
    ["May 5 · You pay the $800 bill"],
  ];
  const lanes: { name: string; sub: string; cells: { profit: number; detail: string }[] }[] = [
    {
      name: "When invoiced or billed",
      sub: "Accrual basis",
      cells: [
        { profit: 2200, detail: "$3,000 income, $800 cost" },
        { profit: 0, detail: "Money arrives, nothing new earned" },
        { profit: 0, detail: "Money leaves, nothing new spent" },
      ],
    },
    {
      name: "When money moves",
      sub: "Cash basis",
      cells: [
        { profit: 0, detail: "No money has moved yet" },
        { profit: 3000, detail: "$3,000 lands in the bank" },
        { profit: -800, detail: "$800 leaves the bank" },
      ],
    },
  ];
  return (
    <Frame caption="Same job, same bill, same $2,200 in the end. The only question is which month gets it." className="p-0 md:p-0">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[150px_1fr_1fr_1fr_90px] border-b border-border">
          <div className="px-4 py-2.5" />
          {MONTHS3.map((m) => (
            <div key={m} className="border-l border-border px-4 py-2.5 text-[13px] font-medium text-foreground">{m}</div>
          ))}
          <div className="border-l border-border px-4 py-2.5 text-right text-[13px] font-medium text-foreground">Total</div>
        </div>
        <div className="grid grid-cols-[150px_1fr_1fr_1fr_90px] border-b border-border bg-muted/40">
          <div className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">What happened</div>
          {events.map((ev, i) => (
            <div key={i} className="space-y-1.5 border-l border-border px-4 py-3">
              {ev.map((e) => (
                <div key={e} className="flex items-start gap-2 text-[12px] leading-[1.4] text-foreground/85">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-foreground/60" />
                  {e}
                </div>
              ))}
            </div>
          ))}
          <div className="border-l border-border" />
        </div>
        {lanes.map((l) => (
          <div key={l.name} className="grid grid-cols-[150px_1fr_1fr_1fr_90px] border-b border-border last:border-b-0">
            <div className="px-4 py-3">
              <div className="text-[13px] font-medium text-foreground">{l.name}</div>
              <div className="text-[11.5px] text-muted-foreground">{l.sub}</div>
            </div>
            {l.cells.map((c, i) => (
              <div key={i} className="border-l border-border px-4 py-3">
                <div className={cn("font-mono text-[15px] font-medium tabular-nums", c.profit > 0 ? "text-emerald-700 dark:text-emerald-300" : c.profit < 0 ? "text-rose-600 dark:text-rose-300" : "text-muted-foreground")}>
                  {c.profit === 0 ? "$0" : signed(c.profit)}
                </div>
                <div className="mt-0.5 text-[11.5px] leading-[1.4] text-muted-foreground">{c.detail}</div>
              </div>
            ))}
            <div className="border-l border-border px-4 py-3 text-right font-mono text-[15px] font-medium tabular-nums text-foreground">$2,200</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Monthly profit under each basis, as bars. */
export function BasisProfitBars() {
  const W = 560, H = 230, pad = { l: 48, r: 12, t: 16, b: 30 };
  const min = -1000, max = 3200;
  const y = (v: number) => pad.t + ((max - v) / (max - min)) * (H - pad.t - pad.b);
  const data = [
    { m: "March", acc: 2200, cash: 0 },
    { m: "April", acc: 0, cash: 3000 },
    { m: "May", acc: 0, cash: -800 },
  ];
  const groupW = (W - pad.l - pad.r) / 3;
  const bw = 46;
  return (
    <Frame caption="Accrual shows March as the month you earned the money. Cash shows the months the money moved.">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[320px]" role="img" aria-label="Profit by month: accrual basis $2,200 in March; cash basis $3,000 in April and minus $800 in May">
        {[-1000, 0, 1000, 2000, 3000].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? "stroke-foreground/50" : "stroke-border"} strokeDasharray={v === 0 ? undefined : "3 4"} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{v === 0 ? "$0" : `${v < 0 ? "-" : ""}$${Math.abs(v / 1000)}k`}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + groupW * i + groupW / 2;
          const bar = (v: number, x: number, cls: string) =>
            v === 0 ? (
              <rect x={x} y={y(0) - 1.5} width={bw} height={3} rx={1.5} className={cls} opacity={0.5} />
            ) : (
              <g>
                <rect x={x} y={Math.min(y(v), y(0))} width={bw} height={Math.abs(y(v) - y(0))} rx={4} className={cls} />
                <text x={x + bw / 2} y={v > 0 ? y(v) - 6 : y(v) + 14} textAnchor="middle" className="fill-foreground font-mono text-[11px]">{signed(v)}</text>
              </g>
            );
          return (
            <g key={d.m}>
              {bar(d.acc, cx - bw - 4, "fill-foreground")}
              {bar(d.cash, cx + 4, "fill-sky-500")}
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11.5px]">{d.m}</text>
            </g>
          );
        })}
      </svg>
      <Legend items={[{ swatch: "bg-foreground", label: "When invoiced or billed (accrual)" }, { swatch: "bg-sky-500", label: "When money moves (cash)" }]} />
    </Frame>
  );
}

/* ============================================== financial statements */

function StatementRow({ label, v, tie, strong, indent }: { label: string; v: number; tie?: ReactNode; strong?: boolean; indent?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 py-1 text-[12.5px]", strong && "border-t border-border pt-1.5 font-medium")}>
      <span className={cn("flex-1 text-foreground", indent && "pl-2 text-foreground/85", !strong && !indent && "text-foreground/85")}>{label}</span>
      {tie}
      <span className="font-mono tabular-nums text-foreground">{usd(v)}</span>
    </div>
  );
}

function StatementCard({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-[14px] font-medium text-foreground">{title}</div>
      <div className="mb-2.5 text-[11.5px] text-muted-foreground">{sub}</div>
      {children}
    </div>
  );
}

/** The three statements for one year, with the numbers that tie them together marked. */
export function StatementsTriad() {
  const A = <Tie n="A" t="a" />;
  const B = <Tie n="B" t="b" />;
  return (
    <Frame caption="A first year in business. Profit (A) becomes equity on the balance sheet. The cash flow starts from that profit and ends at the cash in the bank (B).">
      <div className="grid gap-3 lg:grid-cols-3">
        <StatementCard title="Profit and loss" sub="Jan 1 to Dec 31">
          <StatementRow label="Money in" v={120000} />
          <StatementRow label="Money out" v={-85000} />
          <StatementRow label="Profit" v={35000} tie={A} strong />
        </StatementCard>
        <StatementCard title="Balance sheet" sub="As of Dec 31">
          <Label className="mt-1">What you own</Label>
          <StatementRow label="Checking account" v={42000} tie={B} indent />
          <StatementRow label="Customers owe you" v={18000} indent />
          <StatementRow label="Equipment" v={10000} indent />
          <StatementRow label="Total" v={70000} strong />
          <Label className="mt-2.5">What you owe</Label>
          <StatementRow label="Suppliers" v={8000} indent />
          <StatementRow label="Bank loan" v={12000} indent />
          <StatementRow label="Total" v={20000} strong />
          <Label className="mt-2.5">What&apos;s left over (yours)</Label>
          <StatementRow label="Money you put in" v={15000} indent />
          <StatementRow label="Current year earnings" v={35000} tie={A} indent />
          <StatementRow label="Total" v={50000} strong />
        </StatementCard>
        <StatementCard title="Cash flow" sub="Jan 1 to Dec 31">
          <Label className="mt-1">From day-to-day trading</Label>
          <StatementRow label="Net income" v={35000} tie={A} indent />
          <StatementRow label="Customers still owe" v={-18000} indent />
          <StatementRow label="You still owe suppliers" v={8000} indent />
          <StatementRow label="Total" v={25000} strong />
          <Label className="mt-2.5">From buying &amp; selling things</Label>
          <StatementRow label="Equipment bought" v={-10000} indent />
          <Label className="mt-2.5">From funding</Label>
          <StatementRow label="Bank loan" v={12000} indent />
          <StatementRow label="Money you put in" v={15000} indent />
          <StatementRow label="Change in cash" v={42000} tie={B} strong />
        </StatementCard>
      </div>
    </Frame>
  );
}

/** A balance sheet is one date; a profit and loss is a stretch of time. */
export function PhotoVsFilm() {
  const W = 640, H = 176, l = 30, r = 610;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const x = (i: number) => l + (i / 12) * (r - l);
  return (
    <Frame caption="The profit and loss and the cash flow cover a period. The balance sheet is a snapshot on the last day of it.">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[420px]" role="img" aria-label="A timeline from January to December. Profit and loss and cash flow span the whole year; the balance sheet is a single point on December 31.">
        <rect x={l} y={30} width={r - l} height={26} rx={6} className="fill-emerald-100 stroke-emerald-300 dark:fill-emerald-500/15 dark:stroke-emerald-500/40" />
        <text x={l + 10} y={47} className="fill-emerald-800 text-[12px] font-medium dark:fill-emerald-200">Profit and loss: what you earned and spent between two dates</text>
        <rect x={l} y={62} width={r - l} height={26} rx={6} className="fill-sky-100 stroke-sky-300 dark:fill-sky-500/15 dark:stroke-sky-500/40" />
        <text x={l + 10} y={79} className="fill-sky-800 text-[12px] font-medium dark:fill-sky-200">Cash flow: how the money in the bank moved over the same dates</text>
        <line x1={l} x2={r} y1={118} y2={118} strokeWidth={1.5} className="stroke-border" />
        {months.map((m, i) => (
          <g key={m}>
            <line x1={x(i)} x2={x(i)} y1={114} y2={122} className="stroke-border" />
            <text x={x(i) + (r - l) / 24} y={138} textAnchor="middle" className="fill-muted-foreground text-[10.5px]">{m}</text>
          </g>
        ))}
        <line x1={r} x2={r} y1={22} y2={126} strokeWidth={2} strokeDasharray="4 3" className="stroke-violet-500" />
        <circle cx={r} cy={118} r={6} className="fill-violet-500" />
        <text x={r - 8} y={162} textAnchor="end" className="fill-violet-700 text-[12px] font-medium dark:fill-violet-300">Balance sheet: where things stand on Dec 31</text>
      </svg>
    </Frame>
  );
}

/* ========================================= receivables and payables */

/** Money owed to you and money you owe, side by side. */
export function ArApMirror() {
  const row = (t: Tone, name: string, steps: { title: string; body: string }[], k: Kind) => (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Pill t={t}>{name}</Pill>
        <KindChip k={k} />
      </div>
      <FlowRow>
        {steps.map((s, i) => (
          <Box key={s.title} title={s.title} className="h-full" active={i === 1}>{s.body}</Box>
        ))}
      </FlowRow>
    </div>
  );
  return (
    <Frame caption="Receivables are money on its way in. Payables are money on its way out. Both wait in an account until the payment closes them.">
      <div className="space-y-5">
        {row("good", "Accounts receivable", [
          { title: "You send an invoice", body: "Sales go up. So does what the customer owes." },
          { title: "Accounts receivable", body: "An asset: money that's yours but not in the bank yet." },
          { title: "The customer pays", body: "The bank goes up. What they owe drops back to zero." },
        ], "asset")}
        {row("watch", "Accounts payable", [
          { title: "A supplier's bill arrives", body: "An expense goes up. So does what you owe them." },
          { title: "Accounts payable", body: "A liability: money you've agreed to pay but haven't yet." },
          { title: "You pay the bill", body: "The bank goes down. What you owe drops back to zero." },
        ], "liability")}
      </div>
    </Frame>
  );
}

/** Ageing: where unpaid invoices sit, counted from their due date. */
export function AgingTimeline() {
  const W = 640, H = 210, l = 20, r = 620;
  const zones: { name: string; from: number; to: number; t: Tone; total: number }[] = [
    { name: "Current", from: 0, to: 30, t: "good", total: 12400 },
    { name: "1-30 days", from: 30, to: 60, t: "info", total: 6200 },
    { name: "31-60 days", from: 60, to: 90, t: "watch", total: 3100 },
    { name: "61-90 days", from: 90, to: 120, t: "watch", total: 1500 },
    { name: "90+ days", from: 120, to: 160, t: "bad", total: 800 },
  ];
  const x = (d: number) => l + (d / 160) * (r - l);
  const zoneFill: Record<Tone, string> = {
    good: "fill-emerald-100 dark:fill-emerald-500/15",
    info: "fill-sky-100 dark:fill-sky-500/15",
    watch: "fill-amber-100 dark:fill-amber-500/15",
    bad: "fill-rose-100 dark:fill-rose-500/15",
    plain: "fill-muted",
  };
  const zoneText: Record<Tone, string> = {
    good: "fill-emerald-800 dark:fill-emerald-200",
    info: "fill-sky-800 dark:fill-sky-200",
    watch: "fill-amber-800 dark:fill-amber-200",
    bad: "fill-rose-800 dark:fill-rose-200",
    plain: "fill-muted-foreground",
  };
  const dots = [8, 19, 27, 41, 52, 66, 98, 141];
  return (
    <Frame caption="An invoice on Net 30 terms is Current for its first 30 days. After the due date it moves one bucket to the right every 30 days.">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[460px]" role="img" aria-label="Ageing buckets from Current through 90+ days, with totals per bucket">
        {zones.map((z) => (
          <g key={z.name}>
            <rect x={x(z.from) + 1} y={30} width={x(z.to) - x(z.from) - 2} height={90} rx={6} className={zoneFill[z.t]} />
            <text x={(x(z.from) + x(z.to)) / 2} y={22} textAnchor="middle" className={cn("text-[11.5px] font-medium", zoneText[z.t])}>{z.name}</text>
            <text x={(x(z.from) + x(z.to)) / 2} y={146} textAnchor="middle" className="fill-foreground font-mono text-[12.5px] font-medium">{usd(z.total)}</text>
          </g>
        ))}
        {dots.map((d, i) => (
          <circle key={i} cx={x(d)} cy={i % 2 ? 62 : 90} r={7} className="fill-background stroke-foreground/70" strokeWidth={1.5} />
        ))}
        <line x1={x(0)} x2={x(160)} y1={170} y2={170} className="stroke-border" strokeWidth={1.5} />
        {[
          { d: 0, t: "Invoice sent" },
          { d: 30, t: "Due" },
          { d: 60, t: "+30 days" },
          { d: 90, t: "+60 days" },
          { d: 120, t: "+90 days" },
        ].map((m) => (
          <g key={m.d}>
            <line x1={x(m.d)} x2={x(m.d)} y1={165} y2={175} className="stroke-foreground/60" strokeWidth={1.5} />
            <text x={x(m.d) + (m.d === 0 ? 0 : 0)} y={192} textAnchor={m.d === 0 ? "start" : "middle"} className="fill-muted-foreground text-[11px]">{m.t}</text>
          </g>
        ))}
      </svg>
      <Legend items={[{ swatch: "rounded-full border-[1.5px] border-foreground/70 bg-background", label: "An unpaid invoice. The figure under each bucket is the total owed in it." }]} />
    </Frame>
  );
}

/* ================================================ bank reconciliation */

const REC_BANK = [
  { d: "Mar 2", t: "Deposit · ACME CORP", v: 4950, m: true },
  { d: "Mar 5", t: "Transfer · Harbor Properties", v: -3500, m: true },
  { d: "Mar 9", t: "Card · ADOBE", v: -59.99, m: true },
  { d: "Mar 31", t: "Monthly account fee", v: -15, m: false },
];
const REC_BOOKS = [
  { d: "Mar 2", t: "Payment for INV-00011", v: 4950, m: true },
  { d: "Mar 5", t: "Office rent, March", v: -3500, m: true },
  { d: "Mar 9", t: "Adobe subscription", v: -59.99, m: true },
  { d: "Mar 28", t: "Check #1042, Smith Repairs", v: -600, m: false },
];

function RecLine({ l, side }: { l: (typeof REC_BANK)[number]; side: "bank" | "books" }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-md border px-3 py-2 text-[12.5px]", l.m ? "border-border bg-background" : "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10")}>
      <span className="w-11 shrink-0 font-mono text-[11px] text-muted-foreground">{l.d}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{l.t}</span>
      <span className={cn("font-mono tabular-nums", l.v < 0 ? "text-rose-600 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300")}>{signed(l.v, true)}</span>
      {!l.m && <span className="sr-only">{side === "bank" ? "only on the statement" : "only in your books"}</span>}
    </div>
  );
}

/** A statement and the books side by side: matched lines, and the two that explain the difference. */
export function ReconcileMatch() {
  return (
    <Frame caption="Three lines match. The bank fee is only on the statement (add it to your books). The check is only in your books (it hasn't cleared yet).">
      <div className="grid gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)]">
        <Label className="max-md:hidden">Bank statement</Label>
        <span className="max-md:hidden" />
        <Label className="max-md:hidden">Your books</Label>
        {REC_BANK.map((l, i) => [
          <RecLine key={`b${i}`} l={l} side="bank" />,
          <div key={`m${i}`} className="flex items-center justify-center">
            {l.m ? (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white" aria-hidden="true">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
            ) : (
              <span className="text-[15px] font-medium text-amber-500" aria-hidden="true">?</span>
            )}
          </div>,
          <RecLine key={`k${i}`} l={REC_BOOKS[i]} side="books" />,
        ])}
      </div>
    </Frame>
  );
}

/** From the balance in your books to the statement balance, one unmatched line at a time. */
export function ReconcileBridge() {
  const steps = [
    { label: "Balance in your books", v: 10790.01, kind: "total" as const },
    { label: "Check #1042 hasn't cleared yet", v: 600, kind: "step" as const },
    { label: "Bank fee not in your books yet", v: -15, kind: "step" as const },
    { label: "Bank statement balance", v: 11375.01, kind: "total" as const },
  ];
  const lo = 10600, hi = 11450;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  let run = 0;
  return (
    <Frame caption="Opening balance $10,000 on both. Once both unmatched lines are dealt with, the difference is $0.00.">
      <div className="space-y-2.5">
        {steps.map((s) => {
          const start = s.kind === "total" ? lo : run;
          const end = s.kind === "total" ? s.v : run + s.v;
          run = s.kind === "total" ? s.v : end;
          const left = pct(Math.min(start, end));
          const width = Math.max(0.8, Math.abs(pct(end) - pct(start)));
          return (
            <div key={s.label} className="grid grid-cols-[1fr_2fr_100px] items-center gap-3 text-[12.5px] max-sm:grid-cols-[1fr_90px]">
              <span className={cn("text-foreground", s.kind === "total" && "font-medium")}>{s.label}</span>
              <span className="relative h-5 rounded bg-muted max-sm:hidden">
                <span
                  className={cn("absolute inset-y-0 rounded", s.kind === "total" ? "bg-foreground/80" : s.v > 0 ? "bg-emerald-500" : "bg-rose-500")}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </span>
              <span className={cn("text-right font-mono tabular-nums", s.kind === "total" ? "font-medium text-foreground" : s.v > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>
                {s.kind === "total" ? usd(s.v, true) : signed(s.v, true)}
              </span>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

/* ================================================== sales tax and VAT */

/** VAT collected along a supply chain: each business pays over the tax on the value it added. */
export function VatChain() {
  const party = (name: string, sub: string) => (
    <div className="rounded-lg border border-border bg-background px-4 py-3 text-center">
      <div className="text-[14px] font-medium text-foreground">{name}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{sub}</div>
    </div>
  );
  const sale = (what: string, price: string, vat: string) => (
    <div className="flex flex-col items-center gap-1 px-1 text-center">
      <Arrow />
      <div className="text-[12px] text-foreground">{what}</div>
      <div className="font-mono text-[11.5px] text-muted-foreground">{price} + <span className="text-sky-700 dark:text-sky-300">{vat} VAT</span></div>
    </div>
  );
  return (
    <Frame caption="20% VAT. The customer pays $600 of VAT in total, and the tax office receives it in two pieces: $200 from your supplier and $400 from you.">
      <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {party("Your supplier", "Sells you materials")}
        {sale("Materials", "$1,000", "$200")}
        {party("You", "Make and sell the product")}
        {sale("Your product", "$3,000", "$600")}
        {party("Your customer", "Pays $3,600 in total")}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-border bg-background p-4">
          <Label>Your VAT return</Label>
          <div className="mt-2 space-y-1.5 text-[13px]">
            <div className="flex justify-between"><span className="text-foreground/85">VAT you charged (output VAT)</span><span className="font-mono tabular-nums text-foreground">$600</span></div>
            <div className="flex justify-between"><span className="text-foreground/85">VAT you paid (input VAT)</span><span className="font-mono tabular-nums text-foreground">-$200</span></div>
            <div className="flex justify-between border-t border-border pt-1.5 font-medium"><span className="text-foreground">You pay the tax office</span><span className="font-mono tabular-nums text-foreground">$400</span></div>
          </div>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
          <Label className="text-sky-700 dark:text-sky-300">The tax office</Label>
          <div className="mt-2 space-y-1.5 text-[13px]">
            <div className="flex justify-between"><span className="text-foreground/85">From your supplier</span><span className="font-mono tabular-nums text-foreground">$200</span></div>
            <div className="flex justify-between"><span className="text-foreground/85">From you</span><span className="font-mono tabular-nums text-foreground">$400</span></div>
            <div className="flex justify-between border-t border-sky-200 pt-1.5 font-medium dark:border-sky-500/30"><span className="text-foreground">20% of the final $3,000 price</span><span className="font-mono tabular-nums text-foreground">$600</span></div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** Tax added on top of a price, or carved out of an amount that already includes it. */
export function TaxOnTopOrInside() {
  const card = (title: string, where: string, typed: "price" | "total") => (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-[14px] font-medium text-foreground">{title}</div>
      <div className="text-[12px] text-muted-foreground">{where}</div>
      <div className={cn("mt-4 flex h-10 rounded-md p-0.5 text-[12px] font-medium", typed === "total" && "ring-2 ring-foreground/70")}>
        <div className={cn("flex items-center justify-center rounded-l bg-foreground/80 text-background", typed === "price" && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-background")} style={{ width: `${(100 / 110) * 100}%` }}>
          Price $100.00
        </div>
        <div className="flex items-center justify-center rounded-r bg-sky-500 text-white" style={{ width: `${(10 / 110) * 100}%` }}>$10</div>
      </div>
      <div className="mt-3 flex items-start justify-between gap-3 text-[12px]">
        <span className="text-muted-foreground">
          {typed === "price" ? "You type the price, $100. dubbl adds 10% on top." : "You type what left the bank, $110. dubbl works out the $10 inside it."}
        </span>
        <span className="shrink-0 font-mono text-foreground">Total $110.00</span>
      </div>
    </div>
  );
  return (
    <Frame caption="A 10% rate both ways. The outline marks the number you type. The split comes out the same.">
      <div className="grid gap-3 md:grid-cols-2">
        {card("Tax on top", "Invoice and bill lines", "price")}
        {card("Tax inside the amount", "Bank transactions and expense claims", "total")}
      </div>
    </Frame>
  );
}

/* ====================================================== multi-currency */

/** A euro invoice valued in dollars as the exchange rate moves. */
export function FxRateChart() {
  const W = 620, H = 260, pad = { l: 46, r: 16, t: 20, b: 34 };
  const days = 70; // Mar 1 to May 9
  const lo = 1.07, hi = 1.13;
  const x = (d: number) => pad.l + (d / days) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const pts: [number, number][] = [
    [2, 1.08], [8, 1.084], [14, 1.091], [20, 1.088], [26, 1.096], [30, 1.1], [36, 1.097], [42, 1.093], [48, 1.104], [54, 1.112], [60, 1.116], [65, 1.12],
  ];
  const line = pts.map(([d, v]) => `${x(d)},${y(v)}`).join(" ");
  const area = `${x(2)},${y(1.08)} ${line} ${x(65)},${y(1.08)}`;
  const marks = [
    { d: 2, v: 1.08, t: "Invoice sent", s: "€10,000 = $10,800", anchor: "start" as const, dy: 30 },
    { d: 30, v: 1.1, t: "Month end", s: "worth $11,000 · +$200 unrealised", anchor: "middle" as const, dy: -34 },
    { d: 65, v: 1.12, t: "Customer pays", s: "$11,200 · +$400 realised", anchor: "end" as const, dy: -34 },
  ];
  return (
    <Frame caption="The invoice never changes: €10,000. What it's worth in dollars moves with the rate until the money arrives.">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[420px]" role="img" aria-label="Euro to dollar rate rising from 1.08 to 1.12 between the invoice and the payment">
        {[1.07, 1.08, 1.09, 1.1, 1.11, 1.12, 1.13].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray="3 4" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{v.toFixed(2)}</text>
          </g>
        ))}
        {[{ d: 0, t: "Mar 1" }, { d: 31, t: "Apr 1" }, { d: 61, t: "May 1" }].map((m) => (
          <text key={m.t} x={x(m.d)} y={H - 10} textAnchor={m.d === 0 ? "start" : "middle"} className="fill-muted-foreground text-[11px]">{m.t}</text>
        ))}
        <polygon points={area} className="fill-emerald-500/15" />
        <line x1={x(2)} x2={x(65)} y1={y(1.08)} y2={y(1.08)} strokeDasharray="5 4" strokeWidth={1.5} className="stroke-foreground/50" />
        <polyline points={line} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-emerald-500" />
        {marks.map((m) => (
          <g key={m.t}>
            <circle cx={x(m.d)} cy={y(m.v)} r={5} className="fill-background stroke-foreground" strokeWidth={2} />
            <text x={x(m.d)} y={y(m.v) + m.dy} textAnchor={m.anchor} className="fill-foreground text-[12px] font-medium">{m.t}</text>
            <text x={x(m.d)} y={y(m.v) + m.dy + 15} textAnchor={m.anchor} className="fill-muted-foreground text-[11px]">{m.s}</text>
          </g>
        ))}
      </svg>
      <Legend
        items={[
          { swatch: "border-emerald-500", line: true, label: "Dollars per euro" },
          { swatch: "border-foreground/50", line: true, dashed: true, label: "The rate on the invoice date" },
          { swatch: "bg-emerald-500/30", label: "Your gain while you wait" },
        ]}
      />
    </Frame>
  );
}

/** The three moments a foreign-currency invoice is valued. */
export function FxMoments() {
  const rows: { when: string; rate: string; worth: number; t: Tone; what: string }[] = [
    { when: "Invoice sent", rate: "1.08", worth: 10800, t: "plain", what: "Recorded at $10,800: what's owed and your sales both use this rate." },
    { when: "Month end", rate: "1.10", worth: 11000, t: "info", what: "Still unpaid, now worth $11,000. A $200 unrealised gain is recorded, then undone the next day." },
    { when: "Customer pays", rate: "1.12", worth: 11200, t: "good", what: "$11,200 arrives. The $400 difference from the invoice is a realised gain." },
  ];
  return (
    <Frame caption="Unrealised means 'on paper, for now'. Realised means the money actually arrived at a different rate.">
      <ol className="grid gap-2 md:grid-cols-3">
        {rows.map((r, i) => (
          <li key={r.when} className="flex flex-col rounded-lg border border-border bg-background p-3.5">
            <div className="flex items-center justify-between">
              <Pill t={r.t}>{r.when}</Pill>
              <span className="text-[11px] tabular-nums text-muted-foreground">{i + 1} of 3</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-[18px] font-medium tabular-nums text-foreground">{usd(r.worth)}</span>
              <span className="font-mono text-[11.5px] text-muted-foreground">at {r.rate}</span>
            </div>
            <div className="mt-1.5 text-[12.5px] leading-[1.45] text-muted-foreground">{r.what}</div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

/* ======================================================== depreciation */

/** Book value of the same $10,000 asset under three methods, month by month. */
export function DepreciationCurves() {
  const W = 620, H = 270, pad = { l: 52, r: 16, t: 16, b: 34 };
  const cost = 10000, residual = 1000, n = 60;
  const x = (m: number) => pad.l + (m / n) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((cost - v) / cost) * (H - pad.t - pad.b);
  const straight: number[] = [], declining: number[] = [], syd: number[] = [];
  let dv = cost, sv = cost;
  const sum = (n * (n + 1)) / 2;
  for (let m = 0; m <= n; m++) {
    straight.push(cost - ((cost - residual) * m) / n);
    declining.push(dv);
    syd.push(sv);
    if (m < n) {
      const last = m === n - 1;
      dv = last ? residual : Math.max(residual, dv - dv * (2 / 5 / 12));
      sv = last ? residual : sv - ((cost - residual) * (n - m)) / sum;
    }
  }
  const pts = (arr: number[]) => arr.map((v, m) => `${x(m)},${y(v)}`).join(" ");
  return (
    <Frame caption="A $10,000 asset, 5-year life, $1,000 residual value. Every method ends at $1,000; they differ in how fast they get there.">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[420px]" role="img" aria-label="Book value over five years: straight line falls evenly; declining balance and sum of years' digits fall faster early on">
        {[0, 2500, 5000, 7500, 10000].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray={v ? "3 4" : undefined} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{v === 0 ? "$0" : `$${v / 1000}k`}</text>
          </g>
        ))}
        {[0, 1, 2, 3, 4, 5].map((yr) => (
          <text key={yr} x={x(yr * 12)} y={H - 10} textAnchor={yr === 0 ? "start" : yr === 5 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">{yr === 0 ? "Bought" : `Year ${yr}`}</text>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(residual)} y2={y(residual)} strokeDasharray="5 4" strokeWidth={1.5} className="stroke-foreground/40" />
        <text x={pad.l + 6} y={y(residual) + 15} className="fill-muted-foreground text-[11px]">Residual value $1,000</text>
        <polyline points={pts(syd)} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-amber-500" />
        <polyline points={pts(declining)} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-sky-500" />
        <polyline points={pts(straight)} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-foreground" />
      </svg>
      <Legend
        items={[
          { swatch: "border-foreground", line: true, label: "Straight line: $150 every month" },
          { swatch: "border-sky-500", line: true, label: "Declining balance: double the straight-line rate, on what's left" },
          { swatch: "border-amber-500", line: true, label: "Sum of years' digits: front-loaded" },
        ]}
      />
    </Frame>
  );
}

/** What you paid, split into value used up and current value, after one year. */
export function BookValueSplit() {
  const paid = 3500, used = 1000, end = 500;
  const pc = (v: number) => `${(v / paid) * 100}%`;
  return (
    <Frame caption="A $3,500 laptop over 36 months with $500 left at the end: ($3,500 - $500) / 36 = $83.33 a month. This is twelve months in.">
      <div className="text-[12px] text-muted-foreground">What you paid · <span className="font-mono text-foreground">$3,500.00</span></div>
      <div className="mt-2 flex h-10 overflow-hidden rounded-md text-[12px] font-medium">
        <div className="flex items-center justify-center bg-amber-400/90 text-amber-950" style={{ width: pc(used) }}>$1,000 used up</div>
        <div className="flex items-center justify-center bg-sky-500 text-white" style={{ width: pc(paid - used - end) }}>$2,000 still to use</div>
        <div className="flex items-center justify-center bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_6px,var(--color-background)_6px_12px)] text-foreground ring-1 ring-inset ring-border" style={{ width: pc(end) }}>$500</div>
      </div>
      <div className="mt-3 grid gap-2 text-[12.5px] sm:grid-cols-3">
        <div className="flex items-start gap-2"><span className={cn("mt-1 size-2.5 shrink-0 rounded-sm", fill.watch)} /><span><b className="font-medium text-foreground">Value used up so far</b><br /><span className="text-muted-foreground">Accumulated depreciation: 12 months of $83.33.</span></span></div>
        <div className="flex items-start gap-2"><span className="mt-1 size-2.5 shrink-0 rounded-sm bg-sky-500" /><span><b className="font-medium text-foreground">Current value</b><br /><span className="text-muted-foreground">$2,500: the blue part and the striped part together.</span></span></div>
        <div className="flex items-start gap-2"><span className="mt-1 size-2.5 shrink-0 rounded-sm ring-1 ring-border" /><span><b className="font-medium text-foreground">Value left at the end</b><br /><span className="text-muted-foreground">Residual value. It’s never written off.</span></span></div>
      </div>
    </Frame>
  );
}

/* ================================================== inventory costing */

function Units({ layers, sold, avg }: { layers: { n: number; cost: number; cls: string }[]; sold: number; avg?: boolean }) {
  let i = 0;
  return (
    <div className="flex flex-wrap gap-1.5">
      {layers.flatMap((l) =>
        Array.from({ length: l.n }, () => {
          const isSold = i++ < sold;
          return (
            <span
              key={i}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md font-mono text-[10px]",
                avg ? "bg-violet-200 text-violet-900 dark:bg-violet-500/30 dark:text-violet-100" : l.cls,
                isSold && "opacity-35 ring-2 ring-inset ring-foreground/50",
              )}
            >
              ${avg ? 5 : l.cost}
            </span>
          );
        }),
      )}
    </div>
  );
}

/** First in, first out against average cost, for the same purchases and the same sale. */
export function FifoVsAverage() {
  const layers = [
    { n: 10, cost: 4, cls: "bg-sky-200 text-sky-900 dark:bg-sky-500/30 dark:text-sky-100" },
    { n: 10, cost: 6, cls: "bg-amber-200 text-amber-900 dark:bg-amber-500/30 dark:text-amber-100" },
  ];
  const panel = (title: string, sub: string, avg: boolean, cogs: number, left: number, how: string) => (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-[14px] font-medium text-foreground">{title}</div>
      <div className="mb-3 text-[12px] text-muted-foreground">{sub}</div>
      <Units layers={layers} sold={12} avg={avg} />
      <div className="mt-3 text-[11.5px] text-muted-foreground">{how}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[12.5px]">
        <div><div className="text-muted-foreground">Cost of the 12 sold</div><div className="font-mono text-[16px] font-medium text-foreground">{usd(cogs)}</div></div>
        <div><div className="text-muted-foreground">Value of the 8 left</div><div className="font-mono text-[16px] font-medium text-foreground">{usd(left)}</div></div>
      </div>
    </div>
  );
  return (
    <Frame caption="You bought 10 units at $4, then 10 more at $6, and sold 12. Faded squares are the units that went out.">
      <div className="grid gap-3 md:grid-cols-2">
        {panel("First in, first out", "The oldest units go out first", false, 52, 48, "10 at $4 + 2 at $6 = $52")}
        {panel("Average cost", "Every unit costs the average: $100 / 20 = $5", true, 60, 40, "12 at $5 = $60")}
      </div>
      <Legend
        items={[
          { swatch: "bg-sky-200 dark:bg-sky-500/30", label: "Bought first at $4" },
          { swatch: "bg-amber-200 dark:bg-amber-500/30", label: "Bought later at $6" },
          { swatch: "bg-violet-200 dark:bg-violet-500/30", label: "Blended at the average, $5" },
        ]}
      />
    </Frame>
  );
}

/** How stock moves from a purchase to a cost on the profit and loss. */
export function StockJourney() {
  const steps = [
    { title: "You buy 20 units", body: "A bill for $100. Stock goes up, not expenses.", k: "asset" as Kind },
    { title: "Inventory", body: "An asset on the balance sheet until it sells: $100.", k: "asset" as Kind },
    { title: "You sell 12", body: "Sending the invoice records the sale and its cost.", k: "revenue" as Kind },
    { title: "Cost of goods sold", body: "$60 moves from Inventory to an expense. $40 stays in stock.", k: "expense" as Kind },
  ];
  return (
    <Frame caption="Stock you buy is an asset. It only becomes an expense when it sells, at the cost the costing method gives it.">
      <FlowRow>
        {steps.map((s) => (
          <div key={s.title} className="h-full rounded-lg border border-border bg-background px-4 py-3">
            <KindChip k={s.k} />
            <div className="mt-2 text-[14px] font-medium text-foreground">{s.title}</div>
            <div className="mt-1 text-[12.5px] leading-[1.5] text-muted-foreground">{s.body}</div>
          </div>
        ))}
      </FlowRow>
    </Frame>
  );
}

/* ======================================================= payroll basics */

/** From pay before deductions to take-home, as a waterfall. */
export function GrossToNet() {
  const gross = 5000;
  const steps = [
    { label: "Pay before deductions", v: 5000, kind: "total" as const },
    { label: "Federal income tax withheld", v: -520, kind: "step" as const, note: "from your tax tables" },
    { label: "Social Security, 6.2%", v: -310, kind: "step" as const },
    { label: "Medicare, 1.45%", v: -72.5, kind: "step" as const },
    { label: "Take-home pay", v: 4097.5, kind: "total" as const },
  ];
  let run = gross;
  return (
    <Frame caption="One month for one employee on a $60,000 salary. The income tax figure is an example: dubbl works it out from the federal tax tables you set up.">
      <div className="space-y-2.5">
        {steps.map((s) => {
          const start = s.kind === "total" ? 0 : run + s.v;
          const width = s.kind === "total" ? s.v : -s.v;
          if (s.kind === "step") run += s.v;
          return (
            <div key={s.label} className="grid grid-cols-[1.2fr_2fr_90px] items-center gap-3 text-[12.5px] max-sm:grid-cols-[1fr_90px]">
              <span className={cn("text-foreground", s.kind === "total" && "font-medium")}>
                {s.label}
                {"note" in s && s.note && <span className="ml-1.5 text-[11.5px] text-muted-foreground">({s.note})</span>}
              </span>
              <span className="relative h-5 rounded bg-muted max-sm:hidden">
                <span
                  className={cn("absolute inset-y-0 rounded", s.kind === "total" ? (s.v === gross ? "bg-foreground/80" : "bg-emerald-500") : "bg-rose-500")}
                  style={{ left: `${(start / gross) * 100}%`, width: `${Math.max(0.6, (width / gross) * 100)}%` }}
                />
              </span>
              <span className={cn("text-right font-mono tabular-nums", s.kind === "total" ? "font-medium text-foreground" : "text-rose-600 dark:text-rose-300")}>{s.kind === "total" ? usd(s.v, true) : usd(s.v, true)}</span>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

/** What a month of pay costs you, and who ends up with the money. */
export function PayrollWhoGetsWhat() {
  const total = 5412.5;
  const bar = (title: string, parts: { label: string; v: number; cls: string }[]) => (
    <div>
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className="font-medium text-foreground">{title}</span>
        <span className="font-mono text-foreground">{usd(total, true)}</span>
      </div>
      <div className="mt-1.5 flex h-8 overflow-hidden rounded-md">
        {parts.map((p) => (
          <div key={p.label} className={p.cls} style={{ width: `${(p.v / total) * 100}%` }} title={`${p.label}: ${usd(p.v, true)}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", p.cls)} />
            {p.label} <span className="font-mono text-foreground">{usd(p.v, true)}</span>
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <Frame caption="The same month as above. Your cost is more than the salary, because you pay employer taxes on top. FUTA is 0.6% of the first $7,000 of each person's pay in a year.">
      <div className="space-y-5">
        {bar("What it costs you", [
          { label: "Pay before deductions", v: 5000, cls: "bg-foreground/75" },
          { label: "Employer Social Security and Medicare", v: 382.5, cls: "bg-amber-400" },
          { label: "Employer FUTA", v: 30, cls: "bg-amber-600" },
        ])}
        {bar("Who receives it", [
          { label: "The employee (take-home)", v: 4097.5, cls: "bg-emerald-500" },
          { label: "The tax office", v: 1315, cls: "bg-sky-500" },
        ])}
      </div>
    </Frame>
  );
}

/* ================================================= closing the books */

const CLOSE_STEPS: { title: string; body: string; where: string }[] = [
  { title: "Get every bank line in", body: "Import statements and give every transaction a category.", where: "Bank accounts" },
  { title: "Match the statement", body: "Reconcile each account until the difference is $0.00.", where: "Match statement to your books" },
  { title: "Check who owes what", body: "Chase late invoices. Make sure every bill is entered.", where: "Aged receivables, Aged payables" },
  { title: "Record the adjustments", body: "Value drops on assets, the next month of each accrual, loan payments.", where: "Record value drops, Record next month" },
  { title: "Read the reports", body: "Does profit look right? Does the balance sheet look right?", where: "Profit and loss, Balance sheet" },
  { title: "Lock the month", body: "Stop anyone changing a period you've finished.", where: "Lock past dates" },
];

/** The month-end close as a checklist. */
export function MonthEndChecklist() {
  return (
    <Frame caption="The same six steps every month. The last line of each card is where you do it in dubbl.">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CLOSE_STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-lg border border-border bg-background p-3.5">
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[12px] font-medium text-background">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-foreground">{s.title}</div>
              <div className="mt-0.5 text-[12.5px] leading-[1.45] text-muted-foreground">{s.body}</div>
              <div className="mt-1.5 text-[12px] font-medium text-foreground/80">{s.where}</div>
            </div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

/** Closing a year: the year's income and costs move into retained earnings. */
export function YearEndClose() {
  const pl: { k: Kind; name: string; v: number }[] = [
    { k: "revenue", name: "Sales", v: 120000 },
    { k: "expense", name: "Rent", v: -24000 },
    { k: "expense", name: "Wages and salaries", v: -48000 },
    { k: "expense", name: "Everything else", v: -13000 },
  ];
  return (
    <Frame caption="Closing the year moves its $35,000 profit into Retained Earnings and starts the income and expense accounts again from zero.">
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-lg border border-border bg-background p-4">
          <Label>Dec 31, before closing</Label>
          <div className="mt-2 space-y-1.5">
            {pl.map((r) => (
              <div key={r.name} className="flex items-center gap-2 text-[12.5px]">
                <Dot k={r.k} />
                <span className="flex-1 text-foreground/85">{r.name}</span>
                <span className="font-mono tabular-nums text-foreground">{usd(r.v)}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 border-t border-border pt-1.5 text-[12.5px] font-medium">
              <span className="flex-1 text-foreground">Profit for the year</span>
              <span className="font-mono tabular-nums text-foreground">$35,000</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <Arrow label="Year-end closing entry" />
        </div>
        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2"><KindChip k="equity" /><span className="text-[13.5px] font-medium text-foreground">Retained Earnings</span></div>
            <div className="mt-2 font-mono text-[18px] font-medium text-emerald-700 dark:text-emerald-300">+$35,000</div>
            <div className="text-[12px] text-muted-foreground">Profit kept in the business, carried forward for good.</div>
          </div>
          <div className="rounded-lg border border-dashed border-border px-4 py-3">
            <div className="text-[13px] font-medium text-foreground">Jan 1: a fresh start</div>
            <div className="text-[12px] text-muted-foreground">Sales, rent and wages all begin the new year at $0. The year is locked.</div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ================================================== for solopreneurs */

/** Where a solo business's money goes, from customer to your own pocket. */
export function SoloMoneyMap() {
  const out = [
    { title: "Business costs", body: "Software, equipment, travel. Each one is an expense.", k: "expense" as Kind },
    { title: "Money for tax", body: "Set some aside as you go, so the bill isn't a surprise.", k: "liability" as Kind },
    { title: "Pay yourself", body: "Move money to your personal account: an owner's draw.", k: "equity" as Kind },
  ];
  return (
    <Frame caption="Keep one business bank account. Money comes in from customers, and leaves only through these three doors.">
      <div className="grid items-center gap-3 md:grid-cols-[0.9fr_auto_1fr_auto_1.2fr]">
        <Box title="Customers">They pay your invoices.</Box>
        <Arrow />
        <div className="rounded-lg border border-foreground/60 bg-background px-4 py-3">
          <div className="flex items-center gap-2"><KindChip k="asset" /></div>
          <div className="mt-2 text-[14px] font-medium text-foreground">Business bank account</div>
          <div className="mt-1 text-[12.5px] leading-[1.5] text-muted-foreground">Only business money, in and out. Never your groceries.</div>
        </div>
        <Arrow />
        <div className="space-y-2">
          {out.map((o) => (
            <div key={o.title} className="rounded-lg border border-border bg-background px-3.5 py-2.5">
              <div className="flex items-center gap-2"><Dot k={o.k} /><span className="text-[13.5px] font-medium text-foreground">{o.title}</span></div>
              <div className="mt-0.5 text-[12px] leading-[1.45] text-muted-foreground">{o.body}</div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

const RHYTHM: { when: string; t: Tone; items: string[] }[] = [
  { when: "Every week", t: "plain", items: ["Send invoices for finished work", "Categorize new bank lines", "Snap and attach receipts"] },
  { when: "Every month", t: "info", items: ["Reconcile your bank and card accounts", "Chase anything overdue", "Read your profit and loss"] },
  { when: "Every quarter", t: "watch", items: ["File VAT or sales tax if you're registered", "Check what to set aside for income tax"] },
  { when: "Every year", t: "good", items: ["Close the financial year", "Hand your reports to your accountant"] },
];

/** A solo bookkeeping routine, from weekly to yearly. */
export function SoloRhythm() {
  return (
    <Frame caption="Little and often. Ten minutes a week beats a lost weekend in April.">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {RHYTHM.map((r) => (
          <div key={r.when} className="rounded-lg border border-border bg-background p-3.5">
            <Pill t={r.t}>{r.when}</Pill>
            <ul className="mt-3 space-y-1.5 text-[12.5px] text-foreground/85">
              {r.items.map((i) => (
                <li key={i} className="flex gap-2"><span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", fill[r.t])} />{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Frame>
  );
}
