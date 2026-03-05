"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CircleDot,
  CheckCircle2,
  Clock,
  Flag,
  StickyNote,
  Users,
  Settings2,
  Receipt,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { cn } from "@/lib/utils";
import {
  ProjectProvider,
  useProject,
  statusConfig,
  priorityConfig,
  formatHours,
  daysUntil,
} from "./project-context";
import { formatMoney } from "@/lib/money";

function ProjectLayoutInner({ children }: { children: React.ReactNode }) {
  const { project: proj, loading, orgId, projectId } = useProject();
  const pathname = usePathname();
  const router = useRouter();

  if (loading) return <BrandLoader />;
  if (!proj) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground">Project not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href="/projects">Back to projects</Link>
        </Button>
      </div>
    );
  }

  const base = `/projects/${projectId}`;
  const sc = statusConfig[proj.status] || statusConfig.active;
  const daysLeft = daysUntil(proj.endDate);
  const doneTasks = proj.tasks.filter(t => t.status === "done").length;
  const totalTasks = proj.tasks.length;
  const tabs = [
    { href: base, label: "Overview", icon: CircleDot, exact: true },
    ...(proj.enableTasks ? [{ href: `${base}/tasks`, label: "Tasks", icon: CheckCircle2, count: proj.tasks.filter(t => t.status !== "done" && t.status !== "cancelled").length }] : []),
    ...(proj.enableTimeTracking ? [{ href: `${base}/time`, label: "Time", icon: Clock }] : []),
    ...(proj.enableMilestones ? [{ href: `${base}/milestones`, label: "Milestones", icon: Flag }] : []),
    ...(proj.enableNotes ? [{ href: `${base}/notes`, label: "Notes", icon: StickyNote, count: proj.notes.length }] : []),
    { href: `${base}/members`, label: "Team", icon: Users, count: proj.members.length },
    { href: `${base}/settings`, label: "Settings", icon: Settings2 },
  ];

  async function handleGenerateInvoice() {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const data = await res.json();
      toast.success("Invoice generated");
      router.push(`/sales/${data.invoice.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate invoice");
    }
  }

  return (
    <div>
      {/* ── Header: full-width spread ── */}
      <div className="flex items-center gap-2.5 mb-3">
        <Button variant="ghost" size="icon" asChild className="shrink-0 size-7 -ml-1">
          <Link href="/projects"><ArrowLeft className="size-3.5" /></Link>
        </Button>
        <div className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: proj.color }} />
        <h1 className="text-base font-semibold tracking-tight truncate">{proj.name}</h1>
        <Badge variant="outline" className={cn("text-[10px] h-5 shrink-0", sc.color)}>
          <span className={cn("size-1.5 rounded-full mr-1", sc.dot)} />{sc.label}
        </Badge>
        <Badge variant="outline" className={cn("text-[10px] h-5 shrink-0", priorityConfig[proj.priority]?.color)}>
          {priorityConfig[proj.priority]?.label}
        </Badge>

        {/* Spacer pushes right-side stats and actions */}
        <div className="flex-1" />

        {/* Inline stats on the right */}
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground">
          {proj.enableTimeTracking && (
            <span className="flex items-center gap-1 font-mono tabular-nums">
              <Clock className="size-3" />{formatHours(proj.totalHours)}
              {proj.estimatedHours > 0 && <span className="text-muted-foreground/50">/{formatHours(proj.estimatedHours)}</span>}
            </span>
          )}
          {proj.enableTasks && totalTasks > 0 && (
            <span className="flex items-center gap-1 font-mono tabular-nums">
              <CheckCircle2 className="size-3" />{doneTasks}/{totalTasks}
            </span>
          )}
          {proj.enableBilling && proj.budget > 0 && (
            <span className="font-mono tabular-nums">{formatMoney(proj.totalBilled)}/{formatMoney(proj.budget)}</span>
          )}
          {proj.members.length > 0 && (
            <span className="flex items-center gap-1"><Users className="size-3" />{proj.members.length}</span>
          )}
          {daysLeft !== null && (
            <span className={cn("font-medium", daysLeft < 0 ? "text-red-600" : daysLeft <= 7 ? "text-amber-600" : "")}>
              {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? "Today" : `${Math.abs(daysLeft)}d late`}
            </span>
          )}
        </div>

        {proj.contact && (
          <span className="text-[11px] text-muted-foreground shrink-0 hidden lg:block border-l pl-3 ml-1">{proj.contact.name}</span>
        )}

        {proj.enableBilling && proj.contactId && (
          <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={handleGenerateInvoice}>
            <Receipt className="mr-1 size-3" />Invoice
          </Button>
        )}
      </div>

      {/* ── Gradient divider ── */}
      <div className="h-px mb-3" style={{ background: `linear-gradient(to right, ${proj.color}30, transparent)` }} />

      {/* ── Tabs ── */}
      <nav className="mb-6 flex items-center gap-1 border-b border-border">
        {tabs.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-[13px] font-medium transition-colors",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
              {"count" in tab && (tab.count as number) > 0 && (
                <span className="size-4 rounded-full bg-muted text-[9px] font-medium flex items-center justify-center ml-0.5">{tab.count as number}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <BlurReveal key={pathname}>
        {children}
      </BlurReveal>
    </div>
  );
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProjectProvider>
      <ProjectLayoutInner>{children}</ProjectLayoutInner>
    </ProjectProvider>
  );
}
