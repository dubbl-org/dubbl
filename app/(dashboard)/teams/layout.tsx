"use client";

import { LayoutDashboard, Users } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/teams", label: "Teams", icon: LayoutDashboard, exact: true },
  { href: "/teams/members", label: "Members", icon: Users },
];

export default function TeamsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
