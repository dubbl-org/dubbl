"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiRecords } from "@/lib/query/use-api";

interface CostCenterOpt { id: string; code: string; name: string; isActive: boolean }
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
  // Pages through every cost centre and project (the API returns at most 100 per request).
  const { rows: allCenters } = useApiRecords<CostCenterOpt>(orgId ? "/api/v1/cost-centers" : null);
  const { rows: projects } = useApiRecords<ProjectOpt>(orgId ? "/api/v1/projects?status=active" : null);
  // Inactive cost centres are hidden from the picker, except the one already
  // selected (so an existing value still shows its name).
  const centers = allCenters.filter((c) => c.isActive || c.id === costCenterId);

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
                  {!c.isActive && <span className="text-muted-foreground"> (inactive)</span>}
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
