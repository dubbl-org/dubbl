"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { clearQueryCache } from "@/lib/query/client";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Sparkles, Sun, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { AccountDialog } from "./edit-profile-dialog";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function UserMenu() {
  const { data: session } = useSession();
  const user = session?.user;
  const [accountOpen, setAccountOpen] = useState(false);
  const isMobile = useIsMobile();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || "?";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex size-9 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className="size-[30px]">
              <AvatarImage src={user?.image || undefined} />
              <AvatarFallback className="bg-foreground/[0.07] text-[10.5px] font-semibold text-foreground/70">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-64 rounded-xl p-0"
          align="end"
          side={isMobile ? "top" : "right"}
          sideOffset={8}
        >
          <div className="p-3">
            <div className="flex items-center gap-3">
              <Avatar className="size-10 ring-1 ring-border">
                <AvatarImage src={user?.image || undefined} />
                <AvatarFallback className="bg-foreground/[0.07] text-xs font-semibold text-foreground/70">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{user?.name || "User"}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
              </div>
            </div>
          </div>

          <DropdownMenuSeparator className="my-0" />

          <div className="p-1">
            <DropdownMenuItem
              onClick={() => setAccountOpen(true)}
              className="gap-2.5 rounded-lg px-2.5 py-2 text-[13px]"
            >
              <User className="size-4 text-muted-foreground" />
              Account
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push("/settings/billing")}
              className="gap-2.5 rounded-lg px-2.5 py-2 text-[13px]"
            >
              <Sparkles className="size-4 text-muted-foreground" />
              Plans & billing
            </DropdownMenuItem>
          </div>

          <DropdownMenuSeparator className="my-0" />

          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[13px]">Theme</span>
            <div className="flex items-center gap-0.5">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTheme(t.value)}
                  aria-label={`${t.label} theme`}
                  aria-pressed={theme === t.value}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md transition-colors",
                    theme === t.value
                      ? "bg-foreground/[0.07] text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <t.icon className="size-3.5" />
                </button>
              ))}
            </div>
          </div>

          <DropdownMenuSeparator className="my-0" />

          <div className="p-1">
            <DropdownMenuItem
              onClick={async () => {
                await clearQueryCache();
                void signOut({ callbackUrl: "/" });
              }}
              className="gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <AccountDialog
        open={accountOpen}
        onOpenChange={setAccountOpen}
        user={user || null}
      />
    </>
  );
}
