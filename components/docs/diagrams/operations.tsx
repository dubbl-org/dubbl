import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Amount, Arrow, Frame, Label, Pill, fill, type Tone } from "./frame";

// Diagrams for the operations docs: stock and its cost, locations, stocktakes,
// assemblies, landed costs, projects, the CRM pipeline, payroll, timesheets and teams.

/* ------------------------------------------------------------ shared bits */

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border border-border bg-background", className)}>{children}</div>;
}

function Dot({ t, className }: { t: Tone; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", fill[t], className)} />;
}

function Row({ label, children, strong, className }: { label: ReactNode; children: ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 text-[12.5px]", className)}>
      <span className={strong ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tabular-nums", strong ? "font-medium text-foreground" : "text-foreground/85")}>{children}</span>
    </div>
  );
}

/* --------------------------------------------------------------- inventory */

/** Stock level bands: the reorder point decides "Running low". */
export function InventoryStockLevels() {
  const max = 40;
  const reorder = 10;
  const items = [
    { name: "Monitor Stand", qty: 35, t: "good" as Tone, status: "In stock" },
    { name: "Laptop Stand", qty: 8, t: "watch" as Tone, status: "Running low" },
    { name: "Cable Tester Pro", qty: 0, t: "bad" as Tone, status: "Out of stock" },
  ];
  return (
    <Frame caption="An item is running low once units on hand reach its reorder point, and out of stock at zero. Here every item reorders at 10.">
      <div className="space-y-3">
        {items.map((i) => (
          <div key={i.name} className="grid grid-cols-[130px_1fr_110px] items-center gap-3 max-sm:grid-cols-[100px_1fr_96px]">
            <span className="truncate text-[13px] text-foreground">{i.name}</span>
            <div className="relative h-2.5 rounded-full bg-muted">
              <span className={cn("absolute inset-y-0 left-0 rounded-full", fill[i.t])} style={{ width: `${(i.qty / max) * 100}%` }} />
              <span className="absolute -inset-y-1.5 w-px bg-foreground/50" style={{ left: `${(reorder / max) * 100}%` }} />
            </div>
            <span className="flex items-center justify-end gap-2 text-right">
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{i.qty}</span>
              <Pill t={i.t}>{i.status}</Pill>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-[130px_1fr_110px] gap-3 max-sm:grid-cols-[100px_1fr_96px]">
        <span />
        <div className="relative h-4 text-[11px] text-muted-foreground">
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(reorder / max) * 100}%` }}>
            Reorder at 10
          </span>
        </div>
      </div>
    </Frame>
  );
}

/** Moving average cost: each purchase blends into the average, each sale leaves at it. */
export function InventoryAverageCost() {
  const steps: { title: string; detail: string; units: number; value: number; avg: number; t: Tone }[] = [
    { title: "Opening stock", detail: "40 units at $28.00", units: 40, value: 112000, avg: 2800, t: "plain" },
    { title: "Buy 20 more", detail: "20 units at $31.00", units: 60, value: 174000, avg: 2900, t: "info" },
    { title: "Sell 10", detail: "Leave at the $29.00 average", units: 50, value: 145000, avg: 2900, t: "good" },
  ];
  return (
    <Frame caption="Every item uses average cost. A purchase at a new price changes the average; a sale takes units out at the average, so the average doesn't move.">
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {steps.map((s, i) => [
          i > 0 && <Arrow key={`a${i}`} />,
          <Panel key={s.title} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Dot t={s.t} />
              <span className="text-[13.5px] font-medium text-foreground">{s.title}</span>
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">{s.detail}</div>
            <div className="mt-3 space-y-1 border-t border-border pt-2.5">
              <Row label="Units on hand">{s.units}</Row>
              <Row label="Book value"><Amount cents={s.value} /></Row>
              <Row label="Average cost" strong><Amount cents={s.avg} /></Row>
            </div>
          </Panel>,
        ])}
      </div>
      <div className="mt-4 rounded-md border border-dashed border-border px-3 py-2 text-center text-[12px] text-muted-foreground">
        ($1,120.00 + $620.00) ÷ 60 units = <span className="font-medium text-foreground">$29.00</span> a unit. The 10 sold cost <span className="font-medium text-foreground">$290.00</span>.
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------- locations */

const TRANSFER = [
  { item: "Shipping Box (Medium)", main: [500, 460], east: [60, 100] },
  { item: "Ink Cartridge Black", main: [30, 25], east: [15, 20] },
];

/** A transfer moves units between locations; the company total stays the same. */
export function WarehouseTransferFlow() {
  return (
    <Frame caption="Completing a transfer takes the units out of one location and puts them into the other in one step. Your total stock, and its value, stay the same.">
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <Location name="Main Warehouse" code="WH-MAIN" rows={TRANSFER.map((r) => ({ item: r.item, from: r.main[0], to: r.main[1] }))} />
        <div className="flex flex-col items-center gap-1.5 px-1 text-center">
          <Pill t="good">Arrived</Pill>
          <Arrow />
          <span className="text-[11.5px] text-muted-foreground">45 units</span>
        </div>
        <Location name="East Distribution Center" code="WH-EAST" rows={TRANSFER.map((r) => ({ item: r.item, from: r.east[0], to: r.east[1] }))} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {TRANSFER.map((r) => (
          <div key={r.item} className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-[12px]">
            <span className="text-muted-foreground">{r.item}, all locations</span>
            <span className="font-mono tabular-nums text-foreground">
              {r.main[0] + r.east[0]} → {r.main[1] + r.east[1]}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Location({ name, code, rows }: { name: string; code: string; rows: { item: string; from: number; to: number }[] }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13.5px] font-medium text-foreground">{name}</div>
        <span className="font-mono text-[11px] text-muted-foreground">{code}</span>
      </div>
      <div className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <div key={r.item} className="flex items-center justify-between gap-3 text-[12.5px]">
            <span className="truncate text-muted-foreground">{r.item}</span>
            <span className="shrink-0 font-mono tabular-nums">
              <span className="text-muted-foreground/70 line-through">{r.from}</span>{" "}
              <span className={r.to > r.from ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"}>{r.to}</span>
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------- stocktakes */

const COUNT = [
  { item: "Monitor Stand", expected: 35, counted: 35 },
  { item: "Desk Organizer Set", expected: 60, counted: 57 },
  { item: "Sticky Notes (12-Pack)", expected: 120, counted: 124 },
  { item: "Webcam HD 1080p", expected: 28, counted: null },
];

/** A count sheet: expected against counted, and what each difference becomes. */
export function StockTakeCountSheet() {
  return (
    <Frame caption="Only the differences are posted. A shortage is written off as shrinkage; extra stock is added back at its average cost.">
      <Panel className="overflow-hidden">
        <table className="w-full min-w-[460px] text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 text-right font-medium">Expected</th>
              <th className="px-4 py-2 text-right font-medium">Counted</th>
              <th className="px-4 py-2 text-right font-medium">Diff</th>
              <th className="px-4 py-2 font-medium">What happens</th>
            </tr>
          </thead>
          <tbody>
            {COUNT.map((r) => {
              const diff = r.counted === null ? null : r.counted - r.expected;
              const [t, text]: [Tone, string] =
                diff === null ? ["plain", "Uncounted"] : diff === 0 ? ["good", "Matches"] : diff < 0 ? ["bad", "Shortage, written off"] : ["info", "Overage, added back"];
              return (
                <tr key={r.item} className="border-t border-border/70">
                  <td className="px-4 py-2.5 text-foreground">{r.item}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{r.expected}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground">{r.counted ?? "-"}</td>
                  <td className={cn("px-4 py-2.5 text-right font-mono tabular-nums", diff && diff < 0 && "text-rose-600 dark:text-rose-300", diff && diff > 0 && "text-sky-700 dark:text-sky-300")}>
                    {diff === null ? "" : diff > 0 ? `+${diff}` : diff}
                  </td>
                  <td className="px-4 py-2.5"><Pill t={t}>{text}</Pill></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </Frame>
  );
}

/* ------------------------------------------------------------- assemblies */

const BOM = [
  { name: "Desk frame", qty: 1, wastage: 0, cost: 8500 },
  { name: "Desktop board", qty: 1, wastage: 0, cost: 6000 },
  { name: "Leg bolt", qty: 8, wastage: 10, cost: 50 },
];

/** A bill of materials: parts, labour and overhead roll up into the finished item's cost. */
export function AssemblyBomRollup() {
  const parts = BOM.reduce((s, c) => s + Math.round(c.qty * (1 + c.wastage / 100) * c.cost), 0);
  const labour = 2000;
  const overhead = 500;
  return (
    <Frame caption="The cost of one Standing Desk: each part's quantity (plus any wastage) at its cost, then labour and overhead per unit built.">
      <div className="grid items-center gap-4 md:grid-cols-[1.4fr_auto_1fr]">
        <Panel className="overflow-hidden">
          <div className="border-b border-border px-4 py-2.5">
            <Label>Components</Label>
          </div>
          <div className="divide-y divide-border/70">
            {BOM.map((c) => (
              <div key={c.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2 text-[12.5px]">
                <span className="text-foreground">
                  {c.name}
                  {c.wastage > 0 && <span className="ml-2 text-[11.5px] text-amber-700 dark:text-amber-300">+{c.wastage}% wastage</span>}
                </span>
                <span className="font-mono text-muted-foreground">×{c.qty}</span>
                <Amount cents={Math.round(c.qty * (1 + c.wastage / 100) * c.cost)} className="text-foreground" />
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2 text-[12.5px]">
              <span className="text-muted-foreground">Labour</span>
              <Amount cents={labour} className="text-foreground" />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2 text-[12.5px]">
              <span className="text-muted-foreground">Overhead</span>
              <Amount cents={overhead} className="text-foreground" />
            </div>
          </div>
        </Panel>
        <Arrow />
        <Panel className="px-4 py-4 text-center">
          <Label>Finished item</Label>
          <div className="mt-2 text-[15px] font-medium text-foreground">Standing Desk</div>
          <Amount cents={parts + labour + overhead} className="mt-1 block text-[20px] font-medium text-foreground" />
          <div className="mt-1 text-[12px] text-muted-foreground">a unit</div>
        </Panel>
      </div>
    </Frame>
  );
}

/** Completing an assembly order: parts out, finished items in. */
export function AssemblyBuildFlow() {
  return (
    <Frame caption="Building 10 desks uses up the parts' stock and adds 10 desks at the rolled-up cost, in one step.">
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Panel className="px-4 py-3">
          <Label>Parts out</Label>
          <div className="mt-2 space-y-1">
            <Row label="Desk frame">−10</Row>
            <Row label="Desktop board">−10</Row>
            <Row label="Leg bolt">−88</Row>
          </div>
        </Panel>
        <Arrow />
        <Panel className="px-4 py-3 text-center">
          <Pill t="info">Assembly order</Pill>
          <div className="mt-2 text-[13px] text-foreground">Standing Desk ×10</div>
          <div className="mt-1 text-[12px] text-muted-foreground">plus labour and overhead</div>
        </Panel>
        <Arrow />
        <Panel className="px-4 py-3">
          <Label>Finished items in</Label>
          <div className="mt-2 space-y-1">
            <Row label="Standing Desk" strong>+10</Row>
            <Row label="At a unit cost of"><Amount cents={17440} /></Row>
          </div>
        </Panel>
      </div>
    </Frame>
  );
}

/* ----------------------------------------------------------- landed costs */

const LINES = [
  { name: "Desk lamps", units: 100, unit: 1000 },
  { name: "Office chairs", units: 50, unit: 4000 },
];

/** $300 of freight split across two purchase order lines, by value and by quantity. */
export function LandedCostSplit() {
  const freight = 30000;
  const totalValue = LINES.reduce((s, l) => s + l.units * l.unit, 0);
  const totalUnits = LINES.reduce((s, l) => s + l.units, 0);
  const methods = [
    { name: "By value", share: (l: (typeof LINES)[number]) => (freight * l.units * l.unit) / totalValue, note: "Pricier lines carry more of the cost" },
    { name: "By quantity", share: (l: (typeof LINES)[number]) => (freight * l.units) / totalUnits, note: "Every unit carries the same amount" },
  ];
  return (
    <Frame caption="The same $300.00 of freight on a purchase order for 100 lamps at $10.00 and 50 chairs at $40.00. The share each line gets is added to that item's stock value.">
      <div className="grid gap-3 md:grid-cols-2">
        {methods.map((m) => (
          <Panel key={m.name} className="p-4">
            <div className="flex items-center justify-between">
              <Pill t="info">{m.name}</Pill>
              <span className="text-[11.5px] text-muted-foreground">{m.note}</span>
            </div>
            <div className="mt-3 space-y-2.5">
              {LINES.map((l) => {
                const share = Math.round(m.share(l));
                return (
                  <div key={l.name}>
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="text-foreground">{l.name}</span>
                      <span className="text-muted-foreground">
                        <Amount cents={share} className="text-foreground" /> · +<Amount cents={Math.round(share / l.units)} /> a unit
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted">
                      <span className="block h-2 rounded-full bg-sky-500" style={{ width: `${(share / freight) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        ))}
      </div>
    </Frame>
  );
}

/* --------------------------------------------------------------- projects */

/** From logged time to a draft invoice. */
export function ProjectBillingFlow() {
  const entries = [
    { d: "Initial setup and planning", h: 2, billable: true },
    { d: "Development work", h: 8, billable: true },
    { d: "Internal sync", h: 1, billable: false },
    { d: "Code review and testing", h: 3, billable: true },
  ];
  return (
    <Frame caption="Invoice collects every billable entry not yet invoiced: one line per entry, its hours at its rate. Non-billable time stays off the invoice.">
      <div className="grid items-center gap-3 md:grid-cols-[1.3fr_auto_1fr_auto_0.8fr]">
        <Panel className="overflow-hidden">
          <div className="border-b border-border px-4 py-2.5"><Label>Time entries at $175.00/hr</Label></div>
          <div className="divide-y divide-border/70">
            {entries.map((e) => (
              <div key={e.d} className={cn("flex items-center justify-between gap-3 px-4 py-2 text-[12.5px]", !e.billable && "opacity-60")}>
                <span className="truncate text-foreground">{e.d}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-muted-foreground">{e.h}h</span>
                  <Pill t={e.billable ? "info" : "plain"}>{e.billable ? "Billable" : "Non-bill."}</Pill>
                </span>
              </div>
            ))}
          </div>
        </Panel>
        <Arrow label="Invoice" />
        <Panel className="px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-medium text-foreground">Invoice</span>
            <Pill>Draft</Pill>
          </div>
          <div className="mt-2.5 space-y-1">
            <Row label="Initial setup, 2 h"><Amount cents={35000} /></Row>
            <Row label="Development, 8 h"><Amount cents={140000} /></Row>
            <Row label="Code review, 3 h"><Amount cents={52500} /></Row>
            <Row label="Total" strong className="border-t border-border pt-1.5"><Amount cents={227500} /></Row>
          </div>
        </Panel>
        <Arrow label="Send" />
        <Panel className="px-4 py-3 text-center">
          <Pill t="info">Sent</Pill>
          <div className="mt-2 text-[12.5px] text-muted-foreground">Recorded in your books like any invoice</div>
        </Panel>
      </div>
    </Frame>
  );
}

/** Budget against what's been billed and what's waiting to be. */
export function ProjectBudgetBar() {
  const budget = 2000000;
  const billed = 1200000;
  const unbilled = 315000;
  const seg = (v: number) => `${(v / budget) * 100}%`;
  return (
    <Frame caption="On the Overview, the budget is measured against what you've invoiced. Unbilled time is money you've earned but not invoiced yet.">
      <div className="flex h-4 overflow-hidden rounded-full bg-muted">
        <span className="bg-emerald-500" style={{ width: seg(billed) }} />
        <span className="bg-amber-400" style={{ width: seg(unbilled) }} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {[
          { t: "good" as Tone, l: "Total billed", v: billed },
          { t: "watch" as Tone, l: "Unbilled", v: unbilled },
          { t: "plain" as Tone, l: "Remaining", v: budget - billed },
          { t: "plain" as Tone, l: "Budget", v: budget, strong: true },
        ].map((x) => (
          <div key={x.l} className="rounded-md border border-border bg-background px-3 py-2">
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              {x.l !== "Budget" && <Dot t={x.t} />}
              {x.l}
            </div>
            <Amount cents={x.v} className={cn("mt-0.5 block text-[14px]", x.strong ? "font-medium text-foreground" : "text-foreground/90")} />
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------- CRM */

const STAGES: { name: string; t: Tone; value: number; chance: number; deals: number }[] = [
  { name: "Lead", t: "plain", value: 3600000, chance: 10, deals: 1 },
  { name: "Qualified", t: "info", value: 2400000, chance: 25, deals: 1 },
  { name: "Proposal", t: "watch", value: 6600000, chance: 50, deals: 2 },
  { name: "Negotiation", t: "bad", value: 27000000, chance: 75, deals: 2 },
];

/** Open deals by stage, and their value weighted by the chance of closing. */
export function CrmWeightedPipeline() {
  const max = Math.max(...STAGES.map((s) => s.value));
  const weighted = STAGES.reduce((s, x) => s + (x.value * x.chance) / 100, 0);
  return (
    <Frame caption="Weighted value is each deal's value times its win probability. It's a fairer forecast than adding up every open deal.">
      <div className="space-y-3">
        {STAGES.map((s) => (
          <div key={s.name} className="grid grid-cols-[110px_1fr_150px] items-center gap-3 max-sm:grid-cols-[90px_1fr_120px]">
            <span className="flex items-center gap-2 text-[13px] text-foreground">
              <Dot t={s.t === "plain" ? "plain" : s.t} />
              {s.name}
            </span>
            <div className="relative h-5 rounded bg-muted/60">
              <span className="absolute inset-y-0 left-0 rounded bg-muted-foreground/20" style={{ width: `${(s.value / max) * 100}%` }} />
              <span className={cn("absolute inset-y-0 left-0 rounded", fill[s.t === "plain" ? "plain" : s.t])} style={{ width: `${((s.value * s.chance) / 100 / max) * 100}%` }} />
            </div>
            <span className="text-right text-[12px] text-muted-foreground">
              <Amount cents={(s.value * s.chance) / 100} className="text-foreground" /> at {s.chance}%
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-[12.5px]">
        <span className="flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground">
          <span className="inline-flex items-center gap-2"><span className="h-2 w-5 rounded-sm bg-muted-foreground/20" />Deal value</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-5 rounded-sm bg-foreground/60" />Weighted value</span>
        </span>
        <span className="text-muted-foreground">
          6 open deals worth <Amount cents={39600000} className="text-foreground" />, weighted <Amount cents={weighted} className="font-medium text-foreground" />
        </span>
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------------------- payroll */

/** One payslip, from pay before deductions to take-home, and the employer's extra cost. */
export function PayslipGrossToNet() {
  const gross = 1000000;
  const cuts = [
    { l: "Income tax", note: "22% flat rate", v: 220000 },
    { l: "Social Security", note: "6.2%", v: 62000 },
    { l: "Medicare", note: "1.45%", v: 14500 },
  ];
  const net = gross - cuts.reduce((s, c) => s + c.v, 0);
  const employer = [
    { l: "Social Security match", v: 62000 },
    { l: "Medicare match", v: 14500 },
    { l: "FUTA", v: 4200 },
  ];
  const pct = (v: number) => `${(v / gross) * 100}%`;
  return (
    <Frame caption="A $10,000.00 monthly salary with a flat 22% income tax rate. The employee takes home what's left after tax; the employer pays its own share of payroll taxes on top.">
      <div className="space-y-2">
        <Bar label="Pay before deductions" v={gross} left="0%" width="100%" t="plain" />
        {cuts.reduce<{ els: ReactNode[]; at: number }>(
          (acc, c) => {
            acc.els.push(<Bar key={c.l} label={c.l} note={c.note} v={-c.v} left={pct(gross - acc.at - c.v)} width={pct(c.v)} t="bad" />);
            acc.at += c.v;
            return acc;
          },
          { els: [], at: 0 },
        ).els}
        <Bar label="Take-home pay" v={net} left="0%" width={pct(net)} t="good" strong />
      </div>
      <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-3">
        <Label>The employer also pays</Label>
        <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-3">
          {employer.map((e) => (
            <Row key={e.l} label={e.l}><Amount cents={e.v} /></Row>
          ))}
        </div>
        <div className="mt-2 text-[12px] text-muted-foreground">
          FUTA is 0.6% of the first $7,000.00 an employee earns in the year, so it shows up on the first payday and then stops.
        </div>
      </div>
    </Frame>
  );
}

function Bar({ label, note, v, left, width, t, strong }: { label: string; note?: string; v: number; left: string; width: string; t: Tone; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[170px_1fr_100px] items-center gap-3 max-sm:grid-cols-[120px_1fr_90px]">
      <span className={cn("text-[12.5px]", strong ? "font-medium text-foreground" : "text-muted-foreground")}>
        {label}
        {note && <span className="ml-1.5 text-[11px] text-muted-foreground/80">{note}</span>}
      </span>
      <div className="relative h-4 rounded bg-muted/50">
        <span className={cn("absolute inset-y-0 rounded", fill[t])} style={{ left, width }} />
      </div>
      <Amount cents={v} className={cn("text-right text-[12.5px]", strong ? "font-medium text-foreground" : "text-foreground/85")} />
    </div>
  );
}

/** What goes into a pay run and what comes out of it. */
export function PayRunInputsOutputs() {
  return (
    <Frame caption="A pay run reads your active employees (and approved timesheets for hourly staff). Finishing it records the payroll in your books in one entry.">
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <div className="space-y-2">
          <Panel className="px-4 py-2.5">
            <div className="text-[13px] font-medium text-foreground">Active employees</div>
            <div className="text-[12px] text-muted-foreground">Salary or hourly rate, pay frequency, tax rate</div>
          </Panel>
          <Panel className="px-4 py-2.5">
            <div className="text-[13px] font-medium text-foreground">Approved timesheets</div>
            <div className="text-[12px] text-muted-foreground">Hours for hourly employees</div>
          </Panel>
        </div>
        <Arrow />
        <Panel className="px-4 py-3 text-center">
          <Pill>Not finished</Pill>
          <div className="mt-2 text-[13px] font-medium text-foreground">Pay run</div>
          <div className="mt-1 text-[12px] text-muted-foreground">Gross, tax and take-home worked out per person</div>
        </Panel>
        <Arrow label="Finish & record" />
        <div className="space-y-2">
          <Panel className="px-4 py-2.5">
            <div className="text-[13px] font-medium text-foreground">Journal entry</div>
            <div className="text-[12px] text-muted-foreground">Wages, taxes owed, money out of the bank</div>
          </Panel>
          <Panel className="px-4 py-2.5">
            <div className="text-[13px] font-medium text-foreground">Payslips and tax liabilities</div>
            <div className="text-[12px] text-muted-foreground">What each person got, and what you owe the tax office</div>
          </Panel>
        </div>
      </div>
    </Frame>
  );
}

/* --------------------------------------------------------- time and leave */

/** Only approved timesheets count toward an hourly employee's pay. */
export function TimesheetToPay() {
  const sheets: { who: string; period: string; hours: number; status: string; t: Tone; counts: boolean }[] = [
    { who: "Week 1", period: "Oct 1 to Oct 7", hours: 38, status: "Approved", t: "good", counts: true },
    { who: "Week 2", period: "Oct 8 to Oct 14", hours: 40, status: "Approved", t: "good", counts: true },
    { who: "Week 3", period: "Oct 15 to Oct 21", hours: 36, status: "Submitted", t: "info", counts: false },
  ];
  return (
    <Frame caption="For an hourly employee, the pay run takes the hours from approved timesheets in the pay period. A timesheet still waiting for approval isn't counted.">
      <div className="grid items-center gap-3 md:grid-cols-[1.4fr_auto_1fr]">
        <div className="space-y-2">
          {sheets.map((s) => (
            <Panel key={s.who} className={cn("flex items-center justify-between gap-3 px-4 py-2.5", !s.counts && "border-dashed opacity-70")}>
              <div>
                <div className="text-[13px] font-medium text-foreground">{s.who}</div>
                <div className="text-[12px] text-muted-foreground">{s.period}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12.5px] text-foreground">{s.hours}h</span>
                <Pill t={s.t}>{s.status}</Pill>
              </div>
            </Panel>
          ))}
        </div>
        <Arrow />
        <Panel className="px-4 py-3">
          <Label>Pay run</Label>
          <div className="mt-2 space-y-1">
            <Row label="Week 1">38h</Row>
            <Row label="Week 2">40h</Row>
            <Row label="Hours paid" strong className="border-t border-border pt-1.5">78h</Row>
          </div>
          <div className="mt-2 text-[12px] text-muted-foreground">Week 3 isn’t counted until it’s approved.</div>
        </Panel>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ teams */

const TEAMS = [
  { name: "Engineering", color: "bg-blue-500", people: ["Maya", "Leo", "Priya"] },
  { name: "Finance", color: "bg-emerald-500", people: ["Sam", "Ava"] },
];

/** Teams group workspace members; a team can be assigned to a project. */
export function TeamsProjectMap() {
  return (
    <Frame caption="A team is a group of people in your workspace. Assign it to a project to put the whole group on it at once, with one role.">
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="space-y-2">
          {TEAMS.map((t) => (
            <Panel key={t.name} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={cn("size-2.5 rounded-full", t.color)} />
                <span className="text-[13.5px] font-medium text-foreground">{t.name}</span>
                <span className="text-[12px] text-muted-foreground">{t.people.length} members</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.people.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[12px] text-foreground/85">
                    <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground">{p[0]}</span>
                    {p}
                  </span>
                ))}
              </div>
            </Panel>
          ))}
        </div>
        <Arrow label="Assign Team" />
        <Panel className="px-4 py-3">
          <Label>Project</Label>
          <div className="mt-1.5 text-[14px] font-medium text-foreground">Mobile App MVP</div>
          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="flex items-center gap-2 text-foreground"><span className="size-2 rounded-full bg-blue-500" />Engineering</span>
              <Pill>Contributor</Pill>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="flex items-center gap-2 text-foreground"><span className="size-2 rounded-full bg-emerald-500" />Finance</span>
              <Pill>Viewer</Pill>
            </div>
          </div>
        </Panel>
      </div>
    </Frame>
  );
}
