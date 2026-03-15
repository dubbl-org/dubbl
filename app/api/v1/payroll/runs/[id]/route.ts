import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payrollRun, payrollItem } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const run = await db.query.payrollRun.findFirst({
      where: and(
        eq(payrollRun.id, id),
        eq(payrollRun.organizationId, ctx.organizationId),
        notDeleted(payrollRun.deletedAt)
      ),
      with: {
        items: {
          with: { employee: true },
        },
      },
    });

    if (!run) return notFound("Payroll run");
    return NextResponse.json({ run });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const run = await db.query.payrollRun.findFirst({
      where: and(
        eq(payrollRun.id, id),
        eq(payrollRun.organizationId, ctx.organizationId),
        notDeleted(payrollRun.deletedAt)
      ),
    });

    if (!run) return notFound("Payroll run");

    if (run.status === "completed") {
      // Void instead of delete
      await db
        .update(payrollRun)
        .set({ status: "void" })
        .where(eq(payrollRun.id, id));

      logAudit({
        ctx,
        action: "delete",
        entityType: "payroll_run",
        entityId: id,
        changes: run as Record<string, unknown>,
        request,
      });

      return NextResponse.json({ success: true, voided: true });
    }

    // Delete items and soft-delete run
    await db.delete(payrollItem).where(eq(payrollItem.payrollRunId, id));
    await db
      .update(payrollRun)
      .set(softDelete())
      .where(eq(payrollRun.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "payroll_run",
      entityId: id,
      changes: run as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
