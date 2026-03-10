"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Target, Plus, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

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

  async function moveStage(dealId: string, stageId: string) {
    await fetch(`/api/v1/crm/deals/${dealId}/stage`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ stageId }),
    });
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stageId } : d))
    );
  }

  const stages = activePipeline?.stages?.length
    ? activePipeline.stages
    : DEFAULT_STAGES;

  const pipelineDeals = activePipeline
    ? deals.filter((d) => true) // show all for now
    : deals;

  if (loading) return <BrandLoader />;

  if (pipelines.length === 0 && deals.length === 0) {
    return (
      <ContentReveal>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
            <Target className="size-6 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">CRM / Sales Pipeline</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Track deals through your sales pipeline. Create a pipeline to get started.
          </p>
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
