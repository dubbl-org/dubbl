import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { procurementSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { DEFAULT_PROCUREMENT_SETTINGS } from "@/lib/api/procurement";
import { z } from "zod";

/**
 * Per-org procurement (three-way-match) settings. Tolerances are in BASIS POINTS
 * (500 = 5%). A single row per org (organizationId is unique); GET returns the
 * defaults when none exists yet, PUT upserts.
 */
const updateSchema = z.object({
  priceTolerancePercent: z.number().int().min(0).max(100000).optional(),
  qtyTolerancePercent: z.number().int().min(0).max(100000).optional(),
  requireGrnBeforeBill: z.boolean().optional(),
  blockOverBill: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const existing = await db.query.procurementSettings.findFirst({
      where: eq(procurementSettings.organizationId, ctx.organizationId),
    });

    return NextResponse.json({
      procurementSettings: existing ?? {
        organizationId: ctx.organizationId,
        ...DEFAULT_PROCUREMENT_SETTINGS,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.procurementSettings.findFirst({
      where: eq(procurementSettings.organizationId, ctx.organizationId),
    });

    let saved;
    if (existing) {
      [saved] = await db
        .update(procurementSettings)
        .set({
          ...(parsed.priceTolerancePercent !== undefined && { priceTolerancePercent: parsed.priceTolerancePercent }),
          ...(parsed.qtyTolerancePercent !== undefined && { qtyTolerancePercent: parsed.qtyTolerancePercent }),
          ...(parsed.requireGrnBeforeBill !== undefined && { requireGrnBeforeBill: parsed.requireGrnBeforeBill }),
          ...(parsed.blockOverBill !== undefined && { blockOverBill: parsed.blockOverBill }),
          updatedAt: new Date(),
        })
        .where(eq(procurementSettings.organizationId, ctx.organizationId))
        .returning();
    } else {
      [saved] = await db
        .insert(procurementSettings)
        .values({
          organizationId: ctx.organizationId,
          priceTolerancePercent: parsed.priceTolerancePercent ?? DEFAULT_PROCUREMENT_SETTINGS.priceTolerancePercent,
          qtyTolerancePercent: parsed.qtyTolerancePercent ?? DEFAULT_PROCUREMENT_SETTINGS.qtyTolerancePercent,
          requireGrnBeforeBill: parsed.requireGrnBeforeBill ?? DEFAULT_PROCUREMENT_SETTINGS.requireGrnBeforeBill,
          blockOverBill: parsed.blockOverBill ?? DEFAULT_PROCUREMENT_SETTINGS.blockOverBill,
        })
        .returning();
    }

    logAudit({ ctx, action: "update", entityType: "procurement_settings", entityId: saved.id, request });

    return NextResponse.json({ procurementSettings: saved });
  } catch (err) {
    return handleError(err);
  }
}
