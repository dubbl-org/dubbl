"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  FileText,
  Users,
  BookOpen,
  ArrowLeftRight,
  BarChart3,
  ShoppingCart,
  Receipt,
  Landmark,
  Wallet,
  Package,
  FolderKanban,
  Building2,
  UserCheck,
  Settings,
  Plus,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard, group: "Navigate" },
  { label: "Contacts", href: "/contacts", icon: Users, group: "Navigate" },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight, group: "Navigate" },
  { label: "Accounts", href: "/accounts", icon: BookOpen, group: "Navigate" },
  { label: "Invoices", href: "/invoices", icon: FileText, group: "Navigate" },
  { label: "Quotes", href: "/quotes", icon: Receipt, group: "Navigate" },
  { label: "Bills", href: "/bills", icon: ShoppingCart, group: "Navigate" },
  { label: "Purchase Orders", href: "/purchase-orders", icon: Receipt, group: "Navigate" },
  { label: "Banking", href: "/banking", icon: Landmark, group: "Navigate" },
  { label: "Expenses", href: "/expenses", icon: Wallet, group: "Navigate" },
  { label: "Reports", href: "/reports", icon: BarChart3, group: "Navigate" },
  { label: "Inventory", href: "/inventory", icon: Package, group: "Navigate" },
  { label: "Projects", href: "/projects", icon: FolderKanban, group: "Navigate" },
  { label: "Fixed Assets", href: "/fixed-assets", icon: Building2, group: "Navigate" },
  { label: "Payroll", href: "/payroll", icon: UserCheck, group: "Navigate" },
  { label: "Settings", href: "/settings", icon: Settings, group: "Navigate" },
];

const CREATE_ITEMS = [
  { label: "New Invoice", href: "/invoices/new", icon: Plus, group: "Create" },
  { label: "New Quote", href: "/quotes/new", icon: Plus, group: "Create" },
  { label: "New Bill", href: "/bills/new", icon: Plus, group: "Create" },
  { label: "New Contact", href: "/contacts/new", icon: Plus, group: "Create" },
  { label: "New Journal Entry", href: "/transactions/new", icon: Plus, group: "Create" },
  { label: "New Expense", href: "/expenses/new", icon: Plus, group: "Create" },
  { label: "New Project", href: "/projects/new", icon: Plus, group: "Create" },
  { label: "New Purchase Order", href: "/purchase-orders/new", icon: Plus, group: "Create" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onCustomOpen() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("open-command-palette", onCustomOpen);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("open-command-palette", onCustomOpen);
    };
  }, []);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Create">
          {CREATE_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              value={item.label}
              onSelect={() => navigate(item.href)}
            >
              <item.icon className="mr-2 size-4 text-emerald-600 dark:text-emerald-400" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              value={item.label}
              onSelect={() => navigate(item.href)}
            >
              <item.icon className="mr-2 size-4 text-emerald-600 dark:text-emerald-400" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
