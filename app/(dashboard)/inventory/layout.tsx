"use client";

import { Package, ClipboardList, Warehouse, BarChart3, ArrowLeftRight } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/inventory", label: "Items", icon: Package, exact: true },
  { href: "/inventory/stock-takes", label: "Stocktakes", icon: ClipboardList },
  { href: "/inventory/warehouses", label: "Locations", icon: Warehouse },
  { href: "/inventory/transfers", label: "Transfers", icon: ArrowLeftRight },
  { href: "/inventory/valuation", label: "Stock value", icon: BarChart3 },
];

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
