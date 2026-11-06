import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Amount, Arrow, Box, Frame, Label, Pill, type Tone } from "./frame";

// Diagrams for the settings, documents, Tilly and apps guides, built from the
// primitives in ./frame. Every fact here comes from the code (lib/plans.ts,
// lib/assistant/tools.ts, lib/approvals/engine.ts, lib/api/backup-snapshot.ts, ...).

/* ------------------------------------------------------------------ */
/*  Small shared bits                                                  */
/* ------------------------------------------------------------------ */

function Yes() {
  return (
    <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-label="yes">
        <path d="M2 5.2 4.1 7.3 8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function No() {
  return <span aria-label="no" className="inline-block h-px w-3 bg-muted-foreground/40 align-middle" />;
}

function Dot({ t }: { t: Tone }) {
  const c: Record<Tone, string> = {
    good: "bg-emerald-500",
    watch: "bg-amber-400",
    bad: "bg-rose-500",
    info: "bg-sky-500",
    plain: "bg-muted-foreground/40",
  };
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", c[t])} />;
}

/* ------------------------------------------------------------------ */
/*  Members and roles                                                  */
/* ------------------------------------------------------------------ */

type RoleCol = "member" | "admin" | "owner" | "readOnly" | "invoiceOnly" | "standard" | "advisor";

const ROLE_COLS: { key: RoleCol; name: string; preset?: boolean }[] = [
  { key: "member", name: "Member" },
  { key: "admin", name: "Admin" },
  { key: "owner", name: "Owner" },
  { key: "readOnly", name: "Read-only", preset: true },
  { key: "invoiceOnly", name: "Invoice-only", preset: true },
  { key: "standard", name: "Standard", preset: true },
  { key: "advisor", name: "Advisor", preset: true },
];

// Labels are the ones on Settings > Roles. Base roles follow PERMISSION_REQUIREMENTS;
// ready-made roles follow PRESET_ROLES in lib/plans.ts.
const MATRIX: { label: string; on: RoleCol[] }[] = [
  { label: "See data (read-only)", on: ["member", "admin", "owner", "readOnly", "invoiceOnly", "standard", "advisor"] },
  { label: "Add and edit transactions", on: ["member", "admin", "owner", "standard", "advisor"] },
  { label: "Manage invoices", on: ["member", "admin", "owner", "invoiceOnly", "standard", "advisor"] },
  { label: "Manage bills you owe", on: ["member", "admin", "owner", "standard", "advisor"] },
  { label: "Finalize transactions (lock them in)", on: ["admin", "owner", "advisor"] },
  { label: "Approve invoices", on: ["admin", "owner", "advisor"] },
  { label: "Manage bank accounts & feeds", on: ["admin", "owner", "advisor"] },
  { label: "Invite people", on: ["admin", "owner", "advisor"] },
  { label: "Edit organization settings", on: ["admin", "owner", "advisor"] },
  { label: "See the activity history", on: ["admin", "owner", "readOnly", "advisor"] },
  { label: "Lock past dates", on: ["owner", "advisor"] },
  { label: "Manage billing & subscription", on: ["owner", "advisor"] },
  { label: "Delete the whole organization", on: ["owner", "advisor"] },
];

/** Who can do what: the three base roles next to the four ready-made roles. */
export function RolePermissionMatrix() {
  return (
    <Frame
      className="p-0 md:p-0"
      caption="A sample of the 58 permissions. A ready-made or custom role replaces the base role's rights completely, so a member with Read-only can't add anything."
    >
      <table className="w-full min-w-[640px] text-[12.5px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 pb-1 pt-3 text-left" />
            <th colSpan={3} className="border-l border-border px-2 pb-1 pt-3 text-center">
              <Label>Base roles</Label>
            </th>
            <th colSpan={4} className="border-l border-border px-2 pb-1 pt-3 text-center">
              <Label>Ready-made roles</Label>
            </th>
          </tr>
          <tr className="border-b border-border text-[12px] text-foreground">
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Permission</th>
            {ROLE_COLS.map((c, i) => (
              <th key={c.key} className={cn("px-2 py-2 text-center font-medium", (i === 0 || i === 3) && "border-l border-border")}>
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MATRIX.map((row) => (
            <tr key={row.label} className="border-b border-border/60 last:border-0">
              <td className="px-4 py-2 text-foreground">{row.label}</td>
              {ROLE_COLS.map((c, i) => (
                <td key={c.key} className={cn("px-2 py-2 text-center", (i === 0 || i === 3) && "border-l border-border")}>
                  {row.on.includes(c.key) ? <Yes /> : <No />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/*  Approvals                                                          */
/* ------------------------------------------------------------------ */

/** An invoice going through a two-step approval workflow. */
export function ApprovalWorkflowFlow() {
  return (
    <Frame caption="Only records that match a workflow's conditions wait. Each step waits for its own approver, in order; one rejection ends the request.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-stretch gap-2 max-md:flex-col">
          <Box title={<Pill>Draft</Pill>} className="md:w-[150px]">
            You choose <b className="font-medium text-foreground">Submit for approval</b>
          </Box>
          <Arrow />
          <div className="flex-1 rounded-lg border border-dashed border-border bg-muted/40 p-2.5">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
              <Pill t="watch" className="whitespace-nowrap">Awaiting approval</Pill>
              <span className="text-[11.5px] text-muted-foreground">Workflow: invoices over $5,000</span>
            </div>
            <div className="flex flex-wrap items-stretch gap-2 max-md:flex-col">
              <Box title="Step 1" className="flex-1">
                Priya (admin) approves
              </Box>
              <Arrow />
              <Box title="Step 2" className="flex-1">
                Alex (owner) approves
              </Box>
            </div>
          </div>
          <Arrow />
          <Box title={<Pill t="good" className="whitespace-nowrap">Approved</Pill>} className="md:w-[150px]">
            Back to draft, ready to send as usual
          </Box>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-[12.5px] text-muted-foreground">
          <span className="text-foreground">At any step:</span>
          <b className="font-medium text-foreground">Reject</b>
          <span>with a reason</span>
          <svg width="22" height="10" viewBox="0 0 22 10" fill="none" aria-hidden="true" className="text-muted-foreground/60">
            <path d="M0 5h19m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <Pill t="bad">Rejected</Pill>
          <span>and the rest of the steps are skipped.</span>
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/*  Tilly                                                              */
/* ------------------------------------------------------------------ */

const RISK_TIERS: { t: Tone; tag: string; title: string; what: string; examples: string[]; rule: string }[] = [
  {
    t: "good",
    tag: "Runs on its own",
    title: "Reads",
    what: "Looking things up: lists, single records, search and every report.",
    examples: ["list_invoices", "search_everything", "profit_and_loss", "aged_receivables"],
    rule: "Shown as a step, for example “Ran 4 steps”.",
  },
  {
    t: "watch",
    tag: "Waits for Approve",
    title: "Changes data",
    what: "Anything that creates, edits, links or deletes a record.",
    examples: ["create_bill", "create_expense_claim", "create_payment", "link_document_to_record"],
    rule: "You can tick “Don't ask again for this in this chat”.",
  },
  {
    t: "bad",
    tag: "Always waits for Send",
    title: "Sends email",
    what: "Anything that reaches a customer or supplier.",
    examples: ["send_document_email", "send_quote", "bulk_send_invoice_reminders", "process_reminders"],
    rule: "Never auto-approved, not even within one chat.",
  },
];

/** Tilly's three kinds of action and how much each one asks of you. */
export function TillyRiskTiers() {
  return (
    <Frame caption="Every tool Tilly can use is one of the MCP tools, sorted by name into one of these three groups.">
      <div className="grid gap-2 md:grid-cols-3">
        {RISK_TIERS.map((r) => (
          <div key={r.title} className="flex flex-col rounded-lg border border-border bg-background p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-medium text-foreground">{r.title}</span>
              <Pill t={r.t}>{r.tag}</Pill>
            </div>
            <div className="mt-1.5 text-[12.5px] leading-[1.45] text-muted-foreground">{r.what}</div>
            <div className="mt-3 flex flex-wrap gap-1">
              {r.examples.map((e) => (
                <span key={e} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                  {e}
                </span>
              ))}
            </div>
            <div className="mt-auto pt-3 text-[12px] leading-[1.45] text-foreground/80">{r.rule}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** A faithful copy of the approval card Tilly shows before it changes anything. */
export function TillyApprovalCardPreview() {
  const rows: [string, ReactNode][] = [
    ["Issue date", "2026-10-02"],
    ["Due date", "2026-11-01"],
    ["Reference", "NW-4471"],
    ["Notes", "Two desk chairs, from the uploaded PDF"],
    ["Currency code", "USD"],
  ];
  return (
    <Frame caption="What you see when Tilly wants to book a bill. Record ids stay hidden under All details; nothing happens until you press Approve.">
      <div className="mx-auto max-w-[420px] overflow-hidden rounded-xl border border-tilly-200/80 bg-card shadow-[0_12px_32px_-16px_rgba(194,78,44,0.4)] dark:border-tilly-700/40">
        <div className="flex h-9 items-center gap-2 border-b border-tilly-100 bg-tilly-50 px-3 text-[12px] font-medium text-tilly-700 dark:border-tilly-700/30 dark:bg-tilly-700/15 dark:text-tilly-400">
          <span className="size-3.5 rounded-full bg-gradient-to-br from-tilly-300 to-tilly-600" />
          Waiting for your approval
          <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-[11px] dark:bg-black/20">Changes data</span>
        </div>
        <div className="p-3.5">
          <p className="text-[14px] font-semibold text-foreground">Create bill</p>
          <dl className="mt-2.5 space-y-1.5">
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-3 text-[12.5px]">
                <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
                <dd className="min-w-0 flex-1 font-medium text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="size-3.5 rounded border border-border" />
            Don&apos;t ask again for this in this chat
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex h-8 items-center rounded-lg bg-tilly-600 px-3.5 text-[13px] font-medium text-white">Approve</span>
            <span className="inline-flex h-8 items-center rounded-lg border border-border px-3.5 text-[13px] font-medium text-foreground">Skip</span>
            <span className="ml-auto text-[12px] text-muted-foreground">All details</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** What Tilly does with a dropped receipt or bill. */
export function TillyReceiptFlow() {
  const steps: { title: string; body: string; t: Tone; tag: string }[] = [
    { title: "You drop a file", body: "A PDF or photo. It's saved to Documents straight away.", t: "plain", tag: "you" },
    { title: "Tilly reads it", body: "Supplier, dates, lines and total, straight from the file.", t: "good", tag: "automatic" },
    { title: "Checks for a match", body: "Searches by supplier and total so it doesn't book a duplicate.", t: "good", tag: "automatic" },
    { title: "Books it", body: "A bill to pay, or an expense claim if it's already paid.", t: "watch", tag: "asks first" },
    { title: "Attaches the file", body: "The record gets the original. It moves to Attached.", t: "watch", tag: "asks first" },
  ];
  return (
    <Frame caption="If Tilly finds a likely match, it offers to attach the file to that record instead of creating a new one.">
      <div className="flex flex-wrap items-stretch gap-2 max-md:flex-col">
        {steps.map((s, i) => (
          <div key={s.title} className="flex flex-1 items-stretch gap-2 max-md:flex-col">
            <div className="flex min-w-[130px] flex-1 flex-col rounded-lg border border-border bg-background px-3 py-2.5">
              <Pill t={s.t} className="w-fit">{s.tag}</Pill>
              <div className="mt-2 text-[13px] font-medium text-foreground">{s.title}</div>
              <div className="mt-1 text-[12px] leading-[1.45] text-muted-foreground">{s.body}</div>
            </div>
            {i < steps.length - 1 && <Arrow />}
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/*  Billing                                                            */
/* ------------------------------------------------------------------ */

const PLANS: { name: string; monthly: number; annual: number; cells: string[] }[] = [
  { name: "Free", monthly: 0, annual: 0, cells: ["1", "2", "3", "No", "No", "2 GB", "200", "90 days", "7 days"] },
  { name: "Standard", monthly: 19, annual: 15, cells: ["Unlimited", "10", "Unlimited", "Yes", "No", "20 GB", "2,000", "1 year", "30 days"] },
  { name: "Premium", monthly: 49, annual: 39, cells: ["Unlimited", "50", "Unlimited", "Yes", "3 entities", "100 GB", "10,000", "3 years", "90 days"] },
  { name: "Ultimate", monthly: 99, annual: 79, cells: ["Unlimited", "Unlimited", "Unlimited", "Yes", "Unlimited", "500 GB", "50,000", "Unlimited", "1 year"] },
];

const PLAN_ROWS = [
  "Users",
  "Payroll employees",
  "Bank accounts and projects",
  "Multi-currency",
  "Consolidation",
  "File storage",
  "Emails a month",
  "Audit history",
  "Backups kept for",
];

/** The four dubbl Cloud plans and what changes between them. */
export function PlanLimitsTable() {
  return (
    <Frame
      className="p-0 md:p-0"
      caption="Prices are per organization in USD, never per user. Annual is the monthly price when you pay for a year. Invoices, contacts, journal entries, reports, the API and MCP are unlimited on every plan."
    >
      <table className="w-full min-w-[600px] text-[12.5px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left align-bottom">
              <Label>Plan</Label>
            </th>
            {PLANS.map((p) => (
              <th key={p.name} className="px-3 py-3 text-left align-bottom">
                <div className="text-[13.5px] font-medium text-foreground">{p.name}</div>
                <div className="mt-0.5 font-normal text-muted-foreground">
                  <span className="font-mono tabular-nums text-foreground">${p.monthly}</span> a month
                  {p.annual > 0 && <span> or ${p.annual} yearly</span>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLAN_ROWS.map((row, r) => (
            <tr key={row} className="border-b border-border/60 last:border-0">
              <td className="px-4 py-2 text-muted-foreground">{row}</td>
              {PLANS.map((p) => {
                const v = p.cells[r];
                return (
                  <td key={p.name} className={cn("px-3 py-2 text-foreground", v === "No" && "text-muted-foreground/60")}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/*  Stripe                                                             */
/* ------------------------------------------------------------------ */

/** Money through the Stripe clearing account: charge in, fee out, payout to the bank. */
export function StripeMoneyFlow() {
  return (
    <Frame caption="A customer pays $1,200.00 by card. Stripe keeps a $35.10 fee and pays out $1,164.90. The clearing account ends at zero once the payout lands.">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1.2fr_auto_1fr] md:items-center">
        <Box title="Customer pays">
          <Amount cents={120000} className="text-foreground" /> card charge
          <div className="mt-1.5">
            Revenue account <span className="text-foreground">credited</span>
          </div>
        </Box>
        <Arrow label="charge" />
        <div className="rounded-lg border border-foreground/40 bg-background px-4 py-3">
          <div className="text-[14px] font-medium text-foreground">Stripe clearing account</div>
          <div className="mt-1 text-[12px] text-muted-foreground">An asset: money Stripe is holding for you</div>
          <div className="mt-2.5 space-y-1 text-[12.5px]">
            <div className="flex justify-between"><span className="text-muted-foreground">Charge in</span><Amount cents={120000} className="text-foreground" /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fee out</span><Amount cents={-3510} className="text-rose-600 dark:text-rose-400" /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Payout out</span><Amount cents={-116490} className="text-rose-600 dark:text-rose-400" /></div>
            <div className="flex justify-between border-t border-border pt-1"><span className="text-foreground">Left over</span><Amount cents={0} className="text-foreground" /></div>
          </div>
        </div>
        <Arrow label="payout" />
        <Box title="Your bank account">
          <Amount cents={116490} className="text-foreground" /> arrives
          <div className="mt-1.5">Added as an already reconciled bank line</div>
        </Box>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <Dot t="watch" />
        The <Amount cents={3510} className="text-foreground" /> fee goes to your fees account as an expense.
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/*  Backups and trash                                                  */
/* ------------------------------------------------------------------ */

const RESTORED = [
  "Tax rates",
  "Cost centers",
  "Chart of accounts",
  "Contacts",
  "Bank accounts",
  "Products",
  "Projects",
  "Budgets",
  "Journal entries",
  "Invoices",
  "Quotes",
  "Purchase orders",
  "Bills",
  "Credit notes",
  "Debit notes",
  "Expenses",
  "Payments",
  "Fixed assets",
  "Loans",
  "Recurring templates",
  "Document details",
];
const NOT_RESTORED = ["Users and members", "Settings", "Bank transactions", "Payroll", "Attached files"];

/** What a restore brings back, and what stays only in the downloaded file. */
export function BackupRestoreScope() {
  return (
    <Frame caption="Restoring writes back everything on the left, with its lines, in one go. The right column was never in the backup, so a restore leaves it as it is.">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-medium text-foreground">Comes back on restore</span>
            <Pill t="good">{RESTORED.length} kinds</Pill>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {RESTORED.map((r) => (
              <span key={r} className="rounded-md border border-border bg-card px-2 py-1 text-[12px] text-foreground">{r}</span>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-medium text-foreground">Not in a backup</span>
            <Pill t="watch">left as is</Pill>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {NOT_RESTORED.map((r) => (
              <span key={r} className="rounded-md border border-border bg-background px-2 py-1 text-[12px] text-muted-foreground">{r}</span>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/*  Document templates                                                 */
/* ------------------------------------------------------------------ */

const TEMPLATE_MAP: { type: string; used: string[] }[] = [
  { type: "Invoice", used: ["Invoice PDFs", "Credit note PDFs", "Invoices in the customer portal and pay links"] },
  { type: "Quote", used: ["Quote PDFs"] },
  { type: "Purchase Order", used: ["Purchase order PDFs", "Debit note PDFs"] },
  { type: "Receipt", used: ["Cash sale receipts"] },
  { type: "Payslip", used: ["Payslip PDFs"] },
];

/** Which default template each PDF uses. */
export function TemplateDocumentMap() {
  return (
    <Frame caption="Each PDF uses the default template of its type. With no default, it uses the plain built-in look.">
      <div className="space-y-1.5">
        {TEMPLATE_MAP.map((m) => (
          <div key={m.type} className="grid items-center gap-2 md:grid-cols-[180px_auto_1fr]">
            <div className="rounded-lg border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground">
              {m.type} <span className="font-normal text-muted-foreground">default</span>
            </div>
            <Arrow />
            <div className="flex flex-wrap gap-1.5">
              {m.used.length ? (
                m.used.map((u) => <Pill key={u} t="info">{u}</Pill>)
              ) : (
                <span className="text-[12.5px] text-muted-foreground">Not used by any PDF yet</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/*  Notifications                                                      */
/* ------------------------------------------------------------------ */

/** One event, two places it can reach you. */
export function NotificationChannels() {
  return (
    <Frame caption="Your preferences decide both channels per type. Inbox is on and email is off until you change them.">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1.4fr] md:items-center">
        <Box title="Something happens">
          A payment comes in, an invoice goes overdue, something needs your approval, a bank balance runs low, a budget runs over
        </Box>
        <Arrow />
        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-background px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-medium text-foreground">Inbox</span>
              <Pill t="good">on by default</Pill>
            </div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">The bell in the top bar and the Notifications page, straight away.</div>
          </div>
          <div className="rounded-lg border border-border bg-background px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-medium text-foreground">Email</span>
              <Pill>off by default</Pill>
            </div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">
              Bundled into one digest: right away, every 30 minutes or every 2 hours.
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/*  Tags and cost centers                                              */
/* ------------------------------------------------------------------ */

/** Tags and cost centers side by side. */
export function TagsVsCostCenters() {
  const cols: { title: string; t: Tone; tag: string; rows: [string, string][] }[] = [
    {
      title: "Tags",
      t: "info",
      tag: "labels",
      rows: [
        ["What", "Free labels with a colour, as many per record as you like"],
        ["On", "Invoices, bills, expenses, journal entries, contacts, projects"],
        ["Added by", "Add tags on the record itself, or the API, MCP or Tilly"],
        ["Shows up in", "On each tagged record, and as a Tag filter on Money in vs money out"],
      ],
    },
    {
      title: "Cost centers",
      t: "good",
      tag: "reporting",
      rows: [
        ["What", "Your departments or teams, with a code and an optional parent"],
        ["On", "The transactions you categorize from your bank feed"],
        ["Added by", "The Cost centre field when you categorize or create an expense"],
        ["Shows up in", "Profit by team or project, and the general ledger filter"],
      ],
    },
  ];
  return (
    <Frame caption="Use cost centers for numbers you want to report on. Use tags for everything else you want to find later.">
      <div className="grid gap-3 md:grid-cols-2">
        {cols.map((c) => (
          <div key={c.title} className="rounded-lg border border-border bg-background p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium text-foreground">{c.title}</span>
              <Pill t={c.t}>{c.tag}</Pill>
            </div>
            <dl className="mt-2.5 space-y-1.5">
              {c.rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[88px_1fr] gap-2 text-[12.5px]">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/*  Apps                                                               */
/* ------------------------------------------------------------------ */

const DESKTOP_KEYS: [string, string][] = [
  ["⌘1 to ⌘6", "Overview, Sales, Purchases, Contacts, Accounting, Reports"],
  ["⌘J", "Tilly"],
  ["⌘[ and ⌘]", "Back and forward"],
  ["⌘R", "Reload"],
  ["⌘,", "Settings"],
];

/** The desktop app: the same web app, in its own window. */
export function DesktopAppShell() {
  return (
    <Frame caption="On Windows and Linux the shortcuts use Ctrl instead of ⌘. The pages themselves come from your server, so they're always the current version.">
      <div className="grid gap-3 md:grid-cols-[1.3fr_1fr]">
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <div className="flex h-8 items-center gap-1.5 border-b border-border bg-muted/60 px-3">
            <span className="size-2.5 rounded-full bg-rose-400" />
            <span className="size-2.5 rounded-full bg-amber-400" />
            <span className="size-2.5 rounded-full bg-emerald-400" />
            <span className="ml-3 text-[11.5px] text-muted-foreground">dubbl</span>
          </div>
          <div className="grid grid-cols-[42px_1fr]">
            <div className="space-y-2 border-r border-border bg-muted/40 p-2.5">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-4 rounded bg-muted-foreground/15" />
              ))}
            </div>
            <div className="space-y-2 p-3">
              <div className="h-3 w-24 rounded bg-foreground/70" />
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="h-10 rounded border border-border bg-card" />
                ))}
              </div>
              <div className="h-16 rounded border border-border bg-card" />
              <div className="text-[11.5px] text-muted-foreground">The web app, loaded from dubbl Cloud or your own server</div>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label>What the app adds</Label>
          <div className="space-y-1">
            {DESKTOP_KEYS.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2.5 text-[12.5px]">
                <span className="w-[74px] shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-center font-mono text-[11px] text-foreground">{k}</span>
                <span className="text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
          <ul className="space-y-1 pt-1 text-[12.5px] text-muted-foreground">
            <li className="flex gap-2"><Dot t="info" />Native window: vibrancy on macOS, Mica on Windows 11</li>
            <li className="flex gap-2"><Dot t="info" />Updates itself from GitHub releases</li>
            <li className="flex gap-2"><Dot t="info" />An offline screen with Try again</li>
          </ul>
        </div>
      </div>
    </Frame>
  );
}

const PHONE_TABS = ["Overview", "Sales", "Purchases", "Contacts", "More"];

/** The iPhone app's layout: five tabs and the round Tilly button. */
export function MobileAppTabs() {
  return (
    <Frame caption="The round button beside the tab bar opens Tilly, unless the screen you're on borrows it for its own action.">
      <div className="grid items-center gap-6 md:grid-cols-[270px_1fr]">
        <div className="mx-auto w-[262px] rounded-[34px] border border-border bg-background p-2.5 shadow-sm">
          <div className="relative h-[350px] overflow-hidden rounded-[26px] border border-border bg-card">
            <div className="mx-auto mt-2 h-5 w-20 rounded-full bg-foreground/90" />
            <div className="space-y-2 px-3.5 pt-4">
              <div className="text-[17px] font-semibold text-foreground">Overview</div>
              <div className="rounded-xl border border-border bg-background p-2.5">
                <div className="text-[10.5px] text-muted-foreground">This month</div>
                <Amount cents={4821000} className="text-[15px] font-medium text-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-xl border border-border bg-background p-2 text-[10px] text-muted-foreground">Overdue to collect</div>
                <div className="rounded-xl border border-border bg-background p-2 text-[10px] text-muted-foreground">Overdue to pay</div>
              </div>
              <div className="h-14 rounded-xl border border-border bg-background" />
            </div>
            <div className="absolute inset-x-2 bottom-2 flex items-center gap-1">
              <div className="flex min-w-0 flex-1 justify-between rounded-full border border-border bg-background/90 px-1.5 py-1.5">
                {PHONE_TABS.map((t, i) => (
                  <span key={t} className={cn("whitespace-nowrap rounded-full px-1 text-[8px]", i === 0 ? "bg-muted font-medium text-foreground" : "text-muted-foreground")}>
                    {t}
                  </span>
                ))}
              </div>
              <span className="size-7 shrink-0 rounded-full bg-gradient-to-br from-tilly-300 to-tilly-600" aria-label="Ask Tilly" />
            </div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Box title="Overview">This month, what’s overdue to collect and to pay, bank accounts and the next 4 weeks</Box>
          <Box title="Sales">Invoices: create, record a payment, share the PDF, copy the payment link</Box>
          <Box title="Purchases">Bills and expenses, with receipt scanning on new expenses</Box>
          <Box title="Contacts">Customers and suppliers, and adding new ones</Box>
          <Box title="More" className="sm:col-span-2">Every other area (accounting, tax, reports, payroll, documents and more), search, notifications, switching organization and settings</Box>
        </div>
      </div>
    </Frame>
  );
}
