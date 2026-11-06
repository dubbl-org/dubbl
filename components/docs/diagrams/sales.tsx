// Diagrams for the getting started, sales and contacts docs, built from the primitives in ./frame.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Amount, Arrow, Frame, Label, Pill, type Tone } from "./frame";

/* ------------------------------------------------------------ getting started */

/** The app's layout: rail, panel, top bar and the page itself. */
export function AppShellMap() {
  const railIcons = ["Tilly", "Overview", "Contacts", "Sales", "Purchases", "Accounting", "Tax"];
  return (
    <Frame caption="The same four parts on every page. Pick an area in the rail, a page in the panel, and work in the middle.">
      <div className="grid min-w-[600px] grid-cols-[88px_150px_1fr] gap-2 text-[12px]">
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-1.5 py-3">
          <span className="mb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Rail</span>
          {railIcons.map((n, i) => (
            <span key={n} className={cn("w-full truncate rounded-md px-1 py-1 text-center text-[10.5px]", i === 3 ? "bg-foreground/10 text-foreground" : "text-muted-foreground")}>{n}</span>
          ))}
          <span className="mt-auto text-[10.5px] text-muted-foreground">Help</span>
          <span className="text-[10.5px] text-muted-foreground">Settings</span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 px-2.5 py-3">
          <span className="mb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Panel</span>
          <span className="font-medium text-foreground">Demo Company</span>
          <span className="mt-2 text-[10.5px] text-muted-foreground">Sales</span>
          {["Invoices", "Quotes", "Cash sales", "Credit notes"].map((n, i) => (
            <span key={n} className={cn("rounded-md px-1.5 py-1", i === 0 ? "bg-foreground/10 text-foreground" : "text-muted-foreground")}>{n}</span>
          ))}
          <span className="mt-2 text-[10.5px] text-muted-foreground">Getting paid</span>
          {["Payments", "Prepayments"].map((n) => (
            <span key={n} className="px-1.5 py-1 text-muted-foreground">{n}</span>
          ))}
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2.5">
          <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
            <span className="text-muted-foreground">Sales / <span className="text-foreground">Invoices</span></span>
            <span className="ml-auto rounded-md bg-muted px-2 py-0.5 text-muted-foreground">Search ⌘K</span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">Ask Tilly</span>
            <span className="rounded-md bg-foreground px-2 py-0.5 text-background">+ New Invoice</span>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Top bar</span>
          <div className="flex flex-1 flex-col gap-2 rounded-md border border-dashed border-border p-2.5">
            <div className="grid grid-cols-4 gap-1.5">
              {["Owed to you", "Overdue", "Collected", "Drafts"].map((n) => (
                <span key={n} className="rounded border border-border px-1.5 py-1.5 text-[10.5px] text-muted-foreground">{n}</span>
              ))}
            </div>
            <div className="space-y-1">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-4 rounded bg-muted" />
              ))}
            </div>
            <span className="mt-auto text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">The page</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** Onboarding: the wizard, what dubbl sets up from your answers, and the checklist after. */
export function SetupPath() {
  const steps = ["Organization", "Country", "Business type", "Tax & year", "Industry", "Referral", "Review"];
  const made = [
    { what: "Base currency", from: "from your country" },
    { what: "Chart of accounts", from: "a template for your country" },
    { what: "Tax rates", from: "standard rates, or no tax if you aren't registered" },
    { what: "Financial year", from: "your country's usual start month" },
  ];
  const todo = ["Add a bank account", "Set opening balances", "Set up tax", "Create your first invoice"];
  return (
    <Frame caption="Industry and Referral can be skipped. Nothing is saved until you press Complete Setup.">
      <div className="grid items-stretch gap-2 md:grid-cols-[1fr_auto_1.15fr_auto_1fr]">
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <Label>1. The wizard</Label>
          <ol className="mt-2.5 space-y-1 text-[12.5px]">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">{i + 1}</span>
                <span className={i === 4 || i === 5 ? "text-muted-foreground" : "text-foreground"}>{s}</span>
                {(i === 4 || i === 5) && <span className="text-[10.5px] text-muted-foreground">optional</span>}
              </li>
            ))}
          </ol>
        </div>
        <Arrow label="Complete Setup" />
        <div className="rounded-lg border border-foreground/50 bg-background px-4 py-3">
          <Label>2. dubbl sets up</Label>
          <div className="mt-2.5 space-y-2">
            {made.map((m) => (
              <div key={m.what} className="text-[12.5px]">
                <div className="font-medium text-foreground">{m.what}</div>
                <div className="text-muted-foreground">{m.from}</div>
              </div>
            ))}
          </div>
        </div>
        <Arrow />
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <Label>3. Getting started</Label>
          <ul className="mt-2.5 space-y-1.5 text-[12.5px]">
            {todo.map((t) => (
              <li key={t} className="flex items-center gap-2 text-foreground">
                <span className="size-3.5 rounded-full border border-border" />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-2.5 text-[11.5px] text-muted-foreground">A checklist on the Overview page.</div>
        </div>
      </div>
    </Frame>
  );
}

/** Import order: what has to exist before each kind of data can come in. */
export function ImportOrder() {
  const col = (step: string, title: string, items: string[], note: string) => (
    <div className="flex-1 rounded-lg border border-border bg-background px-4 py-3">
      <Label>{step}</Label>
      <div className="mt-1 text-[13.5px] font-medium text-foreground">{title}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <Pill key={i}>{i}</Pill>
        ))}
      </div>
      <div className="mt-2 text-[12px] leading-[1.45] text-muted-foreground">{note}</div>
    </div>
  );
  return (
    <Frame caption="Each card on the import page shows what it needs first. Importing in this order means every row can find its account or contact.">
      <div className="flex items-stretch gap-2 max-md:flex-col">
        {col("First", "Accounts and contacts", ["Chart of Accounts", "Contacts"], "No dependencies.")}
        <Arrow />
        {col("Then", "Things that point at accounts", ["Products", "Journal Entries", "Bank Transactions"], "Each row names an account code.")}
        <Arrow />
        {col("Last", "Documents", ["Invoices", "Bills"], "Need the contact and the accounts to exist.")}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------ sales */

/** Which sales screen to use for money coming in. */
export function MoneyInChooser() {
  const cards: { when: string; use: string; where: string; t: Tone }[] = [
    { when: "You sent an invoice and they paid it", use: "Record payment", where: "On the invoice", t: "good" },
    { when: "They paid on the spot and there's no invoice", use: "Cash sale", where: "Sales › Cash sales", t: "info" },
    { when: "They paid before you've invoiced", use: "Prepayment", where: "Sales › Prepayments", t: "watch" },
    { when: "You need to reduce what they owe", use: "Credit note", where: "Sales › Credit notes", t: "plain" },
  ];
  return (
    <Frame caption="Pick by what happened, not by how the money arrived.">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.use} className="flex flex-col rounded-lg border border-border bg-background px-3.5 py-3">
            <div className="text-[12.5px] leading-[1.45] text-muted-foreground">{c.when}</div>
            <div className="mt-auto pt-3">
              <Pill t={c.t}>{c.use}</Pill>
              <div className="mt-1.5 text-[11.5px] text-muted-foreground">{c.where}</div>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Quote to invoice: the statuses and who moves it along. */
export function QuoteToInvoiceFlow() {
  const step = (pill: string, t: Tone, title: string, note: ReactNode, strong?: boolean) => (
    <div className={cn("flex min-w-0 flex-1 flex-col rounded-lg border bg-background px-3.5 py-3", strong ? "border-foreground/50" : "border-border")}>
      <div><Pill t={t}>{pill}</Pill></div>
      <div className="mt-2 text-[13.5px] font-medium text-foreground">{title}</div>
      <div className="mt-1 text-[12px] leading-[1.45] text-muted-foreground">{note}</div>
    </div>
  );
  return (
    <Frame caption="A quote never touches your books. Only the invoice you create from it does, once you send that invoice.">
      <div className="flex items-stretch gap-2 max-md:flex-col">
        {step("Draft", "plain", "You write it", "Customer, lines and an expiry date.")}
        <Arrow label="Send" />
        {step("Sent", "info", "They read it", "The email links to their portal, where they can accept it.")}
        <Arrow label="Accept" />
        {step("Accepted", "good", "They said yes", "You mark it, or they accept in the portal.")}
        <Arrow label="Create invoice" />
        {step("Invoiced", "good", "A draft invoice", "Same lines, dated today, due on their payment terms.", true)}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-2"><Pill t="bad">Declined</Pill> when they say no</span>
        <span className="flex items-center gap-2"><Pill t="watch">Expired</Pill> set overnight once a sent quote passes its expiry date</span>
      </div>
    </Frame>
  );
}

/** A credit note used against an invoice: the balance drops, no money moves. */
export function CreditNoteOffset() {
  const inv = 150000;
  const credit = 30000;
  const pct = (credit / inv) * 100;
  const row = (label: ReactNode, bar: ReactNode, amount: ReactNode, top?: boolean) => (
    <div className={cn("grid grid-cols-[170px_1fr_110px] items-center gap-3 max-sm:grid-cols-[1fr_100px]", top && "border-t border-border pt-3")}>
      <span className="text-foreground">{label}</span>
      <span className="relative h-5 rounded bg-muted max-sm:hidden">{bar}</span>
      <span className="text-right">{amount}</span>
    </div>
  );
  return (
    <Frame caption="The credit note was already in your books when you sent it. Using it against an invoice just lowers what that invoice still asks for.">
      <div className="space-y-3 text-[12.5px]">
        {row("Invoice INV-00012", <span className="absolute inset-0 rounded bg-foreground/80" />, <Amount cents={inv} className="text-foreground" />)}
        {row(
          "Credit note CN-00003",
          <span className="absolute inset-y-0 right-0 rounded bg-emerald-500" style={{ width: `${pct}%` }} />,
          <Amount cents={-credit} className="text-emerald-700 dark:text-emerald-300" />,
        )}
        {row(
          <span className="font-medium">Still owed</span>,
          <span className="absolute inset-y-0 left-0 rounded bg-amber-400" style={{ width: `${100 - pct}%` }} />,
          <Amount cents={inv - credit} className="font-medium text-foreground" />,
          true,
        )}
      </div>
    </Frame>
  );
}

/** A customer prepayment: received, part used against an invoice, the rest kept as credit. */
export function PrepaymentFlow() {
  const stage = (step: string, title: string, held: number, note: ReactNode, t: Tone, pill: string) => (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-background px-4 py-3">
      <Label>{step}</Label>
      <div className="mt-1 text-[13.5px] font-medium text-foreground">{title}</div>
      <div className="mt-2 text-[12px] leading-[1.45] text-muted-foreground">{note}</div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-2.5 text-[12px]">
        <span className="text-muted-foreground">Available</span>
        <span className="flex items-center gap-2">
          <Amount cents={held} className="text-foreground" />
          <Pill t={t}>{pill}</Pill>
        </span>
      </div>
    </div>
  );
  return (
    <Frame caption="Until it's used, a prepayment is money you hold for the customer, so it sits in Customer Deposits (a liability), not in your income.">
      <div className="flex items-stretch gap-2 max-md:flex-col">
        {stage("Day 1", "Deposit arrives", 250000, <>Pinnacle pays <Amount cents={250000} /> up front. Your bank goes up, and so does what you owe them in work.</>, "info", "Available")}
        <Arrow label="Apply" />
        {stage("Day 20", "Used on an invoice", 70000, <>You apply <Amount cents={180000} /> to their <Amount cents={180000} /> invoice. The invoice is paid.</>, "info", "Available")}
        <Arrow label="Apply" />
        {stage("Day 45", "Rest used", 0, <>The last <Amount cents={70000} /> goes on the next invoice. Nothing is left to use.</>, "good", "Used")}
      </div>
    </Frame>
  );
}

/** A recurring template and the invoices it creates, with the three ways they can arrive. */
export function RecurringScheduleStrip() {
  const runs = ["Mar 1", "Apr 1", "May 1", "Jun 1"];
  const modes: { name: string; t: Tone; note: string }[] = [
    { name: "Saved as draft", t: "plain", note: "You review and send each one yourself." },
    { name: "Emailed automatically", t: "good", note: "Posted to your books and emailed to the customer." },
    { name: "Created as sent", t: "info", note: "Posted and marked sent, no email. Set through the API or MCP." },
  ];
  return (
    <Frame caption="The check runs once a day. If it missed some days, it catches up and creates every invoice that came due.">
      <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_2fr]">
        <div className="rounded-lg border border-foreground/50 bg-background px-4 py-3">
          <Label>Template</Label>
          <div className="mt-1 text-[13.5px] font-medium text-foreground">Monthly retainer</div>
          <div className="mt-1 text-[12px] text-muted-foreground">Metro Services · Monthly · from Mar 1</div>
          <div className="mt-2 text-[12.5px] text-foreground"><Amount cents={300000} /> each time</div>
        </div>
        <Arrow label="every month" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {runs.map((d, i) => (
            <div key={d} className="rounded-lg border border-border bg-background px-3 py-2.5">
              <div className="font-mono text-[11.5px] text-muted-foreground">{d}</div>
              <div className="mt-1 text-[12.5px] text-foreground">Invoice #{i + 1}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">due in 30 days</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-2 border-t border-border pt-3 sm:grid-cols-3">
        {modes.map((m) => (
          <div key={m.name} className="text-[12px] leading-[1.45] text-muted-foreground">
            <Pill t={m.t}>{m.name}</Pill>
            <div className="mt-1.5">{m.note}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Revenue recognised month by month: an invoice paid up front, counted as income over six months. */
export function RevenueRecognitionChart() {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const per = 100000;
  const counted = 3;
  const W = 560;
  const H = 210;
  const left = 70;
  const base = 170;
  const scale = 120 / (per * 6);
  const colW = (W - left - 10) / months.length;
  return (
    <Frame caption="A $6,000 six-month contract. Each month you count $1,000 as earned, and what's left to count shrinks by the same amount.">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" role="img" aria-label="Six monthly periods, three counted and three still to count, with the left-to-count balance falling from $6,000 to $0.">
        {[0, 3, 6].map((k) => {
          const y = base - k * per * scale;
          return (
            <g key={k}>
              <line x1={left} x2={W - 10} y1={y} y2={y} className="stroke-border" strokeDasharray={k ? "3 4" : undefined} />
              <text x={left - 10} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{`$${k},000`}</text>
            </g>
          );
        })}
        {months.map((m, i) => {
          const x = left + i * colW + colW * 0.2;
          const w = colW * 0.6;
          const leftAfter = per * (5 - i);
          const isCounted = i < counted;
          return (
            <g key={m}>
              <rect x={x} y={base - leftAfter * scale} width={w} height={leftAfter * scale} rx={3} className="fill-muted" />
              <rect
                x={x}
                y={base - (leftAfter + per) * scale}
                width={w}
                height={per * scale - 2}
                rx={3}
                className={isCounted ? "fill-emerald-500" : "fill-none stroke-muted-foreground/50"}
                strokeDasharray={isCounted ? undefined : "4 3"}
              />
              <text x={x + w / 2} y={base + 18} textAnchor="middle" className="fill-muted-foreground text-[11px]">{m}</text>
              <text x={x + w / 2} y={base + 32} textAnchor="middle" className={cn("text-[10px]", isCounted ? "fill-emerald-700 dark:fill-emerald-300" : "fill-muted-foreground")}>
                {isCounted ? "counted" : "to count"}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-2"><span className="size-3 rounded-sm bg-emerald-500" /> Counted as income this month</span>
        <span className="flex items-center gap-2"><span className="size-3 rounded-sm border border-dashed border-muted-foreground/60" /> Not counted yet</span>
        <span className="flex items-center gap-2"><span className="size-3 rounded-sm bg-muted" /> Still left to count after that month</span>
      </div>
    </Frame>
  );
}

/** A reminder timeline around an invoice's due date. */
export function ReminderTimeline() {
  const W = 600;
  const H = 150;
  const x0 = 40;
  const x1 = W - 40;
  const days = [-10, 25];
  const toX = (d: number) => x0 + ((d - days[0]) / (days[1] - days[0])) * (x1 - x0);
  const marks: { d: number; label: string; sub: string; t: "info" | "watch" | "bad" }[] = [
    { d: -7, label: "7 days before", sub: "Before due date · 7", t: "info" },
    { d: 0, label: "Due date", sub: "On due date", t: "watch" },
    { d: 7, label: "7 days late", sub: "After due date · 7", t: "bad" },
    { d: 21, label: "21 days late", sub: "After due date · 21", t: "bad" },
  ];
  const dot = { info: "fill-sky-500", watch: "fill-amber-400", bad: "fill-rose-500" };
  return (
    <Frame caption="Each rule fires once per invoice, on its exact day. If the invoice is paid first, the later reminders never go out.">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="A timeline with reminders 7 days before the due date, on the due date, and 7 and 21 days after it.">
        <rect x={toX(0)} y={40} width={x1 - toX(0)} height={36} className="fill-rose-500/5" />
        <line x1={x0} x2={x1} y1={58} y2={58} className="stroke-border" strokeWidth={2} />
        <line x1={toX(0)} x2={toX(0)} y1={30} y2={86} className="stroke-foreground" strokeWidth={1.5} />
        <text x={toX(0) + 6} y={36} className="fill-foreground text-[11px] font-medium">Due</text>
        <text x={x1} y={36} textAnchor="end" className="fill-rose-600 text-[11px] dark:fill-rose-300">Overdue</text>
        {marks.map((m) => (
          <g key={m.d}>
            <circle cx={toX(m.d)} cy={58} r={7} className={dot[m.t]} />
            <text x={toX(m.d)} y={108} textAnchor="middle" className="fill-foreground text-[11.5px]">{m.label}</text>
            <text x={toX(m.d)} y={124} textAnchor="middle" className="fill-muted-foreground text-[10.5px]">{m.sub}</text>
          </g>
        ))}
      </svg>
    </Frame>
  );
}

/* ------------------------------------------------------------ contacts */

/** What a customer sees when they open their portal link. */
export function CustomerPortalPreview() {
  const tabs = ["Overview", "Invoices", "Statements", "Quotes", "Payments"];
  const invoices: { n: string; due: string; cents: number; status: string; t: Tone; pay?: boolean }[] = [
    { n: "INV-00014", due: "Due Nov 12", cents: 450000, status: "Sent", t: "info", pay: true },
    { n: "INV-00011", due: "Due Oct 1", cents: 120000, status: "Overdue", t: "bad", pay: true },
    { n: "INV-00007", due: "Paid Sep 3", cents: 250000, status: "Paid", t: "good" },
  ];
  return (
    <Frame caption="No account or password. The link itself is the key, and it stops working on the date you chose.">
      <div className="mx-auto max-w-[620px] overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className="ml-2 flex-1 truncate rounded bg-background px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">your-dubbl.com/portal/•••••••</span>
        </div>
        <div className="px-4 py-3">
          <div className="text-[14px] font-medium text-foreground">Demo Company</div>
          <div className="text-[11.5px] text-muted-foreground">Customer Portal</div>
          <div className="mt-3 flex gap-1 border-b border-border text-[12px]">
            {tabs.map((t, i) => (
              <span key={t} className={cn("px-2 pb-1.5", i === 1 ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground")}>{t}</span>
            ))}
          </div>
          <div className="mt-2 divide-y divide-border/70 text-[12.5px]">
            {invoices.map((inv) => (
              <div key={inv.n} className="flex items-center gap-3 py-2">
                <span className="font-mono text-foreground">{inv.n}</span>
                <span className="text-muted-foreground max-sm:hidden">{inv.due}</span>
                <Pill t={inv.t}>{inv.status}</Pill>
                <Amount cents={inv.cents} className="ml-auto text-foreground" />
                <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">PDF</span>
                <span className={cn("w-[62px] rounded px-1.5 py-0.5 text-center text-[11px]", inv.pay ? "bg-foreground text-background" : "invisible")}>Pay now</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-[12px]">
            <span className="text-muted-foreground">Quotes tab: <span className="font-mono text-foreground">QT-00006</span> waiting for an answer</span>
            <span className="rounded bg-foreground px-2 py-0.5 text-[11px] text-background">Accept</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** How a statement's balance is worked out. */
export function StatementBalanceMath() {
  const part = (label: string, cents: number, sign?: string, strong?: boolean) => (
    <div className="flex items-center gap-2">
      {sign && <span className="text-[16px] text-muted-foreground">{sign}</span>}
      <div className={cn("rounded-lg border bg-background px-3.5 py-2.5", strong ? "border-foreground/50" : "border-border")}>
        <div className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
        <Amount cents={cents} className="text-[14px] text-foreground" />
      </div>
    </div>
  );
  return (
    <Frame caption="Charges are invoices. Payments are payments received and credit notes. The Balance column runs this sum line by line.">
      <div className="flex flex-wrap items-center gap-2">
        {part("Starting balance", 0)}
        {part("Total charged", 2515000, "+")}
        {part("Total paid", 1520000, "−")}
        {part("Ending balance", 995000, "=", true)}
      </div>
    </Frame>
  );
}

/** Two contacts for the same customer, merged into one. */
export function DuplicateMerge() {
  const card = (name: string, email: string, items: string[], keep: boolean) => (
    <div className={cn("rounded-lg border bg-background px-4 py-3", keep ? "border-foreground/50" : "border-dashed border-border")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] font-medium text-foreground">{name}</span>
        <Pill t={keep ? "good" : "plain"}>{keep ? "Keep this one" : "Merged in"}</Pill>
      </div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{email}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <Pill key={i}>{i}</Pill>
        ))}
      </div>
    </div>
  );
  return (
    <Frame caption="Everything attached to the duplicate moves onto the contact you keep. The duplicate is then removed, and the merge can't be undone.">
      <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
        <div className="space-y-2">
          {card("Acme Corp", "accounts@acme.com", ["3 invoices", "1 quote"], true)}
          {card("ACME Corp.", "accounts@acme.com", ["1 invoice", "1 payment", "2 people"], false)}
        </div>
        <Arrow label="Merge" />
        <div className="rounded-lg border border-foreground/50 bg-background px-4 py-3">
          <span className="text-[13.5px] font-medium text-foreground">Acme Corp</span>
          <div className="mt-0.5 text-[12px] text-muted-foreground">accounts@acme.com</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["4 invoices", "1 quote", "1 payment", "2 people"].map((i) => (
              <Pill key={i} t="good">{i}</Pill>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** One contact at the centre of everything you do with them. */
export function ContactRecordMap() {
  const sell = ["Quotes", "Invoices", "Credit notes", "Payments received", "Prepayments"];
  const buy = ["Bills", "Supplier credits", "Payments made"];
  const keep = ["People", "Files", "Statement", "Portal link"];
  const col = (title: string, items: string[], t: Tone) => (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <Label>{title}</Label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <Pill key={i} t={t}>{i}</Pill>
        ))}
      </div>
    </div>
  );
  return (
    <Frame caption="A contact who is both a customer and a supplier has both sides on one page, and their balance shows what each side owes.">
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="space-y-2">
          {col("As a customer", sell, "info")}
          {col("As a supplier", buy, "watch")}
        </div>
        <div className="mx-auto rounded-xl border border-foreground/50 bg-background px-5 py-4 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-[13px] font-medium text-foreground">AC</div>
          <div className="mt-2 text-[14px] font-medium text-foreground">Acme Corp</div>
          <div className="text-[12px] text-muted-foreground">Net 30 · USD</div>
          <div className="mt-2 text-[12px] text-foreground">Owes you <Amount cents={995000} /></div>
        </div>
        {col("Kept with them", keep, "plain")}
      </div>
    </Frame>
  );
}
