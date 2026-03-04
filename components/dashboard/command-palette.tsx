"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
  CircleDollarSign,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard, group: "Navigate" },
  { label: "Sales", href: "/sales", icon: FileText, group: "Navigate" },
  { label: "Invoices", href: "/sales", icon: FileText, group: "Navigate" },
  { label: "Quotes", href: "/sales/quotes", icon: Receipt, group: "Navigate" },
  { label: "Purchases", href: "/purchases", icon: ShoppingCart, group: "Navigate" },
  { label: "Bills", href: "/purchases", icon: ShoppingCart, group: "Navigate" },
  { label: "Expenses", href: "/purchases/expenses", icon: Wallet, group: "Navigate" },
  { label: "Purchase Orders", href: "/purchases/orders", icon: Receipt, group: "Navigate" },
  { label: "Contacts", href: "/contacts", icon: Users, group: "Navigate" },
  { label: "Accounting", href: "/accounting", icon: ArrowLeftRight, group: "Navigate" },
  { label: "Transactions", href: "/accounting", icon: ArrowLeftRight, group: "Navigate" },
  { label: "Accounts", href: "/accounting/accounts", icon: BookOpen, group: "Navigate" },
  { label: "Banking", href: "/accounting/banking", icon: Landmark, group: "Navigate" },
  { label: "Fixed Assets", href: "/accounting/fixed-assets", icon: Building2, group: "Navigate" },
  { label: "Budgets", href: "/accounting/budgets", icon: CircleDollarSign, group: "Navigate" },
  { label: "Projects", href: "/projects", icon: FolderKanban, group: "Navigate" },
  { label: "Inventory", href: "/inventory", icon: Package, group: "Navigate" },
  { label: "Payroll", href: "/payroll", icon: UserCheck, group: "Navigate" },
  { label: "Reports", href: "/reports", icon: BarChart3, group: "Navigate" },
  { label: "Settings", href: "/settings", icon: Settings, group: "Navigate" },
];

const CREATE_ITEMS = [
  { label: "New Invoice", href: "/sales/new", icon: Plus, group: "Create" },
  { label: "New Quote", href: "/sales/quotes/new", icon: Plus, group: "Create" },
  { label: "New Bill", href: "/purchases/new", icon: Plus, group: "Create" },
  { label: "New Contact", href: "/contacts/new", icon: Plus, group: "Create" },
  { label: "New Journal Entry", href: "/accounting/new", icon: Plus, group: "Create" },
  { label: "New Expense", href: "/purchases/expenses/new", icon: Plus, group: "Create" },
  { label: "New Project", href: "/projects/new", icon: Plus, group: "Create" },
  { label: "New Purchase Order", href: "/purchases/orders/new", icon: Plus, group: "Create" },
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <DialogDescription className="sr-only">Search for a command to run...</DialogDescription>
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
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
                  key={item.label}
                  value={item.label}
                  onSelect={() => navigate(item.href)}
                >
                  <item.icon className="mr-2 size-4 text-emerald-600 dark:text-emerald-400" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
