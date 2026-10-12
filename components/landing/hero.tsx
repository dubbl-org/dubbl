import { Check } from "lucide-react";
import { Painting } from "@/components/landing/ledger";
import { backdrops } from "@/components/landing/backdrops";
import { HeroOverviewScreen } from "@/components/landing/tour";
import { Live } from "@/components/landing/stage";
import { Ctas, SourcePill } from "@/components/landing/hero-parts";
import { cn } from "@/lib/utils";

const facts = ["Always balanced", "Open source", "357 MCP tools"];

/*
 * Split hero: copy on the left with a quiet line of facts at its foot, and on
 * the right a painted wall running to the screen's edge with the app on it at
 * true size.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-border">
      <div className="mx-auto grid max-w-[1600px] lg:h-[calc(100svh-3.5rem)] lg:min-h-[720px] lg:max-h-[920px] lg:grid-cols-[minmax(0,460px)_1fr] xl:grid-cols-[minmax(0,560px)_1fr]">
        <div className="relative z-10 flex flex-col">
          <div className="flex flex-1 flex-col justify-center px-5 py-16 sm:px-8 lg:py-12 lg:pl-12 lg:pr-10">
            <SourcePill />
            <h1 className="mt-8 text-balance text-[46px] font-semibold leading-[0.96] tracking-[-0.05em] text-foreground sm:text-6xl lg:text-[60px] xl:text-[74px]">
              Your whole business, <span className="text-muted-foreground/60">on one balanced ledger.</span>
            </h1>
            <p className="mt-6 max-w-[34ch] text-balance text-[17px] leading-relaxed text-muted-foreground sm:text-[18px]">
              Accounting, invoicing, banking and payroll — on books that always balance.
            </p>
            <Ctas className="mt-8" />
          </div>

          <Facts className="hidden lg:flex lg:px-12 lg:pb-10" />
        </div>

        <Live className="relative h-[460px] sm:h-[560px] lg:h-auto">
          {/* The painting runs from the column to the viewport's right edge */}
          <div className="absolute inset-y-0 left-0 right-[min(0px,calc((1600px-100vw)/2))] isolate overflow-hidden lg:inset-y-4 lg:rounded-l-[28px]">
            <Painting backdrop={backdrops.mistValley} priority sizes="(min-width: 1024px) 70vw, 100vw" />
            {/* Centred top-to-bottom when it fits, otherwise pinned to the top (never cut
                off there); the box is the window's scaled size */}
            <div className="absolute inset-y-0 left-8 flex items-start pt-8 sm:left-12 sm:pt-12 lg:items-center-safe lg:py-10">
              <div className="relative h-[496px] w-[794px] shrink-0 sm:h-[640px] sm:w-[1024px] xl:h-[720px] xl:w-[1152px] 2xl:h-[800px] 2xl:w-[1280px]">
                <div
                  role="img"
                  aria-label="The dubbl overview: cash in bank, money owed both ways, net profit, a to-do list being ticked off and an invoice getting paid"
                  className="absolute left-0 top-0 origin-top-left scale-[0.62] sm:scale-[0.8] xl:scale-[0.9] 2xl:scale-100"
                >
                  <div aria-hidden className="h-[800px] w-[1280px] overflow-hidden rounded-xl border border-black/10 shadow-[0_2px_4px_rgb(0_0_0/0.06),0_40px_80px_-24px_rgb(0_0_0/0.45)] dark:border-white/10">
                    <HeroOverviewScreen />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Live>
      </div>
      <Facts className="px-5 py-6 sm:px-8 lg:hidden" />
    </section>
  );
}

/** A quiet line of facts. */
function Facts({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted-foreground", className)}>
      {facts.map((f) => (
        <li key={f} className="flex items-center gap-2">
          <Check className="size-3.5 text-foreground" strokeWidth={2} />
          {f}
        </li>
      ))}
    </ul>
  );
}
