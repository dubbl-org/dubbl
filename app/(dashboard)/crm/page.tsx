"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Target, TrendingUp, Users, Handshake, BarChart3, ArrowRight, Plus, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { PageHeader } from "@/components/dashboard/page-header";
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

const EASE = [0.22, 1, 0.36, 1] as const;

const COLUMN_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: EASE },
  }),
};

const CARD_VARIANTS = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.04, duration: 0.3, ease: EASE },
  }),
};

export default function CRMPage() {
  const router = useRouter();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [newDealTitle, setNewDealTitle] = useState("");
  const [newDealValue, setNewDealValue] = useState("");
  const [newDealStage, setNewDealStage] = useState("");
  const [newDealProbability, setNewDealProbability] = useState("");
  const [creatingDeal, setCreatingDeal] = useState(false);

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  async function fetchCRM() {
    try {
      const [pData, dData] = await Promise.all([
        fetch("/api/v1/crm/pipelines", { headers: getHeaders() }).then((r) => r.json()),
        fetch("/api/v1/crm/deals", { headers: getHeaders() }).then((r) => r.json()),
      ]);
      const pipes = pData.pipelines || [];
      setPipelines(pipes);
      setDeals(dData.data || []);
      setActivePipeline(pipes.find((p: Pipeline) => p.isDefault) || pipes[0] || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCRM();
  }, []);

  async function handleSetupPipeline() {
    setSetupLoading(true);
    try {
      const res = await fetch("/api/v1/crm/pipelines", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          name: "Sales Pipeline",
          stages: DEFAULT_STAGES.map((s) => ({ id: s.id, name: s.name, color: s.color })),
          isDefault: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create pipeline");
      }
      await fetchCRM();
      toast.success("Pipeline created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set up pipeline");
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleCreateDeal() {
    if (!newDealTitle.trim() || !activePipeline || creatingDeal) return;
    setCreatingDeal(true);
    try {
      const stageId = newDealStage || stages[0]?.id || "lead";
      const res = await fetch("/api/v1/crm/deals", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          pipelineId: activePipeline.id,
          stageId,
          title: newDealTitle,
          valueCents: newDealValue ? Math.round(parseFloat(newDealValue) * 100) : 0,
          currency: "USD",
          probability: newDealProbability ? parseInt(newDealProbability) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create deal");
      }
      setNewDealOpen(false);
      setNewDealTitle("");
      setNewDealValue("");
      setNewDealStage("");
      setNewDealProbability("");
      await fetchCRM();
      toast.success("Deal created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create deal");
    } finally {
      setCreatingDeal(false);
    }
  }

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
        <div className="pt-12 pb-12 space-y-10">
          {/* Top: title + CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Sales Pipeline</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Track every deal from first contact to closed won. Visualize your pipeline, forecast revenue, and never let an opportunity slip through.
              </p>
            </div>
            <Button
              onClick={handleSetupPipeline}
              disabled={setupLoading}
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            >
              <Plus className="mr-2 size-4" />
              {setupLoading ? "Setting up..." : "Create Pipeline"}
            </Button>
          </div>

          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
            {/* Left: mock kanban pipeline */}
            <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
              <div className="bg-muted/30 px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Example pipeline
                </p>
              </div>
              <div className="p-5">
                {/* Stage flow visualization */}
                <div className="flex items-center gap-2 mb-5 overflow-hidden">
                  {DEFAULT_STAGES.slice(0, 5).map((stage, i) => (
                    <div key={stage.id} className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="size-2 rounded-full" style={{ backgroundColor: stage.color, opacity: 0.7 }} />
                        <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">{stage.name}</span>
                      </div>
                      {i < 4 && <ArrowRight className="size-3 text-muted-foreground/30 shrink-0" />}
                    </div>
                  ))}
                </div>
                {/* Mock deal cards */}
                <div className="space-y-2">
                  {[
                    { title: "Acme Corp - Enterprise Plan", contact: "Sarah Johnson", value: "$48,000", prob: "75%", stage: DEFAULT_STAGES[2] },
                    { title: "TechStart SaaS Migration", contact: "Mike Chen", value: "$24,500", prob: "60%", stage: DEFAULT_STAGES[1] },
                    { title: "GlobalRetail POS System", contact: "Lisa Park", value: "$120,000", prob: "30%", stage: DEFAULT_STAGES[0] },
                  ].map((deal) => (
                    <div key={deal.title} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: deal.stage.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{deal.title}</p>
                        <p className="text-[11px] text-muted-foreground">{deal.contact}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono font-medium tabular-nums">{deal.value}</p>
                        <p className="text-[10px] text-muted-foreground">{deal.prob}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 h-px bg-border" />
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground font-mono tabular-nums">3 deals · $192,500 in pipeline</p>
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                    55% avg. probability
                  </Badge>
                </div>
              </div>
            </div>

            {/* Right: benefits */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                What you can do
              </p>
              {[
                {
                  title: "Track deals through stages",
                  desc: "Create deals, assign contacts, and drag them through your customizable pipeline stages.",
                  icon: Handshake,
                  color: "border-l-blue-400",
                },
                {
                  title: "Forecast revenue",
                  desc: "Set deal values and win probabilities to project expected revenue across your pipeline.",
                  icon: DollarSign,
                  color: "border-l-emerald-400",
                },
                {
                  title: "Log every interaction",
                  desc: "Record calls, emails, meetings, and notes so you never lose context on a deal.",
                  icon: Users,
                  color: "border-l-orange-400",
                },
                {
                  title: "Analyze performance",
                  desc: "Track conversion rates, deal velocity, and stage distribution at a glance.",
                  icon: BarChart3,
                  color: "border-l-violet-400",
                },
              ].map(({ title, desc, icon: Icon, color }) => (
                <div key={title} className={`rounded-lg border border-l-[3px] ${color} bg-card px-4 py-3`}>
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium">{title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-[22px]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ContentReveal>
    );
  }

  const activeDeals = pipelineDeals.filter((d) => !d.wonAt && !d.lostAt);
  const pipelineValue = activeDeals.reduce((s, d) => s + d.valueCents, 0);

  return (
    <ContentReveal className="space-y-6">
      <PageHeader
        title="Sales Pipeline"
        description={`${pipelineDeals.length} deal${pipelineDeals.length !== 1 ? "s" : ""} · ${formatMoney(pipelineValue)} in pipeline`}
      >
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setNewDealOpen(true)}>
          <Plus className="size-3" /> New Deal
        </Button>
      </PageHeader>

      {/* Kanban Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.filter((s) => s.id !== "closed_lost").map((stage, colIdx) => {
          const stageDeals = pipelineDeals.filter((d) => d.stageId === stage.id);
          const stageValue = stageDeals.reduce((s, d) => s + d.valueCents, 0);

          return (
            <motion.div
              key={stage.id}
              custom={colIdx}
              variants={COLUMN_VARIANTS}
              initial="hidden"
              animate="visible"
              className="w-64 shrink-0"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="size-2 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="text-xs font-medium">{stage.name}</span>
                <Badge variant="outline" className="text-[10px] ml-auto">{stageDeals.length}</Badge>
              </div>
              <div className="text-[10px] text-muted-foreground mb-2 font-mono tabular-nums">
                {formatMoney(stageValue)}
              </div>
              <div className="space-y-1.5 min-h-[100px]">
                {stageDeals.map((d, cardIdx) => (
                  <motion.button
                    key={d.id}
                    custom={cardIdx}
                    variants={CARD_VARIANTS}
                    initial="hidden"
                    animate="visible"
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
                  </motion.button>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      <Dialog open={newDealOpen} onOpenChange={setNewDealOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Deal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input
                placeholder="e.g. Acme Corp - Enterprise Plan"
                value={newDealTitle}
                onChange={(e) => setNewDealTitle(e.target.value)}
                className="h-8 text-sm"
                disabled={creatingDeal}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Stage</Label>
              <Select value={newDealStage || stages[0]?.id} onValueChange={setNewDealStage}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.filter((s) => s.id !== "closed_lost" && s.id !== "closed_won").map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Value</Label>
                <CurrencyInput
                  value={newDealValue}
                  onChange={setNewDealValue}
                  placeholder="0.00"
                  className="h-8 text-sm"
                  disabled={creatingDeal}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Probability %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="50"
                  value={newDealProbability}
                  onChange={(e) => setNewDealProbability(e.target.value)}
                  className="h-8 text-sm"
                  disabled={creatingDeal}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setNewDealOpen(false)} disabled={creatingDeal}>
                Cancel
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={handleCreateDeal} disabled={!newDealTitle.trim() || creatingDeal}>
                {creatingDeal ? "Creating..." : "Create Deal"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </ContentReveal>
  );
}
