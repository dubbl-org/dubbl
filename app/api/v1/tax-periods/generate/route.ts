import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { organization, taxPeriod } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { generatePeriods } from "@/lib/tax/periods";

const bodySchema = z.object({
  fiscalYear: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .describe("The fiscal year to generate periods for, e.g. 2026"),
});

/**
 * Generate the filing calendar for a fiscal year.
 *
 * For a Singapore org that is its GST periods (monthly or quarterly, from the
 * registration date), one ECI period and one Form C-S period. Idempotent: rows
 * already present are left alone, so this is safe to run on every visit. The
 * unique index on (organization, return kind, start, end) is what enforces it.
 *
 * Returns the generated rows, the deadlines the calendar shows, and the ids of
 * the ones that already existed.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:tax-config");
    const { fiscalYear } = bodySchema.parse(await request.json());

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
      columns: {
        fiscalYearStartMonth: true,
        gstRegisteredAt: true,
        gstDeregisteredAt: true,
        gstFilingFrequency: true,
        gstPeriodStartMonth: true,
      },
    });

    const generated = generatePeriods(org ?? {}, fiscalYear);
    if (generated.length === 0) {
      return NextResponse.json({
        fiscalYear,
        created: [],
        existing: 0,
        note: "No GST registration date is set, so only the annual returns would exist — nothing to generate.",
        periods: [],
      });
    }

    const inserted = await db
      .insert(taxPeriod)
      .values(
        generated.map((p) => ({
          organizationId: ctx.organizationId,
          name: p.name,
          startDate: p.startDate,
          endDate: p.endDate,
          type: p.type,
          returnKind: p.returnKind,
          authority: p.authority,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: taxPeriod.id, name: taxPeriod.name });

    return NextResponse.json({
      fiscalYear,
      created: inserted,
      existing: generated.length - inserted.length,
      periods: generated,
    });
  } catch (err) {
    return handleError(err);
  }
}
