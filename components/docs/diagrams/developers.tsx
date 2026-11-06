import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Arrow, Box, Frame, Label, Pill, fill, type Tone } from "./frame";

// Diagrams for the Developers and Self-hosting docs: how requests reach dubbl,
// the MCP sign-in, webhook retries, and what a deployment is made of.

/* ------------------------------------------------------------------ bits */

function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[11.5px] text-foreground", className)}>{children}</code>;
}

function Down() {
  return (
    <div aria-hidden="true" className="flex justify-center py-1 text-muted-foreground/60">
      <svg width="14" height="22" viewBox="0 0 14 22" fill="none">
        <path d="M7 1v19m0 0-5-5m5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Dot({ t = "plain", className }: { t?: Tone; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", fill[t], className)} />;
}

/* ------------------------------------------------------- developers index */

const DOORS: { who: string; whoNote: string; door: string; path: string; dir: "right" | "left" | "both"; how: string; t: Tone }[] = [
  { who: "Your scripts and servers", whoNote: "A sync job, a back-office tool", door: "REST API", path: "/api/v1/...", dir: "both", how: "API key", t: "info" },
  { who: "AI agents", whoNote: "Claude, Cursor, VS Code", door: "MCP server", path: "/api/mcp", dir: "both", how: "OAuth sign-in", t: "good" },
  { who: "Your endpoint", whoNote: "Hears about events", door: "Webhooks", path: "POST to your URL", dir: "left", how: "Signed", t: "watch" },
  { who: "Spreadsheets and old tools", whoNote: "QuickBooks, Xero, FreshBooks, Wave", door: "Import and export", path: "CSV in, CSV or ZIP out", dir: "both", how: "In the app or API", t: "plain" },
];

/** The four ways software talks to dubbl, around one organization's books. */
export function DevSurfaceMap() {
  return (
    <Frame caption="Everything goes through one organization's books. Each door checks who is asking and what their role allows.">
      <div className="mx-auto max-w-[420px] rounded-lg border border-foreground/60 bg-background px-4 py-3 text-center">
        <Label>dubbl</Label>
        <div className="mt-1 text-[14px] font-medium text-foreground">Your organization&apos;s books</div>
        <div className="mt-0.5 text-[12.5px] text-muted-foreground">Accounts, contacts, invoices, bills, the bank and every report</div>
      </div>
      <div aria-hidden="true" className="mx-auto grid max-w-[640px] grid-cols-4 text-muted-foreground/60 max-sm:hidden">
        {DOORS.map((d) => (
          <div key={d.door} className="flex justify-center py-1">
            <svg width="14" height="26" viewBox="0 0 14 26" fill="none">
              <path d="M7 3v20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              {(d.dir === "right" || d.dir === "both") && <path d="m2 8 5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
              {(d.dir === "left" || d.dir === "both") && <path d="m2 18 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
            </svg>
          </div>
        ))}
      </div>
      <div className="grid gap-2 max-sm:mt-3 sm:grid-cols-2 lg:grid-cols-4">
        {DOORS.map((d) => (
          <div key={d.door} className="flex flex-col rounded-lg border border-border bg-background px-3 py-2.5">
            <Pill t={d.t} className="w-fit">{d.door}</Pill>
            <div className="mt-1.5 font-mono text-[11.5px] text-foreground">{d.path}</div>
            <div className="mt-2 text-[12.5px] font-medium text-foreground">{d.who}</div>
            <div className="text-[12px] leading-[1.45] text-muted-foreground">{d.whoNote}</div>
            <div className="mt-auto pt-2 text-[11.5px] text-muted-foreground">{d.dir === "left" ? "dubbl calls you" : "You call dubbl"} · {d.how}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ----------------------------------------------------------- authentication */

/** What an API key looks like, and which part dubbl keeps. */
export function ApiKeyAnatomy() {
  return (
    <Frame caption="The full key is shown once, when you create it. dubbl keeps only a fingerprint (a SHA-256 hash) and the first 12 characters.">
      <div className="overflow-x-auto">
        <div className="inline-flex min-w-max items-stretch font-mono text-[15px]">
          <span className="rounded-l-md bg-sky-50 px-2 py-2 text-sky-700 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30">dk_live_</span>
          <span className="rounded-r-md bg-muted px-2 py-2 text-foreground ring-1 ring-inset ring-border">q8Xr2LmN4vTz7KpW1sYc9HbJ3fDg6QaE</span>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-background px-3.5 py-2.5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground"><Dot t="info" />Prefix</div>
          <div className="mt-1 text-[12.5px] text-muted-foreground">Every key starts with <Mono>dk_</Mono>. That is how dubbl tells an API key from a session.</div>
        </div>
        <div className="rounded-lg border border-border bg-background px-3.5 py-2.5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground"><Dot />Secret</div>
          <div className="mt-1 text-[12.5px] text-muted-foreground">32 random characters. Anyone holding them can act as you, so keep them out of code and chat.</div>
        </div>
        <div className="rounded-lg border border-border bg-background px-3.5 py-2.5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground"><Dot t="good" />In the list</div>
          <div className="mt-1 text-[12.5px] text-muted-foreground">Shown as <Mono>dk_live_q8Xr...</Mono> so you can tell your keys apart.</div>
        </div>
      </div>
    </Frame>
  );
}

const CHECKS: { title: string; body: string; fail: string; code: string }[] = [
  { title: "Your request", body: "Authorization: Bearer dk_live_...", fail: "No header", code: "307 to sign-in" },
  { title: "The key", body: "Found by its hash, not expired", fail: "Unknown or expired", code: "401" },
  { title: "The organization", body: "The key's own organization; its plan includes API access", fail: "Plan without API", code: "403" },
  { title: "The person", body: "Acts as the member who made the key, with their role", fail: "Role can't do this", code: "403" },
  { title: "The input", body: "Fields, dates and amounts checked", fail: "Invalid input", code: "400" },
];

/** What dubbl checks on every API call, in order, and what you get back when a check fails. */
export function ApiRequestLifecycle() {
  return (
    <Frame caption="Checks run top to bottom. The first one that fails answers, with a JSON body like {&quot;error&quot;: &quot;Invalid API key&quot;}.">
      <ol className="space-y-1.5">
        {CHECKS.map((c, i) => (
          <li key={c.title} className="grid grid-cols-[28px_1fr] items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 sm:grid-cols-[28px_1fr_190px]">
            <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[11.5px] font-medium tabular-nums text-foreground">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-foreground">{c.title}</div>
              <div className={cn("text-[12.5px] text-muted-foreground", i === 0 && "font-mono text-[11.5px]")}>{c.body}</div>
            </div>
            <div className="flex items-center gap-2 max-sm:col-start-2 sm:justify-end">
              <span className="text-[11.5px] text-muted-foreground">{c.fail}</span>
              <Pill t="bad" className="shrink-0 font-mono">{c.code}</Pill>
            </div>
          </li>
        ))}
        <li className="grid grid-cols-[28px_1fr] items-center gap-3 rounded-lg border border-foreground/60 bg-background px-3 py-2.5 sm:grid-cols-[28px_1fr_190px]">
          <span className={cn("flex size-6 items-center justify-center rounded-full text-white", fill.good)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <div className="text-[13.5px] font-medium text-foreground">All checks pass: the endpoint runs and answers with JSON</div>
          <div className="flex justify-end max-sm:col-start-2 max-sm:justify-start"><Pill t="good" className="font-mono">200 / 201</Pill></div>
        </li>
      </ol>
    </Frame>
  );
}

/* ------------------------------------------------------------- conventions */

const UNITS: { what: string; human: string; api: string; rule: string }[] = [
  { what: "Money", human: "$4,950.00", api: "495000", rule: "Integer cents (minor units of the currency)" },
  { what: "Quantity on a line", human: "1.5 hours", api: "150", rule: "Hundredths, as stored on invoice and bill lines" },
  { what: "Tax rate or discount", human: "10%", api: "1000", rule: "Basis points: 100 = 1%" },
  { what: "Exchange rate", human: "1 EUR = 1.0845 USD", api: "1084500", rule: "The rate times 1,000,000" },
  { what: "Date", human: "Oct 13, 2026", api: "\"2026-10-13\"", rule: "YYYY-MM-DD; timestamps are ISO 8601 in UTC" },
];

/** How numbers you see in the app appear in the API. */
export function ApiUnitsTable() {
  return (
    <Frame caption="Whole numbers everywhere, so nothing is lost to rounding. Divide by 100 to show money; dubbl does the same.">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[1.1fr_1fr_0.8fr_1.6fr] gap-3 border-b border-border pb-2">
          <Label>What</Label>
          <Label>In the app</Label>
          <Label>In the API</Label>
          <Label>Rule</Label>
        </div>
        {UNITS.map((u) => (
          <div key={u.what} className="grid grid-cols-[1.1fr_1fr_0.8fr_1.6fr] items-center gap-3 border-b border-border/70 py-2.5 last:border-b-0">
            <div className="text-[13px] font-medium text-foreground">{u.what}</div>
            <div className="text-[13px] text-foreground">{u.human}</div>
            <div><Mono className="text-[12.5px]">{u.api}</Mono></div>
            <div className="text-[12.5px] text-muted-foreground">{u.rule}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** A page of results: the envelope list endpoints return. */
export function ApiPaginationPages() {
  const pages = [1, 2, 3];
  return (
    <Frame caption="137 invoices, 50 per page: three pages. Ask for the next one until page reaches totalPages.">
      <div className="flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch">
        {pages.map((p, i) => (
          <div key={p} className="flex items-center gap-2 max-md:flex-col max-md:items-stretch">
            <div className={cn("rounded-lg border bg-background px-3.5 py-2.5", p === 1 ? "border-foreground/60" : "border-border")}>
              <div className="font-mono text-[12px] text-foreground">?page={p}&amp;limit=50</div>
              <div className="mt-1.5 flex gap-0.5">
                {Array.from({ length: p === 3 ? 7 : 10 }, (_, k) => (
                  <span key={k} className={cn("h-3 w-2.5 rounded-[2px]", p === 1 ? "bg-foreground/70" : "bg-muted-foreground/30")} />
                ))}
              </div>
              <div className="mt-1.5 text-[11.5px] text-muted-foreground">{p === 3 ? "rows 101 to 137" : `rows ${(p - 1) * 50 + 1} to ${p * 50}`}</div>
            </div>
            {i < pages.length - 1 && <Arrow />}
          </div>
        ))}
        <div className="rounded-lg border border-dashed border-border px-3.5 py-2.5 font-mono text-[11.5px] leading-[1.6] text-muted-foreground">
          {"\"pagination\": {"}<br />
          {"  \"page\": 1, \"limit\": 50,"}<br />
          {"  \"total\": 137, \"totalPages\": 3"}<br />
          {"}"}
        </div>
      </div>
    </Frame>
  );
}

/* --------------------------------------------------------------------- MCP */

const LANES = ["Your AI client", "Your browser", "dubbl"];
const LANE_X = [16.67, 50, 83.33];

const MCP_STEPS: { from: number; to: number; title: string; note: string }[] = [
  { from: 0, to: 2, title: "Calls /api/mcp with no token", note: "dubbl answers 401 and points to its sign-in details (/.well-known/...)" },
  { from: 0, to: 2, title: "Registers itself", note: "POST /api/mcp/oauth/register returns a client_id" },
  { from: 0, to: 1, title: "Opens the authorize page", note: "With a PKCE challenge, so a stolen code is useless" },
  { from: 1, to: 2, title: "You sign in and choose Authorize", note: "Pick the organization the client may use" },
  { from: 2, to: 0, title: "Sends back a one-time code", note: "Valid for 5 minutes, used once" },
  { from: 0, to: 2, title: "Swaps the code for tokens", note: "Access token (1 hour) and refresh token (30 days)" },
  { from: 0, to: 2, title: "Calls tools", note: "Bearer mcp_at_..., refreshed in the background" },
];

/** The OAuth dance an MCP client does the first time it connects. */
export function McpConnectFlow() {
  return (
    <Frame caption="Your client does all of this for you. The only thing you see is the Authorize MCP Access screen.">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-3 pb-2">
          {LANES.map((l) => (
            <div key={l} className="text-center">
              <span className="inline-block rounded-md border border-border bg-background px-2.5 py-1 text-[12.5px] font-medium text-foreground">{l}</span>
            </div>
          ))}
        </div>
        <div className="relative">
          {LANE_X.map((x) => (
            <span key={x} aria-hidden="true" className="absolute inset-y-0 w-px border-l border-dashed border-border" style={{ left: `${x}%` }} />
          ))}
          {MCP_STEPS.map((s, i) => {
            const left = Math.min(LANE_X[s.from], LANE_X[s.to]);
            const width = Math.abs(LANE_X[s.to] - LANE_X[s.from]);
            const toRight = s.to > s.from;
            return (
              <div key={i} className="relative h-[58px]">
                <div className="absolute top-1.5 text-center" style={{ left: `${left}%`, width: `${width}%` }}>
                  <div className="truncate px-2 text-[12.5px] font-medium text-foreground">
                    <span className="mr-1.5 text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                    {s.title}
                  </div>
                </div>
                <div className="absolute top-[27px] h-px bg-foreground/50" style={{ left: `${left}%`, width: `${width}%` }}>
                  <svg width="8" height="10" viewBox="0 0 8 10" className={cn("absolute -top-[4.5px] fill-foreground/50", toRight ? "-right-px" : "-left-px rotate-180")} aria-hidden="true">
                    <path d="M0 0 8 5 0 10z" />
                  </svg>
                </div>
                <div className="absolute top-[33px] text-center" style={{ left: `${left}%`, width: `${width}%` }}>
                  <div className="truncate px-2 text-[11.5px] text-muted-foreground">{s.note}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------------------- webhooks */

const ATTEMPTS: { label: string; at: string; gap?: string; t: Tone }[] = [
  { label: "Attempt 1", at: "as it happens", t: "info" },
  { label: "Attempt 2", at: "+1 minute", gap: "1 min", t: "watch" },
  { label: "Attempt 3", at: "+6 minutes", gap: "5 min", t: "watch" },
  { label: "Attempt 4", at: "+36 minutes", gap: "30 min", t: "watch" },
  { label: "Attempt 5", at: "+2 h 36 min", gap: "2 hours", t: "watch" },
];

/** When dubbl tries a webhook delivery again, and when it gives up. */
export function WebhookRetryTimeline() {
  return (
    <Frame caption="Any 2xx answer within 10 seconds ends it as success. After the fifth failure the delivery is marked failed and dubbl stops trying.">
      <div className="flex flex-wrap items-center gap-1.5 max-md:flex-col max-md:items-stretch">
        {ATTEMPTS.map((a, i) => (
          <div key={a.label} className="flex items-center gap-1.5 max-md:flex-col max-md:items-stretch">
            {a.gap && <Arrow label={a.gap} />}
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <Pill t={i === 0 ? "info" : "plain"}>{a.label}</Pill>
              <div className="mt-1 text-[11.5px] text-muted-foreground">{a.at}</div>
            </div>
          </div>
        ))}
        <Arrow />
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <Pill t="bad">failed</Pill>
          <div className="mt-1 text-[11.5px] text-muted-foreground">no more tries</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><Dot t="info" />pending: first try in flight</span>
        <span className="flex items-center gap-1.5"><Dot t="watch" />retrying: waiting for the next try</span>
        <span className="flex items-center gap-1.5"><Dot t="good" />success</span>
        <span className="flex items-center gap-1.5"><Dot t="bad" />failed</span>
      </div>
    </Frame>
  );
}

/** How a receiver checks that a delivery really came from dubbl. */
export function WebhookSignatureCheck() {
  return (
    <Frame caption="Compute the HMAC over the raw body exactly as received. Parsing and re-serialising the JSON first changes the bytes and the check fails.">
      <div className="flex items-stretch gap-2 max-md:flex-col">
        <Box title="Raw request body" className="flex-1">
          <span className="font-mono text-[11.5px]">{"{\"event\":\"test\",\"data\":{...}}"}</span>
        </Box>
        <Arrow label="+ secret" />
        <Box title="HMAC-SHA256" className="flex-1">Hex digest of the body, keyed with the webhook&apos;s secret</Box>
        <Arrow label="compare" />
        <Box title="X-Dubbl-Signature" className="flex-1">
          Equal: accept it. Different: answer <span className="font-mono">401</span> and ignore it.
        </Box>
      </div>
    </Frame>
  );
}

/* ----------------------------------------------------------- import/export */

/** How a CSV becomes records: mapped in the browser, checked, then imported. */
export function ImportPipeline() {
  return (
    <Frame caption="The wizard does steps 1 and 2 in your browser. Over the API you send rows as JSON yourself, so you can skip the CSV.">
      <div className="flex items-stretch gap-1.5 max-md:flex-col">
        <Box title="Your CSV" className="flex-1">An export from QuickBooks, Xero, FreshBooks, Wave or your own sheet</Box>
        <Arrow />
        <Box title="1. Map columns" className="flex-1">Known exports are matched to dubbl&apos;s fields for you</Box>
        <Arrow />
        <Box title="2. Preview" className="flex-1"><span className="font-mono text-[11.5px]">POST /bulk/&lt;type&gt;/preview</span><br />Which rows are valid, and why not</Box>
        <Arrow />
        <Box title="3. Import" className="flex-1" active><span className="font-mono text-[11.5px]">POST /bulk/&lt;type&gt;/import</span><br />Creates records and an import job</Box>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------- self-hosting */

function Service({ name, note, t, tag }: { name: string; note: string; t: Tone; tag: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] font-medium text-foreground">{name}</span>
        <Pill t={t}>{tag}</Pill>
      </div>
      <div className="mt-1 text-[12px] leading-[1.45] text-muted-foreground">{note}</div>
    </div>
  );
}

/** What a dubbl deployment is made of. */
export function SelfHostArchitecture() {
  return (
    <Frame caption="Only the app and Postgres are needed to start. Add the rest as you need them.">
      <div className="grid gap-2 sm:grid-cols-3">
        <Box title="People in a browser">The app, the customer portal and payment pages</Box>
        <Box title="Scripts and integrations">The REST API, with <span className="font-mono">dk_live_</span> keys</Box>
        <Box title="AI agents">The MCP server, signed in with OAuth</Box>
      </div>
      <Down />
      <div className="rounded-lg border border-foreground/60 bg-background p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[14px] font-medium text-foreground">dubbl app</div>
          <div className="font-mono text-[11.5px] text-muted-foreground">Next.js, node server.js, port 3000</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["Pages", "/api/v1", "/api/mcp", "/api/auth", "/api/stripe/webhook", "/api/health", "/docs"].map((p) => (
            <span key={p} className="rounded-md bg-muted px-2 py-1 font-mono text-[11.5px] text-foreground">{p}</span>
          ))}
        </div>
      </div>
      <Down />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Service name="PostgreSQL" tag="required" t="bad" note="Every organization's books, users and settings. Version 16 in the compose files." />
        <Service name="Object storage" tag="for files" t="watch" note="S3 or anything S3-compatible (MinIO, R2). Attachments, documents and backup files." />
        <Service name="Trigger.dev" tag="for jobs" t="watch" note="Runs the nightly jobs and webhook retries. Without it, nothing runs on a schedule." />
        <Service name="Email" tag="for email" t="watch" note="Resend for account email; each organization can add its own SMTP server." />
        <Service name="Stripe" tag="optional" t="plain" note="Paid plans, invoice payment links and the Stripe integration. Leave it out and every organization is unlimited." />
        <Service name="OpenRouter" tag="optional" t="plain" note="Powers Tilly, the assistant. Off without a key." />
      </div>
    </Frame>
  );
}

const DAILY: { time: string; id: string; what: string }[] = [
  { time: "01:00", id: "invoicing-maintenance", what: "Recurring invoices, bills and expense claims, payment reminders, quotes expire, invoices and bills go overdue" },
  { time: "01:00", id: "recurring-journals", what: "Posts recurring journal entries that are due" },
  { time: "02:00", id: "bookkeeping-maintenance", what: "Depreciation, loan payments, revenue recognition, bank auto-match, budget and low-balance alerts" },
  { time: "03:00", id: "trash-purge", what: "Deletes items that have been in the trash for 30 days" },
  { time: "04:00", id: "scheduled-backups", what: "A backup of every organization, and removes expired ones" },
  { time: "05:00", id: "auto-reverse-journals", what: "Posts reversing entries whose date has arrived" },
  { time: "06:00", id: "exchange-rate-sync", what: "Fetches the day's exchange rates" },
];

/** The schedule the background jobs run on (UTC). */
export function JobSchedule() {
  return (
    <Frame caption="Times are UTC, as written in trigger/*.ts. A job that fails is tried again, up to 3 attempts in all.">
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <Pill t="info" className="font-mono">every 15 min</Pill>
          <div className="mt-1.5 text-[12.5px] text-foreground">notification-digest</div>
          <div className="text-[12px] text-muted-foreground">Emails notification digests</div>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <Pill t="info" className="font-mono">every hour</Pill>
          <div className="mt-1.5 text-[12.5px] text-foreground">report-schedules, stripe-retry</div>
          <div className="text-[12px] text-muted-foreground">Scheduled reports; failed Stripe events</div>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <Pill t="info" className="font-mono">1st, 07:00</Pill>
          <div className="mt-1.5 text-[12.5px] text-foreground">fx-revaluation</div>
          <div className="text-[12px] text-muted-foreground">Month-end revaluation of foreign balances</div>
        </div>
      </div>
      <Label>Every night</Label>
      <ol className="relative mt-2">
        <span aria-hidden="true" className="absolute bottom-3 left-[59px] top-3 w-px bg-border" />
        {DAILY.map((d) => (
          <li key={d.id} className="relative flex items-start gap-3 py-1.5">
            <span className="w-11 shrink-0 pt-px text-right font-mono text-[12px] tabular-nums text-muted-foreground">{d.time}</span>
            <span className="relative z-[1] mt-[5px] size-2.5 shrink-0 rounded-full border-2 border-background bg-foreground/70 ring-1 ring-border" />
            <span className="min-w-0">
              <span className="font-mono text-[12.5px] text-foreground">{d.id}</span>
              <span className="block text-[12px] text-muted-foreground">{d.what}</span>
            </span>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

/** Which mail path each kind of email takes. */
export function EmailRouting() {
  return (
    <Frame caption="An organization's own mail server is used only once it is verified (Connect and check, or a test email that goes through).">
      <div className="space-y-3">
        <div className="flex items-stretch gap-1.5 max-md:flex-col">
          <Box title="Invoices, quotes, credit notes, purchase orders" className="md:w-[30%]">And other documents you send, and payment reminders</Box>
          <Arrow />
          <div className="grid flex-1 gap-1.5">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[12.5px]">
              <Pill t="good">mail server verified</Pill>
              <span className="text-foreground">The organization&apos;s SMTP server, from its own address</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[12.5px]">
              <Pill>no mail server</Pill>
              <span className="text-foreground">Resend, from <span className="font-mono text-[11.5px]">RESEND_DOCUMENTS_FROM</span> (default <span className="font-mono text-[11.5px]">dubbl &lt;invoices@dubbl.dev&gt;</span>)</span>
            </div>
          </div>
        </div>
        <div className="flex items-stretch gap-1.5 max-md:flex-col">
          <Box title="Scheduled reports" className="md:w-[30%]">Sent by background jobs</Box>
          <Arrow />
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[12.5px]">
            <Pill t="watch">mail server only</Pill>
            <span className="text-foreground">Sent only through the organization&apos;s own SMTP server; without one they don&apos;t go out</span>
          </div>
        </div>
        <div className="flex items-stretch gap-1.5 max-md:flex-col">
          <Box title="Welcome, invitations, sign-in alerts, digests" className="md:w-[30%]">Account email</Box>
          <Arrow />
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[12.5px]">
            <Pill t="info">Resend</Pill>
            <span className="text-foreground">From <span className="font-mono text-[11.5px]">RESEND_FROM</span> (default <span className="font-mono text-[11.5px]">dubbl &lt;noreply@dubbl.dev&gt;</span>), using RESEND_API_KEY</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** How a file gets into the bucket: the browser uploads it directly. */
export function StorageUploadFlow() {
  return (
    <Frame caption="The file never passes through the app server. That is why the bucket must be reachable from your users' browsers.">
      <div className="flex items-stretch gap-1.5 max-md:flex-col">
        <Box title="1. Ask" className="flex-1">The browser tells dubbl the file name, type and size</Box>
        <Arrow />
        <Box title="2. Sign" className="flex-1">dubbl checks storage limits and returns a signed upload URL, valid for 1 hour</Box>
        <Arrow />
        <Box title="3. Upload" className="flex-1" active>The browser PUTs the file straight to the bucket</Box>
        <Arrow />
        <Box title="4. Download" className="flex-1">Later, dubbl hands out a signed link that lasts 5 minutes</Box>
      </div>
    </Frame>
  );
}

const STRIPE_PARTS: { title: string; what: string; env: string[]; hook: string; events: string[] }[] = [
  {
    title: "Plans and billing",
    what: "Organizations subscribe to Standard, Premium or Ultimate",
    env: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_*_PRICE_ID"],
    hook: "/api/stripe/webhook",
    events: ["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"],
  },
  {
    title: "Invoice payment links",
    what: "Customers pay an invoice by card through Stripe Checkout; dubbl records the payment and posts it to the ledger",
    env: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    hook: "/api/stripe/webhook",
    events: ["checkout.session.completed"],
  },
  {
    title: "Stripe integration",
    what: "An organization connects its own Stripe account (Connect) to sync charges, fees and payouts",
    env: ["STRIPE_SECRET_KEY", "STRIPE_CONNECT_CLIENT_ID", "STRIPE_CONNECT_WEBHOOK_SECRET"],
    hook: "/api/integrations/stripe/webhook",
    events: ["Events on connected accounts"],
  },
];

/** The three things Stripe does in dubbl, and what each one needs. */
export function StripeWiring() {
  return (
    <Frame caption="Payment links and plans share one webhook endpoint. The integration has its own, listening to connected accounts.">
      <div className="grid gap-2 md:grid-cols-3">
        {STRIPE_PARTS.map((p) => (
          <div key={p.title} className="flex flex-col rounded-lg border border-border bg-background p-3.5">
            <div className="text-[14px] font-medium text-foreground">{p.title}</div>
            <div className="mt-1 text-[12.5px] leading-[1.45] text-muted-foreground">{p.what}</div>
            <Label className="mt-3">Needs</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.env.map((e) => <span key={e} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{e}</span>)}
            </div>
            <Label className="mt-3">Webhook</Label>
            <div className="mt-1 break-all font-mono text-[11.5px] text-foreground">{p.hook}</div>
            <ul className="mt-1.5 space-y-0.5">
              {p.events.map((e) => <li key={e} className="font-mono text-[11px] text-muted-foreground">{e}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </Frame>
  );
}

const LAYERS: { name: string; what: string; how: string; t: Tone; tag: string }[] = [
  { name: "PostgreSQL", what: "Every organization, user, setting and transaction", how: "pg_dump on a schedule, kept off the server", t: "bad", tag: "essential" },
  { name: "Object storage", what: "Attachments, documents, receipts and in-app backup files", how: "Bucket versioning or a nightly sync to another bucket", t: "bad", tag: "essential" },
  { name: "Secrets", what: "AUTH_SECRET, EMAIL_ENCRYPTION_KEY, Stripe keys", how: "In your password manager, not only on the server", t: "watch", tag: "keep safe" },
  { name: "In-app backups", what: "A JSON snapshot of one organization's main records", how: "Made nightly; download or restore from Settings > Backups", t: "info", tag: "per organization" },
];

/** What to back up on a self-hosted instance. */
export function BackupLayers() {
  return (
    <Frame caption="The database and the bucket together are your whole instance. In-app backups are a convenience for one organization, not a replacement.">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {LAYERS.map((l) => (
          <div key={l.name} className="flex flex-col rounded-lg border border-border bg-background p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-medium text-foreground">{l.name}</span>
            </div>
            <Pill t={l.t} className="mt-2 w-fit">{l.tag}</Pill>
            <div className="mt-2 text-[12.5px] leading-[1.45] text-foreground/85 [overflow-wrap:anywhere]">{l.what}</div>
            <div className="mt-1.5 text-[12px] leading-[1.45] text-muted-foreground">{l.how}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** From a schema change to a running server: generate, commit, migrate, start. */
export function MigrationPipeline() {
  return (
    <Frame caption="Migrations are plain SQL files in drizzle/. db:migrate applies the ones the database hasn't seen, in order, and records each one.">
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div>
          <Label>On a developer&apos;s machine</Label>
          <div className="mt-2 space-y-1.5">
            <Box title="Change lib/db/schema">A new column, table or enum value</Box>
            <Box title="pnpm db:generate">Writes the SQL to drizzle/</Box>
            <Box title="Commit both">CI fails a pull request whose schema change has no migration</Box>
          </div>
        </div>
        <Arrow label="release" />
        <div>
          <Label>On your server</Label>
          <div className="mt-2 space-y-1.5">
            <Box title="Back up Postgres">Before every update</Box>
            <Box title="pnpm db:migrate" active>Applies pending migrations to DATABASE_URL</Box>
            <Box title="Start the new version">Restart the app container</Box>
          </div>
        </div>
      </div>
    </Frame>
  );
}
