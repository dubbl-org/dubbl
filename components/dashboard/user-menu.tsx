"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  ChevronsUpDown,
  Sparkles,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { AccountDialog } from "./edit-profile-dialog";

export function UserMenu() {
  const { data: session } = useSession();
  const user = session?.user;
  const [accountOpen, setAccountOpen] = useState(false);
  const isMobile = useIsMobile();
  const router = useRouter();

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
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent"
          >
            <Avatar className="size-7 ring-1 ring-border">
              <AvatarImage src={user?.image || undefined} />
              <AvatarFallback className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-medium text-sidebar-accent-foreground">
                {user?.name || "User"}
              </span>
              <span className="truncate text-[11px] text-sidebar-foreground/50">
                {user?.email}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/30" />
          </SidebarMenuButton>
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
                <AvatarFallback className="text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
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
              <Sparkles className="size-4 text-emerald-600 dark:text-emerald-400" />
              Upgrade to Pro
            </DropdownMenuItem>
          </div>

          <DropdownMenuSeparator className="my-0" />

          <div className="p-1">
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/" })}
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
