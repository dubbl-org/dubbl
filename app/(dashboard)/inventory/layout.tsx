"use client";

import { Package, ClipboardList, Warehouse, BarChart3, ArrowLeftRight, FolderTree, BellRing, ListTree, Hammer } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/inventory", label: "Items", icon: Package, exact: true },
  { href: "/inventory/categories", label: "Categories", icon: FolderTree, title: "Group items so they're easier to find and report on" },
  { href: "/inventory/alerts", label: "Reorder alerts", icon: BellRing, title: "Items that have dropped below their reorder point" },
  { href: "/inventory/warehouses", label: "Locations", icon: Warehouse, group: "Stock", title: "Warehouses and other places you keep stock" },
  { href: "/inventory/transfers", label: "Transfers", icon: ArrowLeftRight, group: "Stock", title: "Move stock from one location to another" },
  { href: "/inventory/stock-takes", label: "Stocktakes", icon: ClipboardList, group: "Stock", title: "Count what's on the shelf and fix any differences" },
  { href: "/inventory/bom", label: "Bills of materials", icon: ListTree, group: "Making things", title: "The parts that go into each item you build" },
  { href: "/inventory/assembly", label: "Assembly orders", icon: Hammer, group: "Making things", title: "Build finished items from their parts, using up the parts' stock" },
  { href: "/inventory/valuation", label: "Stock value", icon: BarChart3, group: "Insights", title: "What the stock you hold is worth" },
];

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
