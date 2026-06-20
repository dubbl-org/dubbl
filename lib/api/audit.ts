import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import type { AuthContext } from "./auth-context";

export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, unknown> | undefined {
  const SKIP = new Set(["updatedAt", "createdAt"]);
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (SKIP.has(key)) continue;
    if (before[key] !== after[key]) {
      diff[key] = { from: before[key], to: after[key] };
    }
  }
  return Object.keys(diff).length > 0 ? { diff } : undefined;
}

interface LogAuditParams {
  ctx: AuthContext;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown>;
  request?: Request;
}

export function logAudit({
  ctx,
  action,
  entityType,
  entityId,
  changes,
  request,
}: LogAuditParams): Promise<void> {
  const ipAddress =
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request?.headers.get("x-real-ip") ||
    null;
  const userAgent = request?.headers.get("user-agent") || null;

  return db
    .insert(auditLog)
    .values({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action,
      entityType,
      entityId,
      changes: changes || null,
      ipAddress,
      userAgent,
    })
    .then(() => {})
    // Don't fail the underlying operation if the audit row can't be written,
    // but never swallow it silently — a lost "who changed what" trail must at
    // least surface in the logs so it can be investigated.
    .catch((err) => {
      console.error(
        `[audit] failed to record ${action} on ${entityType} ${entityId}:`,
        err
      );
    });
}
