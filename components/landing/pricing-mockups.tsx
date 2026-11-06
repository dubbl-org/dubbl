import { ArrowDown, Check, Plus } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Tick, Window, label, loop, mono } from "@/components/landing/mockups";
import { PLAN_LIMITS } from "@/lib/plans";
import { cn } from "@/lib/utils";

/*
 * Pricing mockups: what each plan unlocks, drawn as dubbl screens for the
 * same fictional studio (Northwind) as the rest of the site.
 */

const T = 10;
const free = PLAN_LIMITS.free;

const billLines = [
  ["Invoices, quotes and bills", "Unlimited"],
  ["Journal entries and contacts", "Unlimited"],
  ["Every financial report", "P&L, balance sheet, cash flow"],
  ["Bank feeds and reconciliation", `${free.bankAccounts} accounts`],
  ["Payroll", `${free.employees} employees`],
  ["API and MCP access", "For you and your agents"],
];

/** The free plan as a bill: every line ticks in at $0.00. */
export function FreeBill() {
  return (
    <Window className="w-[460px] px-7 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="h-[16px] w-[20px]" />
          <span className="text-[13px] font-semibold">dubbl</span>
        </div>
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Free plan</span>
      </div>
      <p className="mt-6 text-[22px] font-semibold tracking-[-0.03em]">Your bill</p>
      <p className={cn("mt-0.5", label)}>Every month, for as long as you like</p>

      <div className="mt-5 border-t">
        {billLines.map(([item, detail], k) => (
          <div key={item} className="flex items-center gap-3 border-b py-2.5 text-[12px]">
            <Tick k={k} t={T} className="size-4 rounded-full text-[14px]" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item}</p>
              <p className="text-[11px] text-muted-foreground">{detail}</p>
            </div>
            <span className={cn("text-muted-foreground", mono)}>$0.00</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[14px] font-semibold">
        <span>Total</span>
        <span className={mono}>$0.00</span>
      </div>
      <p style={loop(T)} className="lp-a lp-in-6 mt-3 flex items-center gap-1.5 border-t pt-2.5 text-[11px] text-muted-foreground">
        <Check className="size-3" strokeWidth={2.5} /> No card, no trial, no time limit
      </p>
    </Window>
  );
}

const team = [
  ["MO", "Maya Okonkwo", "Owner"],
  ["AK", "Alex Kim", "Admin"],
  ["SO", "Sam Ortiz", "Member"],
  ["LF", "Lena Fischer", "Member"],
  ["PS", "Priya Shah", "Accountant"],
  ["TR", "Tom Reed", "Bookkeeper"],
];

/** Members page on a paid plan: people keep joining, the price doesn't move. */
export function TeamMock() {
  return (
    <div className="relative w-[400px]">
      <Window>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-[13px] font-semibold">Members</p>
          <span className={cn("text-[11px] text-muted-foreground", mono)}>Unlimited</span>
        </div>
        <div className="divide-y">
          {team.map(([i, n, r], k) => (
            <div
              key={n}
              style={k >= 3 ? loop(T) : undefined}
              className={cn("flex items-center gap-3 px-4 py-2.5", k >= 3 && `lp-a lp-in-${k - 3}`)}
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-foreground/[0.07] text-[10px] font-semibold">{i}</span>
              <span className="flex-1 text-[12.5px] font-medium">{n}</span>
              <span className="rounded-full border px-1.5 py-px text-[10px] text-muted-foreground">{r}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 px-4 py-2.5 text-[12px] text-muted-foreground">
            <span className="flex size-7 items-center justify-center rounded-full border border-dashed">
              <Plus className="size-3.5" />
            </span>
            Invite member
          </div>
        </div>
      </Window>
      <Window style={loop(T)} className="lp-a lp-in-3 absolute -bottom-6 -right-8 w-[170px] px-3.5 py-3">
        <p className={label}>Standard plan</p>
        <p className={cn("mt-1 text-[20px] font-semibold tracking-tight", mono)}>$15</p>
        <p className="text-[11px] text-muted-foreground">a month, for everyone</p>
      </Window>
    </div>
  );
}

const fx = [
  ["INV-0051", "Brandt GmbH", "€4,800.00", "£4,128.00"],
  ["INV-0052", "Helio Inc", "$6,200.00", "£4,898.00"],
  ["INV-0053", "Kyoto Works", "¥450,000", "£2,385.00"],
];

/** Invoices in three currencies, each converted to the books' base currency. */
export function CurrencyMock() {
  return (
    <Window className="w-[420px]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-[13px] font-semibold">Invoices</p>
        <span className="rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground">Base · GBP</span>
      </div>
      <div className="divide-y">
        {fx.map(([no, who, amt, base], k) => (
          <div key={no} style={loop(T)} className={cn("lp-a grid grid-cols-[1fr_auto] gap-x-4 px-4 py-3", `lp-in-${k}`)}>
            <div>
              <p className="text-[12.5px] font-medium">{who}</p>
              <p className={cn("text-[11px] text-muted-foreground", mono)}>{no}</p>
            </div>
            <div className="text-right">
              <p className={cn("text-[12.5px] font-medium", mono)}>{amt}</p>
              <p className={cn("text-[11px] text-muted-foreground", mono)}>{base}</p>
            </div>
          </div>
        ))}
      </div>
      <p style={loop(T)} className="lp-a lp-in-3 flex items-center gap-1.5 border-t px-4 py-2.5 text-[11px] text-muted-foreground">
        <Check className="size-3" strokeWidth={2.5} /> Rates updated daily · gains and losses posted
      </p>
    </Window>
  );
}

const entities = [
  ["Northwind Ltd", "UK · GBP", "£12,904"],
  ["Northwind GmbH", "DE · EUR", "€8,310"],
  ["Northwind Inc", "US · USD", "$9,450"],
];

/** Three entities rolling up into one consolidated group. */
export function GroupMock() {
  return (
    <div className="flex w-[480px] flex-col items-center gap-3">
      <div className="grid w-full grid-cols-3 gap-3">
        {entities.map(([n, where, profit], k) => (
          <Window key={n} style={loop(T)} className={cn("lp-a px-3 py-2.5", `lp-in-${k}`)}>
            <p className="truncate text-[11.5px] font-semibold">{n}</p>
            <p className="text-[10px] text-muted-foreground">{where}</p>
            <p className={cn("mt-2 text-[13px] font-medium", mono)}>{profit}</p>
          </Window>
        ))}
      </div>
      <ArrowDown className="size-4 text-foreground/50" />
      <Window style={loop(T)} className="lp-a lp-in-3 w-full px-4 py-3.5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold">Northwind Group</p>
          <span className={label}>Consolidated · GBP</span>
        </div>
        <div className={cn("mt-3 space-y-1 text-[11.5px]", mono)}>
          <div className="flex justify-between text-muted-foreground"><span className="font-sans">Net profit, translated</span><span>£27,476.20</span></div>
          <div className="flex justify-between text-muted-foreground"><span className="font-sans">Intercompany eliminated</span><span>−£3,150.00</span></div>
          <div className="flex justify-between border-t pt-1.5 text-[13px] font-semibold text-foreground"><span className="font-sans">Group net profit</span><span>£24,326.20</span></div>
        </div>
        <p className="mt-2.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <Check className="size-3" strokeWidth={2.5} /> Balanced
        </p>
      </Window>
    </div>
  );
}
