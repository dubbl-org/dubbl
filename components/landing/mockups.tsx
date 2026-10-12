import {
  ArrowUp,
  Check,
  Landmark,
  Paperclip,
  Search,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

/*
 * Product mockups — 1:1 recreations of dubbl screens, built from the app's own
 * tokens (bg-shell, card borders, mono figures, uppercase micro-labels) so they
 * stay crisp at any size and follow light / dark mode. Static data for a
 * fictional UK studio, Northwind Studio Ltd.
 */

export const label = "text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
export const mono = "font-mono tabular-nums";

/** Loop length for a mockup's animations (see app/(landing)/landing.css). */
export const loop = (seconds: number, delay = 0) => ({ "--lp-t": `${seconds}s`, animationDelay: `${delay}s` }) as React.CSSProperties;

/** A tick that pops in at step `k` of the loop. */
export function Tick({ k, t, className }: { k: number; t: number; className?: string }) {
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center border", className)}>
      <span style={loop(t)} className={cn("lp-a absolute -inset-px flex items-center justify-center rounded-[inherit] bg-foreground text-background", `lp-pop-${k}`)}>
        <Check className="size-[0.7em]" strokeWidth={3} />
      </span>
    </span>
  );
}

/** A dot with a soft radar ping — "this is live". */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-1.5", className)}>
      <span className="lp-a lp-ping absolute inset-0 rounded-full bg-foreground" />
      <span className="relative size-1.5 rounded-full bg-foreground" />
    </span>
  );
}

/** A floating app window, used inside bento cards. */
export function Window({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      style={style}
      className={cn(
        "overflow-hidden rounded-xl border border-black/10 bg-background text-foreground shadow-[0_2px_4px_rgb(0_0_0/0.05),0_28px_56px_-24px_rgb(0_0_0/0.35)] dark:border-white/10",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Orb({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffd3a8,#ff8a4c_45%,#e2502a)] shadow-[inset_0_-2px_4px_rgb(0_0_0/0.15)]",
        className
      )}
    />
  );
}

export function StatusPill({ s }: { s: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-px text-[10px] font-medium",
        s === "Paid" && "bg-foreground/[0.07] text-foreground",
        s === "Sent" && "border border-border text-muted-foreground",
        s === "Overdue" && "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
      )}
    >
      {s}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Bento mockups                                                      */
/* ------------------------------------------------------------------ */

const bankLines = [
  { d: "09 Oct", t: "ACME LTD INV-0042", a: "+£5,040.00", m: "Match INV-0042 · Acme Ltd", files: 0 },
  { d: "07 Oct", t: "HMRC VAT", a: "−£1,200.00", m: "820 VAT · no tax", files: 0 },
  { d: "05 Oct", t: "TESCO STORES 2231", a: "−£23.50", m: "835 Directors' Loan", files: 1 },
  { d: "03 Oct", t: "AMAZON MKTPLACE", a: "−£45.99", m: "429 Office supplies · 20% VAT", files: 2 },
  { d: "01 Oct", t: "STRIPE PAYOUT", a: "+£3,482.10", m: "Match 4 card payments", files: 0 },
];

export function BankFeedMock() {
  return (
    <div className="relative w-[660px]">
      <Window>
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-foreground/[0.06]"><Landmark className="size-3.5" /></span>
            <div>
              <p className="text-[13px] font-semibold">Business Current</p>
              <p className="text-[11px] text-muted-foreground">Barclays · synced 2 min ago</p>
            </div>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[11px] font-medium leading-[1.25em]">
            <span className="inline-block h-[1.25em] overflow-hidden">
              <span style={loop(12)} className={cn("lp-a lp-count flex flex-col", mono)}>
                {[7, 6, 5, 4, 3, 2].map((n) => <span key={n}>{n}</span>)}
              </span>
            </span>
            to reconcile
          </span>
        </div>
        {bankLines.map((l, i) => (
          <div key={l.t} className="relative isolate flex items-center gap-3 border-b px-5 py-3 last:border-0">
            <span style={loop(12)} className={cn("lp-a absolute inset-0 -z-10 bg-foreground/[0.035]", `lp-fade-${i}`)} />
            <span className={cn("w-12 text-[11px] text-muted-foreground", mono)}>{l.d}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{l.t}</span>
            <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-foreground/80">
              <Sparkles className="size-3 text-muted-foreground" />
              {l.m}
            </span>
            <span className="w-7 text-[11px] text-muted-foreground">
              {l.files > 0 && <span className="flex items-center gap-0.5"><Paperclip className="size-3" />{l.files}</span>}
            </span>
            <span className={cn("w-[84px] text-right text-[12.5px] font-medium", mono, l.a.startsWith("−") && "text-red-600 dark:text-red-400")}>{l.a}</span>
            <Tick k={i} t={12} className="size-6 rounded-md text-[20px]" />
          </div>
        ))}
      </Window>

      {/* Receipts attached to the Amazon line */}
      <Window style={loop(7)} className="lp-a lp-float absolute left-[404px] top-[284px] w-[262px] p-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium">Attachments <span className="ml-1 font-normal text-muted-foreground">2</span></p>
          <span className="text-[10px] text-muted-foreground">From Documents</span>
        </div>
        {[
          ["Amazon receipt Oct.pdf", "PDF · 178 KB", "#e5484d"],
          ["Order 204-118.png", "Image · 92 KB", "#8e4ec6"],
        ].map(([n, m, c]) => (
          <div key={n} className="mt-2 flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5">
            <span className="relative h-6 w-5 shrink-0 rounded-[3px] border bg-background">
              <span className="absolute bottom-1 left-1 right-1 h-1 rounded-[1px]" style={{ backgroundColor: c }} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11.5px] font-medium">{n}</p>
              <p className="text-[10px] text-muted-foreground">{m}</p>
            </div>
          </div>
        ))}
      </Window>
    </div>
  );
}

export function InvoiceMock() {
  return (
    <div className="relative w-[440px]">
      <Window className="px-7 py-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Logo className="h-[16px] w-[20px]" />
            <span className="text-[13px] font-semibold">Northwind Studio Ltd</span>
          </div>
          <span className="grid text-[10px] font-medium">
            <span style={loop(10)} className="lp-a lp-out-2 rounded-full border px-2 py-0.5 text-muted-foreground [grid-area:1/1]">Sent · 1 Oct</span>
            <span style={loop(10)} className="lp-a lp-in-2 rounded-full bg-foreground px-2 py-0.5 text-background [grid-area:1/1]">Paid · 9 Oct</span>
          </span>
        </div>
        <p className="mt-6 text-[22px] font-semibold tracking-[-0.03em]">Invoice</p>
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
      </Window>

      {/* The journal that posted itself */}
      <Window style={loop(10)} className="lp-a lp-in-3 absolute -right-10 top-[226px] w-[270px] p-3.5">
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
      </Window>
    </div>
  );
}

export function ReportMock() {
  const rows = [
    ["Sales", "£32,180.00", 100],
    ["Cost of sales", "−£6,420.00", 20],
    ["Wages & salaries", "−£9,600.00", 30],
    ["Rent", "−£2,100.00", 7],
    ["Software", "−£1,155.67", 4],
  ] as const;
  return (
    <Window className="w-[350px] p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold">Profit and loss</p>
        <span className="flex items-center gap-2 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground"><LiveDot /> Oct 2026</span>
      </div>
      <div className="mt-4 space-y-2.5">
        {rows.map(([n, v, w], i) => (
          <div key={n}>
            <div className="flex justify-between text-[11.5px]">
              <span className="text-foreground/80">{n}</span>
              <span className={cn(mono, v.startsWith("−") && "text-muted-foreground")}>{v}</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-foreground/[0.06]">
              <div className="h-full" style={{ width: `${w}%` }}>
                <div style={loop(10, i * 0.15)} className={cn("lp-a lp-grow h-full rounded-full", n === "Sales" ? "bg-foreground" : "bg-foreground/35")} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-end justify-between border-t pt-3">
        <div>
          <p className={label}>Net profit</p>
          <p className={cn("mt-1 text-[22px] font-bold tracking-tight", mono)}>£12,904.33</p>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-medium"><ArrowUp className="size-3" />18%</span>
      </div>
    </Window>
  );
}

export function TaxReturnMock() {
  const boxes = [
    ["1", "VAT due on sales", "£8,214.00"],
    ["4", "VAT reclaimed on purchases", "£1,801.20"],
    ["6", "Total sales, ex VAT", "£41,070.00"],
    ["7", "Total purchases, ex VAT", "£9,006.00"],
  ];
  return (
    <Window className="w-[350px] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold">VAT return</p>
          <p className="text-[11px] text-muted-foreground">1 Jul – 30 Sep 2026</p>
        </div>
        <span className="grid text-[10.5px] font-medium">
          <span style={loop(8)} className="lp-a lp-out-3 rounded-full border px-2 py-0.5 text-muted-foreground [grid-area:1/1]">Calculating…</span>
          <span style={loop(8)} className="lp-a lp-in-3 rounded-full bg-foreground/[0.07] px-2 py-0.5 [grid-area:1/1]">Ready to file</span>
        </span>
      </div>
      <div className="relative mt-4 divide-y overflow-hidden rounded-lg border">
        <span style={loop(8)} className="lp-a lp-scan pointer-events-none absolute inset-x-0 top-0 h-[17%] bg-gradient-to-b from-transparent via-foreground/[0.07] to-transparent" />
        {boxes.map(([b, n, v]) => (
          <div key={b} className="flex items-center gap-3 px-3 py-2 text-[11.5px]">
            <span className={cn("w-5 text-muted-foreground", mono)}>{b}</span>
            <span className="flex-1 text-foreground/80">{n}</span>
            <span className={mono}>{v}</span>
          </div>
        ))}
        <div className="flex items-center gap-3 bg-foreground/[0.04] px-3 py-2.5 text-[12.5px] font-semibold">
          <span className={cn("w-5 text-muted-foreground", mono)}>5</span>
          <span className="flex-1">Net VAT to pay</span>
          <span className={mono}>£6,412.80</span>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Due 7 Nov · worked out from 214 transactions</p>
    </Window>
  );
}

export function TillyMock() {
  return (
    <Window className="w-[350px] p-4">
      <div className="flex items-center gap-2 border-b pb-3">
        <Orb className="size-5" />
        <p className="text-[13px] font-semibold">Tilly</p>
      </div>
      <div style={loop(11)} className="lp-a lp-in-0 ml-auto mt-3.5 w-fit rounded-2xl rounded-br-md bg-foreground/[0.06] px-3 py-2 text-[12px]">Which invoices are overdue?</div>
      <div className="relative mt-3 flex gap-2.5">
        <Orb className="mt-0.5 size-4" />
        <span style={loop(11)} className="lp-a lp-typing absolute left-[26px] top-1 flex gap-1">
          {[0, 1, 2].map((d) => <span key={d} style={{ animationDelay: `${d * 0.15}s` }} className="lp-a lp-dot size-1.5 rounded-full bg-foreground" />)}
        </span>
        <div style={loop(11)} className="lp-a lp-in-2 min-w-0 flex-1 text-[12px]">
          <p>Two, <span className="font-semibold">£3,200.00</span> in total:</p>
          <div className="mt-2 divide-y rounded-lg border">
            {[
              ["INV-0040", "Spruce & Co", "18 days", "£1,200.00"],
              ["INV-0035", "Helio Labs", "31 days", "£2,000.00"],
            ].map(([i, c, d, a]) => (
              <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 text-[11.5px]">
                <span className={cn("text-muted-foreground", mono)}>{i}</span>
                <span className="flex-1 font-medium">{c}</span>
                <span className="text-red-600 dark:text-red-400">{d}</span>
                <span className={mono}>{a}</span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex gap-1.5">
            <span className="rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background">Send reminders</span>
            <span className="rounded-md border px-2 py-1 text-[11px]">Open both</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl border px-3 py-2 text-[12px] text-muted-foreground">
        Ask about your books…
        <span className="flex size-6 items-center justify-center rounded-lg bg-foreground text-background"><ArrowUp className="size-3.5" /></span>
      </div>
    </Window>
  );
}

const countries = [
  ["🇬🇧", "United Kingdom", "VAT 20% · year end 31 Mar"],
  ["🇦🇺", "Australia", "GST 10% · year end 30 Jun"],
  ["🇺🇸", "United States", "Sales tax · year end 31 Dec"],
  ["🇫🇷", "France", "PCG · TVA 20%"],
  ["🇩🇪", "Germany", "SKR03 · USt 19%"],
  ["🇳🇿", "New Zealand", "GST 15% · year end 31 Mar"],
];

export function CountryMock() {
  return (
    <div className="relative w-[440px]">
      <Window className="p-2">
        <div className="flex items-center gap-2 border-b px-2.5 pb-2.5 pt-1.5 text-[12px] text-muted-foreground">
          <Search className="size-3.5" /> Where is your business based?
        </div>
        <div className="relative">
          <span style={loop(12)} className="lp-a lp-step6 absolute inset-x-0 top-1 flex h-9 items-center justify-end rounded-lg bg-foreground/[0.055] pr-2.5">
            <Check className="size-3.5" />
          </span>
          {countries.map(([f, n, d]) => (
            <div key={n} className="relative mt-1 flex h-9 items-center gap-3 px-2.5 pr-8">
              <span className="text-[16px] leading-none">{f}</span>
              <span className="flex-1 text-[12.5px] font-medium">{n}</span>
              <span className="text-[11px] text-muted-foreground">{d}</span>
            </div>
          ))}
        </div>
      </Window>
      <Window style={loop(7)} className="lp-a lp-float absolute -right-8 top-[178px] w-[220px] p-3">
        <p className={label}>Ready on day one</p>
        {["Chart of accounts", "Tax rates", "Financial year", "Director's loan & payroll"].map((t, k) => (
          <div key={t} className="mt-2 flex items-center gap-2 text-[11.5px]">
            <Tick k={k} t={12} className="size-3.5 rounded-full text-[14px]" />
            {t}
          </div>
        ))}
      </Window>
    </div>
  );
}

const staff = [
  ["Maya Okonkwo", "Director", "£4,200.00", "£702.40", "£3,497.60"],
  ["Alex Kim", "Designer", "£3,250.00", "£498.10", "£2,751.90"],
  ["Sam Ortiz", "Developer", "£3,600.00", "£571.80", "£3,028.20"],
  ["Lena Fischer", "Studio manager", "£2,450.00", "£312.55", "£2,137.45"],
];

export function PayRunMock() {
  return (
    <Window className="w-[640px]">
      <div className="flex items-center justify-between border-b px-5 py-3.5">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            Pay run · October 2026
            <span className="grid text-[10px] font-medium">
              <span style={loop(12)} className="lp-a lp-out-4 rounded-full border px-1.5 py-px text-muted-foreground [grid-area:1/1]">Approved</span>
              <span style={loop(12)} className="lp-a lp-in-4 rounded-full bg-foreground px-1.5 py-px text-background [grid-area:1/1]">Paid</span>
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground">Paid 25 Oct · 4 employees</p>
        </div>
        <div className="flex gap-1.5">
          <span className="rounded-md border px-2 py-1 text-[11px]">Send payslips</span>
          <span className="rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background">Post to ledger</span>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_90px_90px_120px] border-b px-5 py-2 text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
        <span>Employee</span><span className="text-right">Gross</span><span className="text-right">Tax & NI</span><span className="text-right">Net pay</span>
      </div>
      {staff.map(([n, r, g, t, p], k) => (
        <div key={n} className="grid grid-cols-[1fr_90px_90px_120px] items-center border-b px-5 py-2.5 text-[12px]">
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-foreground/[0.07] text-[9.5px] font-medium">
              {n.split(" ").map((w) => w[0]).join("")}
            </span>
            <div><p className="font-medium">{n}</p><p className="text-[10.5px] text-muted-foreground">{r}</p></div>
          </div>
          <span className={cn("text-right", mono)}>{g}</span>
          <span className={cn("text-right text-muted-foreground", mono)}>{t}</span>
          <span className={cn("flex items-center justify-end gap-2 font-medium", mono)}>
            {p}
            <Tick k={k} t={12} className="size-3.5 rounded-full text-[14px]" />
          </span>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_90px_90px_120px] px-5 py-3 text-[12px] font-semibold">
        <span>Total</span>
        <span className={cn("text-right", mono)}>£13,500.00</span>
        <span className={cn("text-right text-muted-foreground", mono)}>£2,084.85</span>
        <span className={cn("text-right", mono)}>£11,415.15</span>
      </div>
    </Window>
  );
}

