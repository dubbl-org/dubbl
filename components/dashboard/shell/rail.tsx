"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/shared/logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserMenu } from "@/components/dashboard/user-menu";
import { cn } from "@/lib/utils";
import { TillyMark } from "@/components/dashboard/assistant/tilly-mark";
import { useAssistant, useMood } from "@/components/dashboard/assistant/assistant-context";
import { ASSISTANT_MODULE, FOOTER_MODULES, MODULE_GROUPS, findModule, type ShellModule } from "./nav";

function RailLink({ module, active }: { module: ShellModule; active: boolean }) {
  const Icon = module.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={module.href}
          aria-label={module.label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex size-9 items-center justify-center rounded-[9px] transition-colors",
            active
              ? "bg-foreground/[0.055] text-foreground"
              : "text-muted-foreground hover:bg-foreground/[0.035] hover:text-foreground"
          )}
        >
          <Icon className="size-[18px]" strokeWidth={1.75} />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {module.label}
      </TooltipContent>
    </Tooltip>
  );
}

/** Tilly's spot on the rail: its mark, moving with whatever it's doing. */
function TillyRailLink({ active }: { active: boolean }) {
  const { active: chat, chats } = useAssistant();
  const mood = useMood(chat);
  const waiting = Object.values(chats).some((c) => c.pending);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={ASSISTANT_MODULE.href}
          aria-label="Tilly"
          aria-current={active ? "page" : undefined}
          className={cn(
            "tilly-hover relative flex size-9 items-center justify-center rounded-[9px] transition-colors",
            active ? "bg-foreground/[0.055]" : "hover:bg-foreground/[0.035]"
          )}
        >
          <TillyMark size={19} state={mood} follow />
          {waiting && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-amber-500 ring-2 ring-shell" />}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        Tilly, your AI assistant
      </TooltipContent>
    </Tooltip>
  );
}

export function ShellRail() {
  const pathname = usePathname();
  const current = findModule(pathname)?.key;

  return (
    <aside data-shell="rail" className="hidden w-[60px] shrink-0 flex-col items-center border-r border-foreground/[0.07] bg-foreground/[0.025] py-3 md:flex">
      <Link
        href="/dashboard"
        aria-label="dubbl"
        data-shell="rail-logo"
        className="flex size-9 shrink-0 items-center justify-center"
      >
        <Logo className="h-[17px] w-auto" />
      </Link>

      <nav className="mt-3 flex min-h-0 flex-1 flex-col items-center gap-3.5 overflow-y-auto scrollbar-none">
        <TillyRailLink active={current === "assistant"} />
        {MODULE_GROUPS.map((group, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            {group.map((m) => (
              <RailLink key={m.key} module={m} active={current === m.key} />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 flex-col items-center gap-1 pt-3">
        {FOOTER_MODULES.map((m) => (
          <RailLink key={m.key} module={m} active={current === m.key} />
        ))}
        <div className="mt-1.5">
          <UserMenu />
        </div>
      </div>
    </aside>
  );
}
