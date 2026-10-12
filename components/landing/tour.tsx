import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpRight,
  Bell,
  BookUser,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  FolderOpen,
  Layers,
  LayoutGrid,
  LineChart,
  Package,
  Paperclip,
  Percent,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Target,
  Upload,
  Users,
} from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";
import { label, LiveDot, loop, mono, Orb, StatusPill, Tick } from "@/components/landing/mockups";

/*
 * Hero product tour — the real app shell (rail, section panel, main card) at
 * 1280×800, with one screen per stop. Every screen's demo runs on the tour's
 * stop length so it finishes as the tour moves on.
 */

const T = 7;

const RAIL = [LayoutGrid, BookUser, FileText, ShoppingCart, ArrowLeftRight, Percent, Layers, Package, Users, Target, FolderOpen, LineChart];

function NavItem({ children, active, count }: { children: React.ReactNode; active?: boolean; count?: string }) {
  return (
    <div className={cn("mt-0.5 flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px]", active ? "bg-foreground/[0.055] font-medium" : "text-foreground/80")}>
      {children}
      {count && <span className="text-[11px] text-muted-foreground">{count}</span>}
    </div>
  );
}

const Group = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-5 flex items-center gap-2 px-2 text-[11px] text-muted-foreground">{children}</p>
);

export function AppShell({
  rail,
  panel,
  crumbs,
  children,
  dock,
}: {
  rail: number;
  panel: React.ReactNode;
  crumbs: string[];
  children: React.ReactNode;
  dock?: React.ReactNode;
}) {
  return (
    <div className="flex size-full bg-shell text-foreground">
      <div className="flex w-[56px] shrink-0 flex-col items-center gap-1 py-3.5">
        <Logo className="mb-3 h-[18px] w-[22px]" />
        <Orb className="mb-2 size-[18px]" />
        {RAIL.map((Icon, i) => (
          <span
            key={i}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-300",
              i === rail && "bg-foreground/[0.055] text-foreground"
            )}
          >
            <Icon className="size-[15px]" strokeWidth={1.7} />
          </span>
        ))}
        <div className="mt-auto flex flex-col items-center gap-1">
          <span className="flex size-8 items-center justify-center text-muted-foreground"><CircleHelp className="size-[15px]" strokeWidth={1.7} /></span>
          <span className="flex size-8 items-center justify-center text-muted-foreground"><Settings className="size-[15px]" strokeWidth={1.7} /></span>
          <span className="mt-1 flex size-7 items-center justify-center rounded-full bg-foreground/[0.08] text-[10px] font-medium">MO</span>
        </div>
      </div>

      <div className="flex w-[212px] shrink-0 flex-col px-2.5 py-3.5">
        <div className="flex items-center gap-1.5 px-2 text-[13px] font-semibold tracking-[-0.01em]">
          Northwind Studio <ChevronDown className="size-3.5 text-muted-foreground" />
        </div>
        <div className="lp-screen">{panel}</div>
      </div>

      <div className="relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-5">
          <span className="flex items-center gap-2 text-[13px]">
            {crumbs.map((c, i) => (
              <span key={c} className="flex items-center gap-2">
                {i > 0 && <span className="text-muted-foreground/50">/</span>}
                <span className={i === crumbs.length - 1 ? "font-medium" : "text-muted-foreground"}>{c}</span>
              </span>
            ))}
          </span>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-52 items-center gap-2 rounded-lg bg-foreground/[0.045] px-2.5 text-[12px] text-muted-foreground">
              <Search className="size-3.5" /> Search
              <span className="ml-auto text-[10px]">⌘K</span>
            </span>
            <span className="flex items-center gap-1.5 text-[12px] font-medium"><Orb className="size-4" /> Ask Tilly</span>
            <Bell className="size-4 text-foreground/70" />
            <span className="flex h-7 items-center gap-1.5 rounded-lg bg-foreground px-2.5 text-[12px] font-medium text-background">
              <Plus className="size-3.5" /> New
            </span>
          </div>
        </div>
        <div className="lp-screen relative min-h-0 flex-1">{children}</div>
      </div>

      {dock && <div className="lp-dock my-2 mr-2 w-[340px] shrink-0 overflow-hidden rounded-xl border bg-background">{dock}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Overview                                                           */
/* ------------------------------------------------------------------ */

const kpis = [
  { k: "Cash in bank", v: "£64,310.55", n: "+£3,120.40 this week" },
  { k: "Owed to you", v: "£18,450.00", n: "6 invoices · 2 overdue" },
  { k: "You owe", v: "£4,982.10", n: "5 bills · 1 due Friday" },
  { k: "Net profit · Oct", v: "£12,904.33", n: "+18% on September" },
];

const todo = [
  { t: "Reconcile 7 bank lines", s: "Business Current", n: "7" },
  { t: "Chase 2 overdue invoices", s: "£3,200.00 outstanding", n: "2" },
  { t: "File the VAT return", s: "Jul–Sep · due 7 Nov", n: "£6,412.80" },
  { t: "Approve 3 bills", s: "Waiting on you", n: "3" },
  { t: "Run October payroll", s: "4 employees · 25 Oct", n: "" },
];

const recent = [
  { id: "INV-0042", c: "Acme Ltd", d: "1 Oct", a: "£5,040.00", s: "Paid" },
  { id: "INV-0041", c: "Helio Labs", d: "29 Sep", a: "£2,880.00", s: "Sent" },
  { id: "INV-0040", c: "Spruce & Co", d: "12 Sep", a: "£1,200.00", s: "Overdue" },
  { id: "INV-0039", c: "Quarry Studio", d: "5 Sep", a: "£960.00", s: "Paid" },
];

const moneyIn = [42, 51, 47, 58, 54, 63, 60, 71, 66, 74, 70, 82];
const moneyOut = [30, 34, 39, 33, 41, 37, 44, 40, 46, 42, 49, 45];
const linePath = (values: number[], w: number, h: number) =>
  values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * w).toFixed(1)},${(h - (v / 90) * h).toFixed(1)}`).join(" ");

function HomePanel() {
  return (
    <>
      <Group>Home</Group>
      <NavItem active>Overview</NavItem>
      <NavItem count="4">Inbox</NavItem>
      <NavItem>Activity</NavItem>
      <Group>Bank accounts <LiveDot className="ml-auto mr-1" /></Group>
      {[
        ["Business Current", "£24,310.55", "7"],
        ["Savings", "£40,000.00", ""],
        ["Amex Business", "−£1,284.30", "2"],
      ].map(([n, b, c]) => (
        <div key={n} className="mt-0.5 rounded-lg px-2 py-1.5">
          <div className="flex items-center justify-between text-[13px] text-foreground/80">
            {n}
            {c && <span className="rounded-full bg-foreground/[0.07] px-1.5 text-[10px] font-medium text-foreground">{c}</span>}
          </div>
          <p className={cn("text-[11px] text-muted-foreground", mono)}>{b}</p>
        </div>
      ))}
      <Group>Create</Group>
      {["New invoice", "New bill", "Import statement"].map((t) => (
        <div key={t} className="mt-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-foreground/80">
          <Plus className="size-3.5 text-muted-foreground" /> {t}
        </div>
      ))}
    </>
  );
}

/**
 * The overview body. `hero` reorders it for a window that runs off the right
 * edge of the screen: the to-do list and invoice statuses move left, where
 * their animations stay in view.
 */
function OverviewBody({ animate = true, hero = false }: { animate?: boolean; hero?: boolean }) {
  const W = 560;
  const H = 150;

  const chart = (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className={label}>Cash flow · 12 weeks</p>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-foreground" />Money in</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-foreground/30" />Money out</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-[150px] w-full overflow-visible">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="stroke-border" strokeDasharray="2 4" />
        ))}
        <path d={`${linePath(moneyIn, W, H)} L${W},${H} L0,${H} Z`} className="fill-foreground/[0.05]" />
        <path d={linePath(moneyIn, W, H)} pathLength={1} fill="none" className={cn("stroke-foreground", animate && "lp-a lp-once lp-draw")} strokeWidth="1.75" />
        <path d={linePath(moneyOut, W, H)} pathLength={1} fill="none" className={cn("stroke-foreground/30", animate && "lp-a lp-once lp-draw")} strokeWidth="1.75" style={{ animationDelay: "0.3s" }} />
        <circle cx={W} cy={H - (82 / 90) * H} r="3.5" className="lp-a lp-ping fill-foreground/40" />
        <circle cx={W} cy={H - (82 / 90) * H} r="3.5" className="fill-background stroke-foreground" strokeWidth="1.75" />
      </svg>
      <div className="mt-3 flex justify-between text-[10px] text-muted-foreground">
        {["Jul 21", "Aug 4", "Aug 18", "Sep 1", "Sep 15", "Sep 29", "Oct 13"].map((d) => <span key={d}>{d}</span>)}
      </div>
    </div>
  );

  const toDo = (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <p className={label}>To do</p>
        <span className="text-[11px] text-muted-foreground">5</span>
      </div>
      {todo.map((t, i) => (
        <div key={t.t} className="flex items-center gap-3 border-t px-4 py-2.5">
          {animate ? (
            <Tick k={i} t={T} className="size-3.5 rounded-full border-foreground/25 text-[14px]" />
          ) : (
            <span className="size-3.5 shrink-0 rounded-full border border-foreground/25" />
          )}
          <div style={loop(T)} className={cn("min-w-0 flex-1", animate && `lp-a lp-dim-${i}`)}>
            <p className="truncate text-[12.5px] font-medium">{t.t}</p>
            <p className="truncate text-[11px] text-muted-foreground">{t.s}</p>
          </div>
          {t.n && <span className={cn("text-[11px] text-muted-foreground", mono)}>{t.n}</span>}
        </div>
      ))}
    </div>
  );

  return (
    <div className="px-7 py-6">
      <h3 className="text-[22px] font-semibold tracking-[-0.03em]">Good morning, Maya</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">Here&apos;s where Northwind Studio stands today.</p>

      <div className="mt-5 grid grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.k} className="rounded-lg border p-3.5">
            <p className={label}>{k.k}</p>
            <p className={cn("mt-2 text-[20px] font-bold tracking-tight", mono)}>{k.v}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{k.n}</p>
          </div>
        ))}
      </div>

      <div className={cn("mt-3 grid gap-3", hero ? "grid-cols-[1fr_1.55fr]" : "grid-cols-[1.55fr_1fr]")}>
        {hero ? toDo : chart}
        {hero ? chart : toDo}
      </div>

      <div className="mt-3 rounded-lg border">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <p className={label}>Recent invoices</p>
          <span className="text-[11px] text-muted-foreground">View all</span>
        </div>
        {recent.map((r, i) =>
          hero ? (
            <div key={r.id} className="grid grid-cols-[90px_150px_80px_110px_1fr] items-center border-t px-4 py-2.5 text-[12.5px]">
              <span className={cn("text-muted-foreground", mono)}>{r.id}</span>
              <span className="font-medium">{r.c}</span>
              {i === 1 ? (
                <span className="grid justify-items-start">
                  <span style={loop(T)} className="lp-a lp-out-3 [grid-area:1/1]"><StatusPill s="Sent" /></span>
                  <span style={loop(T)} className="lp-a lp-in-3 [grid-area:1/1]"><StatusPill s="Paid" /></span>
                </span>
              ) : (
                <span><StatusPill s={r.s} /></span>
              )}
              <span className={cn("font-medium", mono)}>{r.a}</span>
              <span className="text-muted-foreground">{r.d}</span>
            </div>
          ) : (
            <div key={r.id} className="grid grid-cols-[90px_1fr_80px_90px_110px] items-center border-t px-4 py-2.5 text-[12.5px]">
              <span className={cn("text-muted-foreground", mono)}>{r.id}</span>
              <span className="font-medium">{r.c}</span>
              <span className="text-muted-foreground">{r.d}</span>
              <span><StatusPill s={r.s} /></span>
              <span className={cn("text-right font-medium", mono)}>{r.a}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Toast({ title, body, delay = 0 }: { title: string; body: string; delay?: number }) {
  return (
    <div
      style={loop(T, delay)}
      className={cn("lp-a lp-in-4 absolute bottom-[72px] right-6 flex w-[318px] items-center gap-3 rounded-xl border bg-background px-3.5 py-3 shadow-[0_2px_4px_rgb(0_0_0/0.05),0_16px_32px_-12px_rgb(0_0_0/0.25)]")}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
        <Check className="size-3.5" strokeWidth={2.5} />
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold">{title}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

export function OverviewScreen() {
  return (
    <AppShell rail={0} panel={<HomePanel />} crumbs={["Overview"]}>
      <OverviewBody />
      <Toast title="Payment received" body="Acme Ltd paid INV-0042 · £5,040.00" />
    </AppShell>
  );
}

/** The overview arranged for the hero, where the window runs off the right. Its
 *  animations all sit on the left, in view; nothing floats over it. */
export function HeroOverviewScreen() {
  return (
    <AppShell rail={0} panel={<HomePanel />} crumbs={["Overview"]}>
      <OverviewBody hero />
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Reconcile                                                          */
/* ------------------------------------------------------------------ */

const lines = [
  { d: "12 Oct", t: "STRIPE PAYOUT", r: "po_1Q8x", a: "+£3,482.10", m: "Match 4 card payments", f: 0 },
  { d: "09 Oct", t: "ACME LTD INV-0042", r: "BACS", a: "+£5,040.00", m: "Match INV-0042 · Acme Ltd", f: 0 },
  { d: "08 Oct", t: "GOOGLE WORKSPACE", r: "Card ••4417", a: "−£41.40", m: "463 IT & software · rule", f: 1 },
  { d: "07 Oct", t: "HMRC VAT", r: "Direct debit", a: "−£1,200.00", m: "820 VAT", f: 0 },
  { d: "05 Oct", t: "TESCO STORES 2231", r: "Card ••4417", a: "−£23.50", m: "835 Directors' Loan", f: 1 },
  { d: "03 Oct", t: "AMAZON MKTPLACE", r: "Card ••4417", a: "−£45.99", m: "429 Office supplies · 20% VAT", f: 2 },
  { d: "01 Oct", t: "UBER *TRIP", r: "Card ••4417", a: "−£18.60", m: "493 Travel · 20% VAT", f: 0 },
];

function BankingPanel() {
  return (
    <>
      <Group>Banking</Group>
      <NavItem active count="7">Business Current</NavItem>
      <NavItem>Savings</NavItem>
      <NavItem count="2">Amex Business</NavItem>
      <Group>Tools</Group>
      <NavItem>Bank rules</NavItem>
      <NavItem>Scheduled payments</NavItem>
      <NavItem>Payment batches</NavItem>
      <Group>Assets and loans</Group>
      <NavItem>Fixed assets</NavItem>
      <NavItem>Loans</NavItem>
    </>
  );
}

export function ReconcileScreen() {
  return (
    <AppShell rail={4} panel={<BankingPanel />} crumbs={["Banking", "Business Current"]}>
      <div className="px-7 py-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[20px] font-semibold tracking-[-0.03em]">Business Current</h3>
            <p className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">Barclays · synced 2 min ago <LiveDot /></p>
          </div>
          <div className="flex gap-2">
            <span className="flex h-8 items-center rounded-lg border px-3 text-[12px]">Match statement</span>
            <span className="flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background"><Upload className="size-3.5" /> Import</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-6 border-b pb-5">
          {[["Balance", "£24,310.55"], ["Money in", "£8,522.10"], ["Money out", "£1,329.49"]].map(([k, v]) => (
            <div key={k}>
              <p className="text-[11px] text-muted-foreground">{k}</p>
              <p className={cn("mt-1 text-[19px] font-bold tracking-tight", mono, k === "Money out" && "text-red-600 dark:text-red-400")}>{v}</p>
            </div>
          ))}
          <div>
            <p className="flex justify-between text-[11px] text-muted-foreground">Done <span className={mono}>this month</span></p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
              <div style={loop(T)} className="lp-a lp-grow h-full w-[86%] rounded-full bg-foreground" />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1 text-[12.5px]">
          <span className="rounded-lg bg-foreground/[0.055] px-2.5 py-1 font-medium">All</span>
          <span className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-muted-foreground">
            To do
            <span className="inline-block h-[1.25em] overflow-hidden leading-[1.25em] text-foreground">
              <span style={loop(T)} className={cn("lp-a lp-count flex flex-col", mono)}>
                {[7, 6, 5, 4, 3, 2].map((n) => <span key={n}>{n}</span>)}
              </span>
            </span>
          </span>
          <span className="rounded-lg px-2.5 py-1 text-muted-foreground">Done</span>
          <span className="ml-auto flex h-7 w-56 items-center gap-2 rounded-lg border px-2.5 text-[12px] text-muted-foreground"><Search className="size-3.5" /> Search transactions</span>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border">
          {lines.map((l, i) => (
            <div key={l.t} className="relative isolate flex items-center gap-3.5 border-b px-4 py-3 last:border-0">
              {i < 6 && <span style={loop(T)} className={cn("lp-a absolute inset-0 -z-10 bg-foreground/[0.035]", `lp-fade-${i}`)} />}
              <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", l.a.startsWith("+") ? "bg-foreground/[0.06]" : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400")}>
                {l.a.startsWith("+") ? <ArrowDownRight className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
              </span>
              <div className="w-[190px] min-w-0">
                <p className="truncate text-[12.5px] font-medium">{l.t}</p>
                <p className="text-[11px] text-muted-foreground">{l.d} · {l.r}</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-foreground/80">
                <Sparkles className="size-3 text-muted-foreground" />
                {l.m}
              </span>
              <span className="ml-auto w-8 text-[11px] text-muted-foreground">
                {l.f > 0 && <span className="flex items-center gap-0.5"><Paperclip className="size-3" />{l.f}</span>}
              </span>
              <span className={cn("w-[92px] text-right text-[12.5px] font-medium", mono, l.a.startsWith("−") && "text-red-600 dark:text-red-400")}>{l.a}</span>
              {i < 6 ? <Tick k={i} t={T} className="size-6 rounded-md text-[20px]" /> : <span className="size-6 rounded-md border" />}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Invoice                                                            */
/* ------------------------------------------------------------------ */

const invoices = [
  { id: "INV-0042", c: "Acme Ltd", a: "£5,040.00", s: "Sent", live: true },
  { id: "INV-0041", c: "Helio Labs", a: "£2,880.00", s: "Sent" },
  { id: "INV-0040", c: "Spruce & Co", a: "£1,200.00", s: "Overdue" },
  { id: "INV-0039", c: "Quarry Studio", a: "£960.00", s: "Paid" },
  { id: "INV-0038", c: "Orbit Labs", a: "£3,600.00", s: "Paid" },
  { id: "INV-0035", c: "Helio Labs", a: "£2,000.00", s: "Overdue" },
  { id: "INV-0034", c: "Brightco", a: "£1,450.00", s: "Paid" },
];

function SalesPanel() {
  return (
    <>
      <Group>Sales</Group>
      <NavItem active count="42">Invoices</NavItem>
      <NavItem count="3">Quotes</NavItem>
      <NavItem>Credit notes</NavItem>
      <NavItem>Recurring</NavItem>
      <NavItem>Payments</NavItem>
      <Group>Get paid</Group>
      <NavItem>Payment links</NavItem>
      <NavItem>Reminders</NavItem>
    </>
  );
}

export function InvoiceScreen() {
  return (
    <AppShell rail={2} panel={<SalesPanel />} crumbs={["Sales", "Invoices", "INV-0042"]}>
      <div className="flex h-full">
        <div className="w-[360px] shrink-0 border-r">
          <div className="grid grid-cols-2 gap-px border-b bg-border">
            {[["Outstanding", "£18,450.00"], ["Overdue", "£3,200.00"]].map(([k, v]) => (
              <div key={k} className="bg-background px-5 py-4">
                <p className="text-[11px] text-muted-foreground">{k}</p>
                <p className={cn("mt-1 text-[17px] font-bold tracking-tight", mono, k === "Overdue" && "text-red-600 dark:text-red-400")}>{v}</p>
              </div>
            ))}
          </div>
          {invoices.map((r) => (
            <div key={r.id} className={cn("flex items-center gap-3 border-b px-5 py-3 text-[12.5px]", r.live && "bg-foreground/[0.045]")}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.c}</p>
                <p className={cn("text-[11px] text-muted-foreground", mono)}>{r.id}</p>
              </div>
              {r.live ? (
                <span className="grid">
                  <span style={loop(T)} className="lp-a lp-out-2 [grid-area:1/1]"><StatusPill s="Sent" /></span>
                  <span style={loop(T)} className="lp-a lp-in-2 [grid-area:1/1]"><StatusPill s="Paid" /></span>
                </span>
              ) : (
                <StatusPill s={r.s} />
              )}
              <span className={cn("w-[78px] text-right font-medium", mono)}>{r.a}</span>
            </div>
          ))}
        </div>

        <div className="relative flex-1 bg-foreground/[0.025] p-7">
          <div className="mx-auto max-w-[460px] rounded-lg border bg-background px-8 py-7 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_32px_-20px_rgb(0_0_0/0.25)]">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Logo className="h-[16px] w-[20px]" />
                <span className="text-[13px] font-semibold">Northwind Studio Ltd</span>
              </div>
              <span className="grid text-[10px] font-medium">
                <span style={loop(T)} className="lp-a lp-out-2 rounded-full border px-2 py-0.5 text-muted-foreground [grid-area:1/1]">Sent · 1 Oct</span>
                <span style={loop(T)} className="lp-a lp-in-2 rounded-full bg-foreground px-2 py-0.5 text-background [grid-area:1/1]">Paid · 9 Oct</span>
              </span>
            </div>
            <p className="mt-6 text-[24px] font-semibold tracking-[-0.03em]">Invoice</p>
            <div className="mt-2 grid grid-cols-3 text-[11px]">
              <div><p className="text-muted-foreground">Number</p><p className={mono}>INV-0042</p></div>
              <div><p className="text-muted-foreground">Billed to</p><p>Acme Ltd</p></div>
              <div><p className="text-muted-foreground">Due</p><p>31 Oct 2026</p></div>
            </div>
            <div className="mt-5 border-t">
              {[
                ["Brand identity", "1 × £2,400.00", "£2,400.00"],
                ["Website design", "3 days × £600.00", "£1,800.00"],
              ].map(([d, q, a]) => (
                <div key={d} className="flex items-center justify-between border-b py-2.5 text-[12px]">
                  <div><p className="font-medium">{d}</p><p className="text-[11px] text-muted-foreground">{q}</p></div>
                  <span className={mono}>{a}</span>
                </div>
              ))}
              <div className="ml-auto mt-3 w-52 space-y-1 text-[12px]">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className={mono}>£4,200.00</span></div>
                <div className="flex justify-between text-muted-foreground"><span>VAT 20%</span><span className={mono}>£840.00</span></div>
                <div className="flex justify-between border-t pt-1.5 text-[14px] font-semibold"><span>Total</span><span className={mono}>£5,040.00</span></div>
              </div>
            </div>
            <div className="mt-5 flex h-9 items-center justify-center rounded-lg bg-foreground text-[12px] font-medium text-background">Pay £5,040.00 online</div>
          </div>

          <div
            style={loop(T)}
            className="lp-a lp-in-3 absolute bottom-[120px] right-6 w-[268px] rounded-xl border bg-background p-3.5 shadow-[0_2px_4px_rgb(0_0_0/0.05),0_24px_48px_-16px_rgb(0_0_0/0.3)]"
          >
            <p className={label}>Journal · JE-0193</p>
            {[
              ["090 Business Bank", "5,040.00", ""],
              ["610 Accounts Receivable", "", "5,040.00"],
            ].map(([a, dr, cr]) => (
              <div key={a} className="mt-2 grid grid-cols-[1fr_58px_58px] text-[11px]">
                <span className="truncate">{a}</span>
                <span className={cn("text-right", mono)}>{dr}</span>
                <span className={cn("text-right", mono)}>{cr}</span>
              </div>
            ))}
            <p className="mt-2.5 flex items-center gap-1.5 border-t pt-2 text-[10.5px] text-muted-foreground">
              <Check className="size-3" /> Balanced · posted on payment
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Report                                                             */
/* ------------------------------------------------------------------ */

const months = [
  ["May", 8.1],
  ["Jun", 9.4],
  ["Jul", 7.9],
  ["Aug", 10.2],
  ["Sep", 10.9],
  ["Oct", 12.9],
] as const;

const pl: { n: string; oct: string; sep: string; ch: string; total?: boolean; head?: boolean }[] = [
  { n: "Income", oct: "", sep: "", ch: "", head: true },
  { n: "Sales", oct: "32,180.00", sep: "29,600.00", ch: "+8.7%" },
  { n: "Cost of sales", oct: "−6,420.00", sep: "−6,050.00", ch: "+6.1%" },
  { n: "Gross profit", oct: "25,760.00", sep: "23,550.00", ch: "+9.4%", total: true },
  { n: "Expenses", oct: "", sep: "", ch: "", head: true },
  { n: "Wages & salaries", oct: "−9,600.00", sep: "−9,600.00", ch: "0.0%" },
  { n: "Rent", oct: "−2,100.00", sep: "−2,100.00", ch: "0.0%" },
  { n: "Software", oct: "−1,155.67", sep: "−914.13", ch: "+26.4%" },
];

function ReportsPanel() {
  return (
    <>
      <Group>Reports</Group>
      <NavItem active>Profit and loss</NavItem>
      <NavItem>Balance sheet</NavItem>
      <NavItem>Cash flow</NavItem>
      <NavItem>Aged receivables</NavItem>
      <NavItem>Trial balance</NavItem>
      <Group>Tax</Group>
      <NavItem>VAT return</NavItem>
      <NavItem>Scheduled reports</NavItem>
    </>
  );
}

export function ReportScreen() {
  return (
    <AppShell rail={11} panel={<ReportsPanel />} crumbs={["Reports", "Profit and loss"]}>
      <div className="px-7 py-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[20px] font-semibold tracking-[-0.03em]">Profit and loss</h3>
            <p className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">October 2026 · compared with September <LiveDot /></p>
          </div>
          <div className="flex gap-2 text-[12px]">
            <span className="flex h-8 items-center rounded-lg border px-3">PDF</span>
            <span className="flex h-8 items-center rounded-lg border px-3">CSV</span>
            <span className="flex h-8 items-center rounded-lg border px-3">Email monthly</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_250px] gap-3">
          <div className="rounded-lg border p-4">
            <p className={label}>Net profit · 6 months</p>
            <div className="mt-4 flex h-[118px] items-end gap-4">
              {months.map(([m, v], i) => (
                <div key={m} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-[96px] w-full items-end">
                    <div
                      style={{ ...loop(T, i * 0.08), height: `${(v / 13) * 100}%` }}
                      className={cn("lp-a lp-rise w-full rounded-t-md", m === "Oct" ? "bg-foreground" : "bg-foreground/15")}
                    />
                  </div>
                  <span className="text-[10.5px] text-muted-foreground">{m}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-lg border p-4">
            <p className={label}>Net profit · Oct</p>
            <div>
              <p className={cn("text-[28px] font-bold tracking-tight", mono)}>£12,904.33</p>
              <p className="mt-1 flex items-center gap-1 text-[12px] font-medium"><ArrowUp className="size-3.5" /> 18.0% on September</p>
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border text-[12.5px]">
          <div className="grid grid-cols-[1fr_130px_130px_90px] border-b bg-foreground/[0.025] px-4 py-2 text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
            <span>Account</span><span className="text-right">Oct 2026</span><span className="text-right">Sep 2026</span><span className="text-right">Change</span>
          </div>
          {pl.map((r) =>
            r.head ? (
              <div key={r.n} className="px-4 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">{r.n}</div>
            ) : (
              <div key={r.n} className={cn("grid grid-cols-[1fr_130px_130px_90px] px-4 py-2", r.total && "border-y font-semibold")}>
                <span>{r.n}</span>
                <span className={cn("text-right", mono)}>{r.oct}</span>
                <span className={cn("text-right text-muted-foreground", mono)}>{r.sep}</span>
                <span className={cn("text-right text-muted-foreground", mono)}>{r.ch}</span>
              </div>
            )
          )}
          <div className="grid grid-cols-[1fr_130px_130px_90px] border-t bg-foreground/[0.04] px-4 py-3 text-[13px] font-semibold">
            <span>Net profit</span>
            <span className={cn("text-right", mono)}>12,904.33</span>
            <span className={cn("text-right text-muted-foreground", mono)}>10,935.87</span>
            <span className={cn("text-right", mono)}>+18.0%</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Ask Tilly                                                          */
/* ------------------------------------------------------------------ */

function TillyDock() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <Orb className="size-5" />
        <p className="text-[13px] font-semibold">Tilly</p>
        <span className="ml-auto text-[11px] text-muted-foreground">New chat</span>
      </div>
      <div className="flex-1 space-y-3 p-4 text-[12.5px]">
        <div style={loop(T)} className="lp-a lp-in-0 ml-auto w-fit rounded-2xl rounded-br-md bg-foreground/[0.06] px-3 py-2">Which invoices are overdue?</div>
        <div style={loop(T)} className="lp-a lp-in-1 flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground">
          <Search className="size-3" /> Looked through 42 invoices
        </div>
        <div style={loop(T)} className="lp-a lp-in-2">
          <p>Two, <span className="font-semibold">£3,200.00</span> in total:</p>
          <div className="mt-2 divide-y rounded-lg border">
            {[
              ["Spruce & Co", "INV-0040 · 18 days", "£1,200.00"],
              ["Helio Labs", "INV-0035 · 31 days", "£2,000.00"],
            ].map(([c, d, a]) => (
              <div key={c} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1">
                  <p className="font-medium">{c}</p>
                  <p className="text-[11px] text-red-600 dark:text-red-400">{d}</p>
                </div>
                <span className={mono}>{a}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background">Send reminders</span>
            <span className="rounded-md border px-2 py-1 text-[11px]">Open both</span>
          </div>
        </div>
        <div style={loop(T)} className="lp-a lp-in-4 ml-auto w-fit rounded-2xl rounded-br-md bg-foreground/[0.06] px-3 py-2">Send them</div>
        <div style={loop(T)} className="lp-a lp-in-5 flex gap-2">
          <Orb className="mt-0.5 size-4" />
          <p>Done — reminders are on their way to Spruce &amp; Co and Helio Labs. I&apos;ll tell you when they pay.</p>
        </div>
      </div>
      <div className="m-3 flex items-center justify-between rounded-xl border px-3 py-2 text-[12px] text-muted-foreground">
        Ask about your books…
        <span className="flex size-6 items-center justify-center rounded-lg bg-foreground text-background"><ArrowUp className="size-3.5" /></span>
      </div>
    </div>
  );
}

export function TillyScreen() {
  return (
    <AppShell rail={0} panel={<HomePanel />} crumbs={["Overview"]} dock={<TillyDock />}>
      <OverviewBody animate={false} />
    </AppShell>
  );
}
