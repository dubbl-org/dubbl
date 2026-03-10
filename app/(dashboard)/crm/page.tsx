"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Target, TrendingUp, Users, Handshake, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";

interface Deal {
  id: string;
  title: string;
  stageId: string;
  valueCents: number;
  currency: string;
  probability: number | null;
  contact: { name: string } | null;
  wonAt: string | null;
  lostAt: string | null;
}

interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string; color: string }[];
  isDefault: boolean;
}

const DEFAULT_STAGES = [
  { id: "lead", name: "Lead", color: "#94a3b8" },
  { id: "qualified", name: "Qualified", color: "#60a5fa" },
  { id: "proposal", name: "Proposal", color: "#a78bfa" },
  { id: "negotiation", name: "Negotiation", color: "#f59e0b" },
  { id: "closed_won", name: "Won", color: "#10b981" },
  { id: "closed_lost", name: "Lost", color: "#ef4444" },
];

export default function CRMPage() {
  const router = useRouter();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(null);

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/crm/pipelines", { headers: getHeaders() }).then((r) => r.json()),
      fetch("/api/v1/crm/deals", { headers: getHeaders() }).then((r) => r.json()),
    ])
      .then(([pData, dData]) => {
        const pipes = pData.pipelines || [];
        setPipelines(pipes);
        setDeals(dData.data || []);
        setActivePipeline(pipes.find((p: Pipeline) => p.isDefault) || pipes[0] || null);
      })
      .finally(() => setLoading(false));
  }, []);

  const stages = activePipeline?.stages?.length
    ? activePipeline.stages
    : DEFAULT_STAGES;

  const pipelineDeals = activePipeline
    ? deals.filter(() => true)
    : deals;

  if (loading) return <BrandLoader />;

  if (pipelines.length === 0 && deals.length === 0) {
    return (
      <ContentReveal>
        <div className="relative flex min-h-[calc(100vh-8rem)] flex-col">
          {/* Ghost kanban columns */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center gap-3 pt-6 px-4 overflow-hidden">
            {DEFAULT_STAGES.slice(0, 5).map((stage) => (
              <div key={stage.id} className="w-48 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="size-2 rounded-full" style={{ backgroundColor: stage.color, opacity: 0.4 }} />
                  <div className="h-2 w-16 rounded bg-muted" />
                  <div className="ml-auto h-4 w-5 rounded-full border border-muted-foreground/10" />
                </div>
                <div className="h-2 w-12 rounded bg-muted/50 mb-3" />
                <div className="space-y-2">
                  {Array.from({ length: stage.id === "lead" ? 3 : stage.id === "qualified" ? 2 : 1 }).map((_, i) => (
                    <div key={i} className="rounded-lg border border-muted/60 bg-card/50 p-3 space-y-2">
                      <div className="h-2.5 w-24 rounded bg-muted" />
                      <div className="h-2 w-16 rounded bg-muted/40" />
                      <div className="flex justify-between">
                        <div className="h-2 w-14 rounded bg-muted/50" />
                        <div className="h-2 w-8 rounded bg-muted/30" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="absolute inset-0 bg-gradient-to-b from-content-bg/20 via-content-bg/70 to-content-bg" />
          </div>

          {/* Centered content */}
          <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 sm:py-12 text-center">
            <div className="flex size-12 sm:size-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/50">
              <Target className="size-6 sm:size-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="mt-4 sm:mt-5 text-lg sm:text-xl font-semibold tracking-tight">Sales Pipeline</h2>
            <p className="mt-2 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Track every deal from first contact to closed won. Visualize your pipeline, forecast revenue, and never let an opportunity slip through.
            </p>
            <Button
              size="lg"
              className="mt-6 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => router.push("/crm/analytics")}
            >
              <Target className="mr-2 size-4" />
              Get started with CRM
            </Button>
          </div>

          {/* Feature cards */}
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-4 px-4 sm:px-0 pb-6 sm:pb-8">
            {[
              {
                icon: Handshake,
                title: "Deal tracking",
                description: "Create deals, assign contacts, and move them through customizable pipeline stages.",
                color: "text-blue-600 dark:text-blue-400",
                bg: "bg-blue-50 dark:bg-blue-950/40",
              },
              {
                icon: TrendingUp,
                title: "Revenue forecasting",
                description: "Set deal values and win probabilities to forecast your expected revenue.",
                color: "text-emerald-600 dark:text-emerald-400",
                bg: "bg-emerald-50 dark:bg-emerald-950/40",
              },
              {
                icon: Users,
                title: "Activity logging",
                description: "Log calls, emails, meetings, and notes to keep a full history on every deal.",
                color: "text-orange-600 dark:text-orange-400",
                bg: "bg-orange-50 dark:bg-orange-950/40",
              },
              {
                icon: BarChart3,
                title: "Pipeline analytics",
                description: "Track conversion rates, average deal size, and stage distribution at a glance.",
                color: "text-purple-600 dark:text-purple-400",
                bg: "bg-purple-50 dark:bg-purple-950/40",
              },
            ].map(({ icon: Icon, title, description, color, bg }) => (
              <div key={title} className="rounded-xl p-4 sm:p-5">
                <div className={`flex size-9 items-center justify-center rounded-lg ${bg}`}>
                  <Icon className={`size-4.5 ${color}`} />
                </div>
                <h3 className="mt-3 text-[13px] font-semibold">{title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Sales Pipeline</h2>
            <p className="text-sm text-muted-foreground">
              {pipelineDeals.length} deal{pipelineDeals.length !== 1 ? "s" : ""}
              {" "}· {formatMoney(pipelineDeals.filter((d) => !d.wonAt && !d.lostAt).reduce((s, d) => s + d.valueCents, 0))} in pipeline
            </p>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.filter((s) => s.id !== "closed_lost").map((stage) => {
            const stageDeals = pipelineDeals.filter((d) => d.stageId === stage.id);
            const stageValue = stageDeals.reduce((s, d) => s + d.valueCents, 0);

            return (
              <div key={stage.id} className="w-64 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="size-2 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-xs font-medium">{stage.name}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">{stageDeals.length}</Badge>
                </div>
                <div className="text-[10px] text-muted-foreground mb-2 font-mono tabular-nums">
                  {formatMoney(stageValue)}
                </div>
                <div className="space-y-1.5 min-h-[100px]">
                  {stageDeals.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => router.push(`/crm/deals/${d.id}`)}
                      className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <p className="text-sm font-medium truncate">{d.title}</p>
                      {d.contact && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {d.contact.name}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs font-mono tabular-nums font-medium">
                          {formatMoney(d.valueCents, d.currency)}
                        </span>
                        {d.probability !== null && (
                          <span className="text-[10px] text-muted-foreground">{d.probability}%</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ContentReveal>
  );
}
