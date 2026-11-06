"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookOpen, Check, ChevronsUpDown, Code2, GraduationCap, Server } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "fumadocs-ui/components/ui/popover";
import { cn } from "@/lib/utils";

// The four parts of the docs; the header switcher moves between them from any page.
export const DOC_SECTIONS = [
  { prefix: "/docs/guides", href: "/docs/guides", name: "Guides", text: "Using dubbl, screen by screen", icon: BookOpen },
  { prefix: "/docs/learn", href: "/docs/learn", name: "Learn", text: "Bookkeeping and tax, explained", icon: GraduationCap },
  { prefix: "/docs/developers", href: "/docs/developers", name: "Developers", text: "REST API, MCP, webhooks and apps", icon: Code2 },
  { prefix: "/docs/self-hosting", href: "/docs/self-hosting", name: "Self-hosting", text: "Run dubbl on your own server", icon: Server },
];

export function SectionSwitcher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = DOC_SECTIONS.find((s) => pathname.startsWith(s.prefix)) ?? DOC_SECTIONS[0];
  const Icon = current.icon;

  return (
    <div className="flex items-center">
      <span aria-hidden="true" className="mx-3 h-5 w-px rotate-12 bg-border" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-[14px] font-medium text-foreground transition-colors hover:bg-accent">
          <Icon className="size-4 text-muted-foreground" />
          {current.name}
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-1.5">
          {DOC_SECTIONS.map((s) => {
            const active = s === current;
            const ItemIcon = s.icon;
            return (
              <Link
                key={s.prefix}
                href={s.href}
                onClick={() => setOpen(false)}
                className={cn("flex items-start gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-accent", active && "bg-accent")}
              >
                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground">
                  <ItemIcon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-foreground">{s.name}</span>
                  <span className="block text-[12.5px] text-muted-foreground">{s.text}</span>
                </span>
                {active && <Check className="mt-1 size-3.5 text-foreground" />}
              </Link>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}
