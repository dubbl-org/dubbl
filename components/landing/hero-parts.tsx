import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* Hero pieces: the open-source pill and the CTAs. `glass` frosts them for
   painted grounds. */

export function SourcePill({ glass, className }: { glass?: boolean; className?: string }) {
  return (
    <a
      href="https://github.com/dubbl-org/dubbl"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group inline-flex w-fit items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[12px] transition-colors hover:text-foreground",
        glass
          ? "border-black/10 bg-background/60 text-foreground/75 backdrop-blur-md dark:border-white/10"
          : "border-border text-muted-foreground",
        className
      )}
    >
      <span className="rounded-full bg-foreground px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-background">
        Open source
      </span>
      Self-host the whole platform
      <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
    </a>
  );
}

export function Ctas({ glass, className }: { glass?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      <Link
        href="/sign-up"
        className="group inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
      >
        Start free
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <Link
        href="/docs/self-hosting"
        className={cn(
          "inline-flex h-11 items-center rounded-full border px-5 text-sm text-foreground transition-colors",
          glass
            ? "border-black/10 bg-background/60 backdrop-blur-md hover:bg-background/90 dark:border-white/10"
            : "border-border hover:bg-accent"
        )}
      >
        Self-host guide
      </Link>
    </div>
  );
}
