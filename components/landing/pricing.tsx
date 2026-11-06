import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Eyebrow, Heading, Painting, Section } from "@/components/landing/ledger";
import { backdrops } from "@/components/landing/backdrops";
import { FreeBill } from "@/components/landing/pricing-mockups";
import { Live } from "@/components/landing/stage";
import { PAID_PLANS, PLAN_INFO, PLAN_PRICES } from "@/lib/plans";

/*
 * Pricing — the free plan shown as a bill where every line is $0: the whole
 * app ticks in, the total stays at zero. Paid plans sit beside it as the
 * thing you reach for once the team grows.
 */

export function Pricing() {
  return (
    <Section id="pricing" className="py-20 lg:py-28">
      <Eyebrow index="03">Pricing</Eyebrow>
      <Heading lead="Free, and generous." className="mt-5 max-w-[16ch]">
        Pay only when your team grows.
      </Heading>

      <div className="mt-12 grid gap-10 lg:mt-14 lg:grid-cols-12 lg:gap-12">
        <Live className="relative isolate h-[480px] overflow-hidden rounded-2xl sm:h-[640px] lg:col-span-7">
          <Painting backdrop={backdrops.sunflowers} sizes="(min-width: 1024px) 55vw, 100vw" />
          <div
            role="img"
            aria-label="The free plan as a bill: unlimited invoices, entries and contacts, every report, bank feeds, payroll and API access, each at $0.00"
            className="absolute inset-0 flex items-center justify-center"
          >
            <div aria-hidden className="pointer-events-none shrink-0 scale-[0.74] select-none sm:scale-100">
              <FreeBill />
            </div>
          </div>
        </Live>

        <div className="flex flex-col lg:col-span-5">
          <div>
            <p className="flex items-baseline gap-2">
              <span className="text-6xl font-semibold tracking-[-0.06em] text-foreground">$0</span>
              <span className="text-sm text-muted-foreground">forever, for one person</span>
            </p>
            <p className="mt-4 max-w-[40ch] text-[15px] leading-relaxed text-muted-foreground">
              The whole app, not a trial. Run your books, invoice clients and pay yourself without paying us.
            </p>
            <Link
              href="/sign-up"
              className="group mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
            >
              Start free
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="mt-12 lg:mt-auto">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">When you add your team</p>
            <ul className="mt-3 border-t border-border">
              {PAID_PLANS.map((plan) => (
                <li key={plan} className="flex items-baseline justify-between gap-4 border-b border-border py-3.5">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-foreground">{PLAN_INFO[plan].name}</p>
                    <p className="truncate text-[13px] text-muted-foreground">{PLAN_INFO[plan].tagline}</p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="text-[17px] font-semibold tabular-nums text-foreground">${PLAN_PRICES[plan].annual}</span>
                    <span className="text-[12px] text-muted-foreground"> / mo</span>
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[13px] text-muted-foreground">
              Per organization, billed yearly, with unlimited users. No per-seat fees.
            </p>
            <Link
              href="/pricing"
              className="group mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-foreground underline-offset-4 hover:underline"
            >
              Compare plans
              <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-foreground" />
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}
