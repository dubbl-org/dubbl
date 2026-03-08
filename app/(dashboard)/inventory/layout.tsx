"use client";

import { Package, ClipboardList, Warehouse, BarChart3 } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/inventory", label: "Items", icon: Package, exact: true },
  { href: "/inventory/stock-takes", label: "Stock Takes", icon: ClipboardList },
  { href: "/inventory/warehouses", label: "Warehouses", icon: Warehouse },
  { href: "/inventory/valuation", label: "Valuation", icon: BarChart3 },
];

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
