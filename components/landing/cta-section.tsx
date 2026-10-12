import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Heading, Painting, Section } from "@/components/landing/ledger";
import { backdrops } from "@/components/landing/backdrops";

export function CTASection() {
  return (
    <Section className="py-10 lg:py-12">
      <div className="relative isolate flex flex-col gap-10 overflow-hidden rounded-2xl border border-border px-6 py-16 sm:px-12 lg:px-16 lg:py-24">
        <Painting backdrop={backdrops.shoreGrass} sizes="100vw" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <Heading lead="Balanced books," className="max-w-[14ch] lg:text-7xl [&>span]:text-foreground/45">
          starting today.
        </Heading>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/sign-up"
              className="group inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
            >
              Start free
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="mailto:team@dubbl.dev"
              className="inline-flex h-11 items-center rounded-full border border-border bg-background/80 px-5 text-sm text-foreground backdrop-blur transition-colors hover:bg-background"
            >
              Talk to us
            </a>
          </div>
          <p className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground">
            Open source · Self-hostable · Free forever
          </p>
        </div>
      </div>
    </Section>
  );
}
