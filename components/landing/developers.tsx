import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, Sparkles } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Eyebrow, Heading, Painting, Section } from "@/components/landing/ledger";
import { backdrops } from "@/components/landing/backdrops";
import { LiveDot, Window, label, loop, mono } from "@/components/landing/mockups";
import { Live, ScaledStage } from "@/components/landing/stage";
import { cn } from "@/lib/utils";

/*
 * Developers — one picture of how dubbl connects: an AI agent and your own
 * app talk to the books on the left; webhooks and your own server go out on
 * the right. Pulses run along the lines in the direction data flows.
 */

const T = 9;
const Dim = ({ children }: { children: React.ReactNode }) => <span className="text-muted-foreground">{children}</span>;

function Head({ icon, title, tag }: { icon: React.ReactNode; title: string; tag: string }) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2.5">
      <span className="flex items-center gap-2 text-[12.5px] font-semibold">{icon}{title}</span>
      <span className={cn("text-[10.5px] text-muted-foreground", mono)}>{tag}</span>
    </div>
  );
}

function AgentCard() {
  return (
    <Window className="w-[360px]">
      <Head icon={<Sparkles className="size-3.5" />} title="AI agent" tag="MCP" />
      <div className={cn("space-y-1.5 px-4 py-3 text-[12px]", mono)}>
        <p><Dim>&gt;</Dim> Which invoices are overdue?</p>
        <p style={loop(T)} className="lp-a lp-in-0"><Dim>⏺</Dim> list_invoices <Dim>status=overdue</Dim></p>
        <p style={loop(T)} className="lp-a lp-in-1 font-sans">Two invoices, <span className="font-semibold">£3,200.00</span>.</p>
        <p style={loop(T)} className="lp-a lp-in-3"><Dim>⏺</Dim> bulk_send_invoice_reminders <Dim>×2</Dim></p>
      </div>
    </Window>
  );
}

function ApiCard() {
  return (
    <Window className="w-[360px]">
      <Head icon={<span className="rounded bg-foreground px-1 font-mono text-[9.5px] text-background">GET</span>} title="Your app" tag="REST API" />
      <div className={cn("space-y-1.5 px-4 py-3 text-[12px]", mono)}>
        <p className="truncate">/api/v1/invoices?status=overdue</p>
        <p style={loop(T)} className="lp-a lp-in-1 flex items-center gap-2 font-sans text-[11px]">
          <span className="rounded-full bg-foreground/[0.07] px-1.5 py-px font-medium">200 OK</span>
          <Dim>84 ms</Dim>
        </p>
        <p style={loop(T)} className="lp-a lp-in-2">
          {"{ "}<Dim>&quot;amountDue&quot;:</Dim> 200000{" }"}{" "}
          <span className="rounded bg-foreground/[0.07] px-1 font-sans text-[10px]">cents</span>
        </p>
      </div>
    </Window>
  );
}

function BooksCard() {
  return (
    <Window className="w-[260px]">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Logo className="h-[15px] w-[19px]" />
        <span className="text-[13px] font-semibold">Your books</span>
        <LiveDot className="ml-auto" />
      </div>
      <div className="px-4 py-3">
        <p className={label}>JE-0193 · INV-0042 paid</p>
        <div className={cn("mt-2 space-y-1 text-[11.5px]", mono)}>
          <div className="flex justify-between"><span>090 Bank</span><span>Dr 5,040.00</span></div>
          <div className="flex justify-between"><span>610 Receivables</span><span>Cr 5,040.00</span></div>
        </div>
        <p className="mt-2.5 flex items-center gap-1.5 border-t pt-2 text-[11px] text-muted-foreground">
          <Check className="size-3" strokeWidth={2.5} /> Balanced
        </p>
      </div>
    </Window>
  );
}

function WebhookCard() {
  return (
    <Window className="w-[360px]">
      <Head icon={<ArrowUpRight className="size-3.5" />} title="Webhooks" tag="acme.dev/hooks" />
      <div className="divide-y">
        {[
          ["invoice.paid", "INV-0042 · £5,040.00", 1],
          ["journal.posted", "JE-0193 · balanced", 2],
        ].map(([e, d, k]) => (
          <div key={e} style={loop(T)} className={cn("lp-a flex items-center gap-3 px-4 py-2", `lp-in-${k}`)}>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[12px] font-medium", mono)}>{e}</p>
              <p className="truncate text-[11px] text-muted-foreground">{d}</p>
            </div>
            <span className="rounded-full bg-foreground/[0.07] px-1.5 py-px font-mono text-[10.5px] font-medium">200</span>
          </div>
        ))}
      </div>
    </Window>
  );
}

function ServerCard() {
  const out = "text-white/45";
  return (
    <Window className="w-[360px] border-white/10 bg-[#0d0d0d] text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="size-2.5 rounded-full bg-white/15" />)}</span>
        <span className={cn("text-[10.5px]", out, mono)}>Your server</span>
      </div>
      <div className={cn("space-y-1.5 px-4 py-3 text-[12px]", mono)}>
        <p><span className={out}>$</span> docker compose up -d</p>
        <p style={loop(T)} className={cn("lp-a lp-in-1", out)}>✔ Container dubbl-app-1 <span className="text-white">Started</span></p>
        <p style={loop(T)} className="lp-a lp-in-2">→ dubbl on localhost:3000</p>
      </div>
    </Window>
  );
}

/* Design canvas: 1200 × 480. Cards sit at fixed spots, connectors join them. */
const links = [
  "M380,120 C430,120 425,212 470,212", // AI agent → books
  "M380,360 C430,360 425,268 470,268", // your app → books
  "M730,212 C775,212 770,120 820,120", // books → webhooks
  "M730,268 C775,268 770,360 820,360", // books → your server
];

function Diagram() {
  return (
    <div className="relative h-[480px] w-[1200px]">
      <svg viewBox="0 0 1200 480" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        {links.map((d, i) => (
          <g key={d}>
            <path d={d} fill="none" className="stroke-foreground/25" strokeWidth="1.5" strokeDasharray="3 5" />
            <path
              d={d}
              pathLength={1}
              fill="none"
              strokeLinecap="round"
              strokeWidth="3"
              style={{ animationDelay: `${i * 0.7}s` }}
              className="lp-a lp-packet stroke-foreground"
            />
          </g>
        ))}
      </svg>
      <div className="absolute left-5 top-5"><AgentCard /></div>
      <div className="absolute bottom-5 left-5"><ApiCard /></div>
      <div className="absolute left-[470px] top-1/2 -translate-y-1/2"><BooksCard /></div>
      <div className="absolute right-5 top-8"><WebhookCard /></div>
      <div className="absolute bottom-8 right-5"><ServerCard /></div>
    </div>
  );
}

/** Small screens: the same story, top to bottom. */
function Stack() {
  const arrow = <ArrowDown className="mx-auto size-4 text-foreground/40" />;
  return (
    <div className="flex flex-col items-center gap-3 [&>div]:w-full [&>div]:max-w-[360px] [&_.w-\[360px\]]:w-full [&_.w-\[260px\]]:w-full">
      <div><AgentCard /></div>
      <div><ApiCard /></div>
      {arrow}
      <div><BooksCard /></div>
      {arrow}
      <div><WebhookCard /></div>
      <div><ServerCard /></div>
    </div>
  );
}

const docs = [
  { label: "API reference", href: "/docs/api-reference" },
  { label: "Connect an AI agent", href: "/docs/guides/mcp" },
  { label: "Self-hosting guide", href: "/docs/self-hosting" },
];

export function Developers() {
  return (
    <Section id="developers" className="py-20 lg:py-28">
      <Eyebrow index="02">Developers</Eyebrow>
      <Heading lead="API-first." className="mt-5 max-w-[18ch]">
        Your books, programmable.
      </Heading>

      <Live className="relative isolate mt-12 overflow-hidden rounded-2xl px-4 py-10 sm:px-8 lg:mt-14 lg:py-14">
        <Painting backdrop={backdrops.moonGrass} sizes="100vw" />
        <div className="hidden md:block">
          <ScaledStage
            width={1200}
            height={480}
            className="mx-auto"
            label="An AI agent over MCP and your app over the REST API read and write your books; webhooks and your own server get every change"
          >
            <Diagram />
          </ScaledStage>
        </div>
        <div className="md:hidden">
          <Stack />
        </div>
      </Live>

      <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
        {docs.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="group inline-flex items-center gap-1.5 text-[14px] font-medium text-foreground underline-offset-4 hover:underline"
          >
            {l.label}
            <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-foreground" />
          </Link>
        ))}
      </div>
    </Section>
  );
}
