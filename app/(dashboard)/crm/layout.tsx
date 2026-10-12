"use client";

import { KanbanSquare, Handshake, Activity, BarChart3, Workflow } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/crm", label: "Pipeline", icon: KanbanSquare, exact: true, title: "Your open deals laid out by stage. Drag a card to move it on" },
  { href: "/crm/deals", label: "Deals", icon: Handshake, title: "Every deal in one searchable list, including won and lost" },
  { href: "/crm/activities", label: "Activities", icon: Activity, title: "Calls, emails, meetings, notes and tasks across all deals" },
  { href: "/crm/analytics", label: "Analytics", icon: BarChart3, group: "Insights", title: "Win rate, pipeline value and where deals are stuck" },
  { href: "/crm/pipelines", label: "Pipelines & stages", icon: Workflow, group: "Setup", title: "Add pipelines and rename, recolour or reorder their stages" },
];

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
