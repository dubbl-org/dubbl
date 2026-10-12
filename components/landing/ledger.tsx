import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Backdrop } from "@/components/landing/backdrops";

/*
 * Ledger primitives — the visual system for the marketing site.
 * Everything sits on a ruled page: hairline section rules, crosshairs where
 * the rules meet the page rails, mono labels, and two-tone headings.
 */

/** A small "+" registration mark centred on a rule intersection. */
export function Crosshair({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute z-10 size-[11px]", className)}>
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-foreground/35" />
      <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-foreground/35" />
    </span>
  );
}

/** Page-width band with a hairline rule on top and crosshairs on both rails. */
export function Section({
  id,
  children,
  className,
  rule = true,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  rule?: boolean;
}) {
  return (
    <section id={id} className={cn("relative scroll-mt-16", rule && "border-t border-border")}>
      <div className="relative mx-auto w-full max-w-[1600px]">
        {rule && (
          <>
            <Crosshair className="-left-[5px] -top-[6px]" />
            <Crosshair className="-right-[5px] -top-[6px]" />
          </>
        )}
        <div className={cn("px-5 sm:px-8 lg:px-12", className)}>{children}</div>
      </div>
    </section>
  );
}

/** Mono, uppercase section label: "01 — Modules". */
export function Eyebrow({ index, children, className }: { index?: string; children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground", className)}>
      {index && <span className="text-foreground">{index}</span>}
      {index && <span className="mx-2 text-muted-foreground/50">—</span>}
      {children}
    </p>
  );
}

/** Two-tone heading: a muted lead-in followed by the statement. */
export function Heading({
  lead,
  children,
  as: Tag = "h2",
  className,
}: {
  lead?: string;
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        "text-balance font-semibold tracking-[-0.045em] text-foreground",
        Tag === "h1"
          ? "text-[44px] leading-[0.98] sm:text-6xl lg:text-[80px]"
          : "text-[34px] leading-[1.04] sm:text-5xl",
        className
      )}
    >
      {lead && <span className="text-muted-foreground/60">{lead} </span>}
      {children}
    </Tag>
  );
}

/**
 * A product screenshot in a hairline window, laid on ruled "ledger paper" —
 * or, with `backdrop`, on a painted landscape.
 */
export function Shot({
  src,
  alt,
  priority,
  backdrop,
  className,
  frameClassName,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  backdrop?: Backdrop;
  className?: string;
  frameClassName?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-border bg-muted/60",
        !backdrop &&
          "bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:32px_32px]",
        className
      )}
    >
      {backdrop && <Painting backdrop={backdrop} priority={priority} />}
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_48px_-24px_rgb(0_0_0/0.18)]",
          backdrop && "border-black/10 shadow-[0_2px_4px_rgb(0_0_0/0.06),0_32px_64px_-24px_rgb(0_0_0/0.35)]",
          frameClassName
        )}
      >
        <Image src={src} alt={alt} width={2400} height={1500} priority={priority} className="block h-auto w-full" />
      </div>
    </div>
  );
}

/** A painted landscape filling its (relative, isolated) parent. */
export function Painting({
  backdrop,
  priority,
  sizes = "(min-width: 1024px) 60vw, 100vw",
  className,
}: {
  backdrop: Backdrop;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const [small, large] = backdrop.widths ?? [640, 1200];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pre-optimised AVIF, served as-is
    <img
      src={`/landing/bg/${backdrop.name}-${large}.avif`}
      srcSet={`/landing/bg/${backdrop.name}-${small}.avif ${small}w, /landing/bg/${backdrop.name}-${large}.avif ${large}w`}
      sizes={sizes}
      alt=""
      aria-hidden
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      style={{ backgroundImage: `url(${backdrop.blur})` }}
      className={cn("absolute inset-0 -z-10 size-full bg-cover bg-center object-cover dark:brightness-[0.45]", className)}
    />
  );
}
