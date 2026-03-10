"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  MessageSquare,
  Mail,
  Phone,
  Calendar,
  ClipboardList,
  Trophy,
  XCircle,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";

interface DealDetail {
  id: string;
  title: string;
  stageId: string;
  valueCents: number;
  currency: string;
  probability: number | null;
  expectedCloseDate: string | null;
  source: string | null;
  notes: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  contact: { id: string; name: string; email: string | null } | null;
  assignedUser: { id: string; name: string | null } | null;
  pipeline: { name: string; stages: { id: string; name: string; color: string }[] } | null;
  activities: {
    id: string;
    type: string;
    content: string | null;
    createdAt: string;
    user: { name: string | null } | null;
  }[];
}

const ACTIVITY_ICONS: Record<string, typeof MessageSquare> = {
  note: MessageSquare,
  email: Mail,
  call: Phone,
  meeting: Calendar,
  task: ClipboardList,
};

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activityType, setActivityType] = useState("note");
  const [activityContent, setActivityContent] = useState("");

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  function fetchDeal() {
    fetch(`/api/v1/crm/deals/${id}`, { headers: getHeaders() })
      .then((r) => r.json())
      .then((data) => { if (data.deal) setDeal(data.deal); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchDeal(); }, [id]);

  async function addActivity() {
    if (!activityContent.trim()) return;
    await fetch(`/api/v1/crm/deals/${id}/activities`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ type: activityType, content: activityContent }),
    });
    toast.success("Activity added");
    setActivityContent("");
    fetchDeal();
  }

  async function markWon() {
    await fetch(`/api/v1/crm/deals/${id}/won`, { method: "POST", headers: getHeaders() });
    toast.success("Deal marked as won");
    fetchDeal();
  }

  async function markLost() {
    await confirm({
      title: "Mark deal as lost?",
      description: "This deal will be moved to the closed lost stage.",
      confirmLabel: "Mark Lost",
      destructive: true,
      onConfirm: async () => {
        await fetch(`/api/v1/crm/deals/${id}/lost`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ reason: null }),
        });
        toast.success("Deal marked as lost");
        fetchDeal();
      },
    });
  }

  if (loading) return <BrandLoader />;
  if (!deal) return <div className="py-20 text-center text-sm text-muted-foreground">Deal not found</div>;

  const stages = deal.pipeline?.stages || [];
  const currentStage = stages.find((s) => s.id === deal.stageId);

  return (
    <ContentReveal>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{deal.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              {currentStage && (
                <Badge variant="outline" style={{ borderColor: currentStage.color, color: currentStage.color }}>
                  {currentStage.name}
                </Badge>
              )}
              <span className="text-sm font-mono font-medium tabular-nums">
                {formatMoney(deal.valueCents, deal.currency)}
              </span>
              {deal.probability !== null && (
                <span className="text-xs text-muted-foreground">{deal.probability}% probability</span>
              )}
            </div>
          </div>
          {!deal.wonAt && !deal.lostAt && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-red-600" onClick={markLost}>
                <XCircle className="size-3" /> Lost
              </Button>
              <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={markWon}>
                <Trophy className="size-3" /> Won
              </Button>
            </div>
          )}
          {deal.wonAt && <Badge className="bg-emerald-100 text-emerald-700">Won</Badge>}
          {deal.lostAt && <Badge className="bg-red-100 text-red-700">Lost</Badge>}
        </div>

        {/* Details */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="text-sm font-medium">Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contact</span>
                <span>{deal.contact?.name || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assigned to</span>
                <span>{deal.assignedUser?.name || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span>{deal.source || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected close</span>
                <span>{deal.expectedCloseDate || "-"}</span>
              </div>
            </div>
            {deal.notes && (
              <p className="text-xs text-muted-foreground border-t pt-2">{deal.notes}</p>
            )}
          </div>

          {/* Stage Progress */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="text-sm font-medium">Pipeline Progress</h3>
            <div className="space-y-1">
              {stages.map((stage) => {
                const isCurrent = stage.id === deal.stageId;
                const stageIdx = stages.findIndex((s) => s.id === stage.id);
                const currentIdx = stages.findIndex((s) => s.id === deal.stageId);
                const isPast = stageIdx < currentIdx;
                return (
                  <div key={stage.id} className="flex items-center gap-2">
                    <div
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: isCurrent || isPast ? stage.color : "#e5e7eb" }}
                    />
                    <span className={`text-xs ${isCurrent ? "font-medium" : "text-muted-foreground"}`}>
                      {stage.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Activity ({deal.activities.length})</h3>

          {/* Add activity */}
          <div className="flex gap-2">
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="task">Task</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Add activity..."
              value={activityContent}
              onChange={(e) => setActivityContent(e.target.value)}
              className="flex-1 h-8 text-xs"
              onKeyDown={(e) => e.key === "Enter" && addActivity()}
            />
            <Button size="sm" className="h-8 text-xs gap-1" onClick={addActivity} disabled={!activityContent.trim()}>
              <Send className="size-3" />
            </Button>
          </div>

          <div className="space-y-2">
            {deal.activities.map((activity) => {
              const Icon = ACTIVITY_ICONS[activity.type] || MessageSquare;
              return (
                <div key={activity.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
                  <Icon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{activity.user?.name || "System"}</span>
                      <Badge variant="outline" className="text-[9px]">{activity.type}</Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(activity.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {activity.content && (
                      <p className="text-xs text-muted-foreground mt-1">{activity.content}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {confirmDialog}
    </ContentReveal>
  );
}
