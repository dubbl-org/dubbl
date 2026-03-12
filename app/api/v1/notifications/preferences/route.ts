import { db } from "@/lib/db";
import { notificationPreference } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { ok, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const prefs = await db.query.notificationPreference.findMany({
      where: and(
        eq(notificationPreference.organizationId, ctx.organizationId),
        eq(notificationPreference.userId, ctx.userId)
      ),
    });

    return ok({ preferences: prefs });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  preferences: z.array(
    z.object({
      type: z.enum([
        "invoice_overdue",
        "payment_received",
        "inventory_low",
        "payroll_due",
        "approval_needed",
        "system_alert",
        "task_assigned",
      ]),
      channel: z.enum(["in_app", "email"]).default("in_app"),
      enabled: z.boolean(),
      digestIntervalMinutes: z.number().int().min(0).optional(),
    })
  ),
});

export async function PUT(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    // Upsert each preference
    for (const pref of parsed.preferences) {
      const existing = await db.query.notificationPreference.findFirst({
        where: and(
          eq(notificationPreference.organizationId, ctx.organizationId),
          eq(notificationPreference.userId, ctx.userId),
          eq(notificationPreference.type, pref.type),
          eq(notificationPreference.channel, pref.channel)
        ),
      });

      if (existing) {
        await db
          .update(notificationPreference)
          .set({
            enabled: pref.enabled,
            ...(pref.digestIntervalMinutes !== undefined && {
              digestIntervalMinutes: pref.digestIntervalMinutes,
            }),
          })
          .where(eq(notificationPreference.id, existing.id));
      } else {
        await db.insert(notificationPreference).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          type: pref.type,
          channel: pref.channel,
          enabled: pref.enabled,
          digestIntervalMinutes: pref.digestIntervalMinutes ?? 30,
        });
      }
    }

    const prefs = await db.query.notificationPreference.findMany({
      where: and(
        eq(notificationPreference.organizationId, ctx.organizationId),
        eq(notificationPreference.userId, ctx.userId)
      ),
    });

    return ok({ preferences: prefs });
  } catch (err) {
    return handleError(err);
  }
}
