import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import type { AuthContext } from "./auth-context";

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
    .catch(() => {});
}
