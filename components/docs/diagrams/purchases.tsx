// Diagrams for the purchases and banking docs, built from the primitives in ./frame.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Amount, Arrow, Frame, Label, Pill, type Tone } from "./frame";

/* ------------------------------------------------------------ purchasing */

/** Requisition to payment: the optional steps before a bill, and what each one does. */
export function PurchaseToPayFlow() {
  const steps: { name: string; pill: string; t: Tone; note: string; optional?: boolean }[] = [
    { name: "Requisition", pill: "Approved", t: "info", note: "Someone asks to buy something and a manager says yes.", optional: true },
    { name: "Purchase order", pill: "Ordered", t: "info", note: "You tell the supplier what you'll buy, at what price.", optional: true },
    { name: "Goods received", pill: "All items in", t: "good", note: "The delivery arrives. Stock goes up.", optional: true },
    { name: "Bill", pill: "To pay", t: "watch", note: "The supplier's invoice. Now you owe them." },
    { name: "Payment", pill: "Paid", t: "good", note: "Money leaves the bank. You owe nothing." },
  ];
  return (
    <Frame caption="Only the bill and the payment are required. Add the earlier steps when you want approval before spending, or a record of what you ordered and received.">
      <div className="grid items-stretch gap-1.5 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
        {steps.flatMap((s, i) => [
          <div key={s.name} className={cn("flex min-w-0 flex-col rounded-lg border bg-background px-3 py-3", s.optional ? "border-dashed border-border" : "border-foreground/50")}>
            <span className="text-[13px] font-medium leading-tight text-foreground">{s.name}</span>
            <span className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{s.optional ? "optional" : "required"}</span>
            <div className="mt-2"><Pill t={s.t}>{s.pill}</Pill></div>
            <div className="mt-2 text-[12px] leading-[1.45] text-muted-foreground">{s.note}</div>
          </div>,
          ...(i < steps.length - 1 ? [<Arrow key={`${s.name}-arrow`} />] : []),
        ])}
      </div>
    </Frame>
  );
}

/** Three-way match: the order, the delivery and the bill compared line by line, with a price tolerance. */
export function ThreeWayMatchCheck() {
  const col = (title: string, doc: string, qty: string, price: ReactNode, t: Tone) => (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] font-medium text-foreground">{title}</span>
        <Pill t={t}>{doc}</Pill>
      </div>
      <div className="mt-3 text-[12.5px] text-muted-foreground">Ergonomic chairs</div>
      <div className="mt-1 flex items-baseline justify-between text-[13px]">
        <span className="font-mono tabular-nums text-foreground">{qty}</span>
        <span className="text-foreground">{price}</span>
      </div>
    </div>
  );
  const row = (what: string, detail: string, verdict: string, t: Tone) => (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-1 py-2.5 text-[12.5px]">
      <span className="font-medium text-foreground">{what}</span>
      <span className="flex-1 text-muted-foreground">{detail}</span>
      <Pill t={t}>{verdict}</Pill>
    </div>
  );
  return (
    <Frame caption="With Allowed price difference set to 2%, a bill $5 a chair over the order still goes through. At 0% you'd get a warning, or a block if Block bills that charge more than ordered is on.">
      <div className="grid gap-3 md:grid-cols-3">
        {col("What you ordered", "PO-00012", "10 units", <><Amount cents={32500} /> each</>, "info")}
        {col("What arrived", "Goods received", "10 units", <span className="text-muted-foreground">counted, not priced</span>, "good")}
        {col("What you're billed", "Bill", "10 units", <><Amount cents={33000} /> each</>, "watch")}
      </div>
      <div className="mt-4">
        <Label className="mb-1">The check, when the bill goes into your books</Label>
        {row("Quantity", "Billed 10, received 10, ordered 10.", "Matches", "good")}
        {row("Price", "$330.00 against $325.00 ordered: 1.5% over, inside the 2% you allow.", "Within tolerance", "watch")}
        {row("Result", "The bill posts. The $50 difference is booked as a price variance, or added to the value of chairs still in stock.", "Posted", "good")}
      </div>
    </Frame>
  );
}

/** A supplier credit taken off a bill: what you owe drops by the credit. */
export function SupplierCreditOffset() {
  const bill = 120000;
  const credit = 8500;
  const pct = (credit / bill) * 100;
  return (
    <Frame caption="Using a supplier credit against a bill reduces what you owe on that bill. No money moves; you pay the rest as usual.">
      <div className="space-y-3 text-[12.5px]">
        <div className="grid grid-cols-[180px_1fr_100px] items-center gap-3 max-sm:grid-cols-[1fr_90px]">
          <span className="text-foreground">Bill from Office Depot</span>
          <span className="h-5 rounded bg-foreground/80 max-sm:hidden" />
          <Amount cents={bill} className="text-right text-foreground" />
        </div>
        <div className="grid grid-cols-[180px_1fr_100px] items-center gap-3 max-sm:grid-cols-[1fr_90px]">
          <span className="text-foreground">Supplier credit DN-00001</span>
          <span className="relative h-5 rounded bg-muted max-sm:hidden">
            <span className="absolute inset-y-0 right-0 rounded bg-emerald-500" style={{ width: `${pct}%` }} />
          </span>
          <Amount cents={-credit} className="text-right text-emerald-700 dark:text-emerald-300" />
        </div>
        <div className="grid grid-cols-[180px_1fr_100px] items-center gap-3 border-t border-border pt-3 max-sm:grid-cols-[1fr_90px]">
          <span className="font-medium text-foreground">Still to pay</span>
          <span className="relative h-5 rounded bg-muted max-sm:hidden">
            <span className="absolute inset-y-0 left-0 rounded bg-amber-400" style={{ width: `${100 - pct}%` }} />
          </span>
          <Amount cents={bill - credit} className="text-right font-medium text-foreground" />
        </div>
      </div>
    </Frame>
  );
}

/** A payment batch: several bills chosen, paid in one go, then remittance advice per supplier. */
export function PaymentBatchRun() {
  const bills = [
    { n: "BILL-00009", who: "AWS", cents: 48000 },
    { n: "BILL-00011", who: "Office Depot", cents: 115000 },
    { n: "BILL-00012", who: "Landlord Properties", cents: 350000 },
  ];
  const total = bills.reduce((s, b) => s + b.cents, 0);
  return (
    <Frame caption="Submitting the batch records one payment per bill, dated today. If one bill can't be paid, it's marked failed and the rest still go through.">
      <div className="grid items-center gap-2 md:grid-cols-[1.2fr_auto_1fr_auto_1fr]">
        <div className="rounded-lg border border-border bg-background">
          <div className="border-b border-border px-3.5 py-2"><Label>Bills you pick</Label></div>
          {bills.map((b) => (
            <div key={b.n} className="flex items-center justify-between gap-3 border-b border-border/70 px-3.5 py-2 text-[12.5px] last:border-b-0">
              <span className="min-w-0"><span className="block font-mono text-[12px] text-foreground">{b.n}</span><span className="block text-[11.5px] text-muted-foreground">{b.who}</span></span>
              <Amount cents={b.cents} className="text-foreground" />
            </div>
          ))}
        </div>
        <Arrow label="Submit Batch" />
        <div className="rounded-lg border border-foreground/50 bg-background px-4 py-3">
          <div className="text-[13.5px] font-medium text-foreground">October supplier run</div>
          <div className="mt-1.5"><Pill t="good">completed</Pill></div>
          <div className="mt-2 text-[12.5px] text-muted-foreground">3 payments, by bank transfer</div>
          <Amount cents={total} className="mt-1 block text-[15px] font-medium text-foreground" />
        </div>
        <Arrow />
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <div className="text-[13.5px] font-medium text-foreground">Remittance advice</div>
          <div className="mt-1 text-[12.5px] leading-[1.5] text-muted-foreground">One email per supplier listing the bills you paid them.</div>
          <div className="mt-2"><Pill t="info">Email to suppliers</Pill></div>
        </div>
      </div>
    </Frame>
  );
}

/** A recurring bill schedule: each run date makes a draft bill, and missed dates are caught up. */
export function RecurringBillTimeline() {
  const runs = [
    { d: "Jul 1", s: "Draft bill", t: "plain" as Tone },
    { d: "Aug 1", s: "Draft bill", t: "plain" as Tone },
    { d: "Sep 1", s: "Draft bill", t: "plain" as Tone },
    { d: "Oct 1", s: "Draft bill", t: "plain" as Tone },
    { d: "Nov 1", s: "Finished", t: "bad" as Tone },
  ];
  return (
    <Frame caption="Monthly, starting Jul 1, max occurrences 4. Each bill is dated on its run date and due after the supplier's payment terms (30 days if none). After the fourth, the schedule shows Finished.">
      <div className="relative">
        <div className="absolute left-0 right-0 top-[9px] h-px bg-border" />
        <div className="relative grid grid-cols-5 gap-2">
          {runs.map((r, i) => (
            <div key={r.d} className="flex flex-col items-center text-center">
              <span className={cn("size-[18px] rounded-full border-2 bg-card", i < 4 ? "border-foreground/70" : "border-dashed border-muted-foreground/60")} />
              <span className="mt-2 font-mono text-[12px] text-foreground">{r.d}</span>
              <span className="mt-1.5"><Pill t={r.t}>{r.s}</Pill></span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------------------- banking */

/** One statement line on its way into the books: imported, categorized, posted. */
export function BankLineToLedger() {
  const field = (k: string, v: string) => (
    <div>
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div className="text-[13px] text-foreground">{v}</div>
    </div>
  );
  const leg = (side: "Dr" | "Cr", account: string) => (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span className={cn("text-foreground", side === "Cr" && "pl-3")}>{account}</span>
      <span className="whitespace-nowrap text-muted-foreground">{side} <Amount cents={48000} className="text-foreground" /></span>
    </div>
  );
  return (
    <Frame caption="Until you categorize it, a bank line is only a record of what the bank did. Categorizing it posts the entry, and the line moves from To do to Done.">
      <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr_auto_1.25fr]">
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <Label>Statement line</Label>
          <div className="mt-2 text-[13.5px] font-medium text-foreground">AWS EMEA</div>
          <Amount cents={-48000} className="text-[13px] text-rose-600 dark:text-rose-300" />
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">2026-10-02</div>
          <div className="mt-2"><Pill t="watch">to do</Pill></div>
        </div>
        <Arrow label="Categorize" />
        <div className="space-y-2 rounded-lg border border-foreground/50 bg-background px-4 py-3">
          <Label>You say what it was</Label>
          {field("What was this?", "A business cost")}
          {field("Category", "Software & Subscriptions")}
          {field("Contact", "AWS")}
        </div>
        <Arrow />
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <Label>Posted to your books</Label>
          <div className="mt-2 space-y-1.5">
            {leg("Dr", "Software & Subscriptions")}
            {leg("Cr", "Checking Account")}
          </div>
          <div className="mt-2.5"><Pill t="good">in your books</Pill></div>
        </div>
      </div>
    </Frame>
  );
}

/** A bank rule applied at import: conditions checked in priority order, the first match pre-fills the line. */
export function BankRuleMatch() {
  const rules = [
    { p: 10, name: "AWS hosting", cond: "Description contains \"AWS\"", hit: true },
    { p: 5, name: "Card fees", cond: "Description starts with \"FEE\"", hit: false },
    { p: 0, name: "Big payments", cond: "Amount is more than 5,000.00", hit: false },
  ];
  return (
    <Frame caption="Rules with a higher Priority are checked first. The first one that matches fills in the category, tax and contact, so the line is ready for you to confirm.">
      <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1.5fr_auto_1fr]">
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <Label>Imported line</Label>
          <div className="mt-2 text-[13.5px] font-medium text-foreground">AWS EMEA</div>
          <Amount cents={-48000} className="text-[13px] text-rose-600 dark:text-rose-300" />
        </div>
        <Arrow />
        <div className="space-y-1.5">
          {rules.map((r) => (
            <div key={r.name} className={cn("flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-[12.5px]", r.hit ? "border-emerald-400 dark:border-emerald-500/60" : "border-border opacity-60")}>
              <span className="min-w-0">
                <span className="text-foreground">{r.name}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">{r.cond}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">P{r.p}</span>
                {r.hit ? <Pill t="good">match</Pill> : <Pill>skipped</Pill>}
              </span>
            </div>
          ))}
        </div>
        <Arrow />
        <div className="rounded-lg border border-border bg-background px-4 py-3 text-[12.5px]">
          <Label>Pre-filled</Label>
          <div className="mt-2 space-y-1.5">
            <div><div className="text-[11px] text-muted-foreground">Category</div><div className="text-[13px] text-foreground">Software &amp; Subscriptions</div></div>
            <div><div className="text-[11px] text-muted-foreground">Contact</div><div className="text-[13px] text-foreground">AWS</div></div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** Reconciliation: the books balance steps toward the statement balance until the difference is zero. */
export function StatementConvergence() {
  const statement = 1213500;
  const points = [
    { label: "Start", books: 1266000, note: "" },
    { label: "Add AWS charge", books: 1218000, note: "-$480.00" },
    { label: "Add Figma Pro", books: 1213500, note: "-$45.00" },
  ];
  const W = 640, H = 220, padL = 16, padR = 150, top = 26, bottom = 46;
  // A square-root scale, so a $45 gap is still visible next to a $525 one.
  const maxGap = Math.max(...points.map((p) => Math.abs(p.books - statement)));
  const sy = H - bottom - 12;
  const y = (c: number) => sy - Math.sqrt(Math.abs(c - statement) / maxGap) * (sy - top);
  const step = (W - padL - padR) / points.length;
  const x0 = (i: number) => padL + i * step;
  return (
    <Frame caption="Statement closing balance $12,135.00. Each line you add to your books moves its balance toward the statement. When the difference reads $0.00, finish the statement check.">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="Books balance stepping down to meet the statement balance">
        <line x1={padL} x2={W - padR + 8} y1={sy} y2={sy} className="stroke-sky-500" strokeWidth={1.5} strokeDasharray="5 4" />
        <text x={W - padR + 14} y={sy + 4} className="fill-sky-700 text-[11.5px] dark:fill-sky-300">Bank statement</text>
        {points.map((p, i) => {
          const py = y(p.books);
          const diff = statement - p.books;
          const done = diff === 0;
          return (
            <g key={p.label}>
              <line x1={x0(i)} x2={x0(i + 1)} y1={py} y2={py} className="stroke-foreground" strokeWidth={2} />
              {i > 0 && <line x1={x0(i)} x2={x0(i)} y1={y(points[i - 1].books)} y2={py} className="stroke-foreground" strokeWidth={2} />}
              {!done && <line x1={x0(i) + step / 2} x2={x0(i) + step / 2} y1={py + 4} y2={sy - 4} className="stroke-amber-500" strokeWidth={1.25} />}
              <text x={done ? x0(i) + step / 2 : x0(i) + step / 2 + 8} y={done ? py - 10 : (py + sy) / 2 + 4} textAnchor={done ? "middle" : "start"} className={cn("text-[11.5px]", done ? "fill-emerald-700 dark:fill-emerald-300" : "fill-amber-700 dark:fill-amber-300")}>
                {done ? (
                  "Difference $0.00"
                ) : (
                  <>
                    <tspan x={x0(i) + step / 2 + 8} dy="-0.6em">Difference</tspan>
                    <tspan x={x0(i) + step / 2 + 8} dy="1.25em" className="font-mono">{`-$${(Math.abs(diff) / 100).toFixed(2)}`}</tspan>
                  </>
                )}
              </text>
              <text x={x0(i) + step / 2} y={H - 26} textAnchor="middle" className="fill-foreground text-[11.5px]">{p.label}</text>
              {p.note && <text x={x0(i) + step / 2} y={H - 11} textAnchor="middle" className="fill-muted-foreground font-mono text-[10.5px]">{p.note}</text>}
            </g>
          );
        })}
        <text x={x0(points.length) + 14} y={sy - 12} className="fill-foreground text-[11.5px]">Your books</text>
      </svg>
    </Frame>
  );
}

/** Where each banking screen fits: import, categorize, reconcile. */
export function BankingLoop() {
  const stage = (n: number, title: string, body: string, t: Tone, pill: string) => (
    <div className="flex-1 rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-muted font-mono text-[11px] text-foreground">{n}</span>
        <span className="text-[13.5px] font-medium text-foreground">{title}</span>
      </div>
      <div className="mt-1.5 text-[12.5px] leading-[1.5] text-muted-foreground">{body}</div>
      <div className="mt-2"><Pill t={t}>{pill}</Pill></div>
    </div>
  );
  return (
    <Frame caption="The same line passes through all three: it arrives as to do, becomes in your books, and ends matched to a statement.">
      <div className="flex items-stretch gap-2 max-md:flex-col">
        {stage(1, "Import", "Bring in the bank's statement file. Each line lands on the account.", "watch", "to do")}
        <Arrow />
        {stage(2, "Categorize", "Say what each line was, or link it to a bill, invoice or transfer.", "good", "in your books")}
        <Arrow />
        {stage(3, "Reconcile", "Tick the lines off against the statement until the difference is zero.", "info", "matched to statement")}
      </div>
    </Frame>
  );
}
