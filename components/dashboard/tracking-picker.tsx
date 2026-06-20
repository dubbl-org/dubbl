"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CostCenterOpt { id: string; code: string; name: string }
interface ProjectOpt { id: string; name: string }

/**
 * Optional "project / tracking" capture used across the expense flows so every
 * flow can tag a line to a cost centre and/or project consistently. Renders
 * nothing when the org has neither configured, so it never shows empty pickers.
 */
export function TrackingPicker({
  orgId,
  costCenterId,
  projectId,
  onChange,
}: {
  orgId: string | null;
  costCenterId: string;
  projectId: string;
  onChange: (v: { costCenterId: string; projectId: string }) => void;
}) {
  const [centers, setCenters] = useState<CostCenterOpt[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);

  useEffect(() => {
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };
    fetch("/api/v1/cost-centers?limit=200", { headers })
      .then((r) => r.json())
      .then((d) => setCenters((d.data ?? []).map((c: CostCenterOpt) => ({ id: c.id, code: c.code, name: c.name }))))
      .catch(() => {});
    fetch("/api/v1/projects?status=active&limit=200", { headers })
      .then((r) => r.json())
      .then((d) => setProjects((d.data ?? []).map((p: ProjectOpt) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
  }, [orgId]);

  if (centers.length === 0 && projects.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {centers.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Cost centre (optional)</Label>
          <Select
            value={costCenterId || "none"}
            onValueChange={(v) => onChange({ costCenterId: v === "none" ? "" : v, projectId })}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {centers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="text-muted-foreground tabular-nums">{c.code}</span> {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {projects.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Project (optional)</Label>
          <Select
            value={projectId || "none"}
            onValueChange={(v) => onChange({ costCenterId, projectId: v === "none" ? "" : v })}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
