"use client";

import { useEffect, useState } from "react";

export interface PipelineStage {
  id: string;
  name: string;
  color: string;
}

export interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
  isDefault: boolean;
}

/** Stage ids the API uses when a deal is marked won or lost. */
export const WON_STAGE = "closed_won";
export const LOST_STAGE = "closed_lost";

export const DEFAULT_STAGES: PipelineStage[] = [
  { id: "lead", name: "Lead", color: "#94a3b8" },
  { id: "qualified", name: "Qualified", color: "#60a5fa" },
  { id: "proposal", name: "Proposal", color: "#a78bfa" },
  { id: "negotiation", name: "Negotiation", color: "#f59e0b" },
  { id: WON_STAGE, name: "Won", color: "#10b981" },
  { id: LOST_STAGE, name: "Lost", color: "#ef4444" },
];

export const DEAL_SOURCES: Record<string, string> = {
  website: "Website",
  referral: "Referral",
  cold_outreach: "Cold outreach",
  event: "Event",
  other: "Other",
};

/** Stages a deal can sit in while it's still open (won and lost are outcomes, not columns). */
export function openStages(pipeline: Pipeline | null | undefined) {
  const stages = pipeline?.stages?.length ? pipeline.stages : DEFAULT_STAGES;
  return stages.filter((s) => s.id !== WON_STAGE && s.id !== LOST_STAGE);
}

/** Loads the workspace's pipelines once. */
export function usePipelines() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    fetch("/api/v1/crm/pipelines", { headers: { "x-organization-id": orgId } })
      .then((r) => (r.ok ? r.json() : { pipelines: [] }))
      .then((data) => {
        if (!cancelled) setPipelines(data.pipelines ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return { pipelines, loading, reload: () => setVersion((v) => v + 1) };
}

/** Find a stage's name and colour in whichever pipeline owns it. */
export function stageInfo(pipelines: Pipeline[], pipelineId: string | null | undefined, stageId: string) {
  const own = pipelines.find((p) => p.id === pipelineId)?.stages.find((s) => s.id === stageId);
  if (own) return own;
  for (const p of pipelines) {
    const hit = p.stages.find((s) => s.id === stageId);
    if (hit) return hit;
  }
  return DEFAULT_STAGES.find((s) => s.id === stageId) ?? { id: stageId, name: stageId.replace(/_/g, " "), color: "#A1A1AA" };
}
