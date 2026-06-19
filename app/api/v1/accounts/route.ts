import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chartAccount, taxRate } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { logAudit } from "@/lib/api/audit";
import { syncSystemAccounts } from "@/lib/db/system-accounts";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  subType: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  currencyCode: currencyCodeSchema.default("USD"),
  description: z.string().nullable().optional(),
  // Account-driven tax defaulting: lines coded to this account
  // pick up this tax rate by default.
  defaultTaxRateId: z.string().uuid().nullable().optional(),
  // Portion of activity disallowable for income tax, in basis points (10000 = 100%).
  taxDisallowedPercent: z.number().int().min(0).max(10000).optional(),
  // Optional reporting/report-code mapping for cross-client report packs.
  reportingCode: z.string().nullable().optional(),
});

/**
 * Returns true when the tax rate id is null/undefined (nothing to validate) or
 * exists and belongs to the org. Returns false for a foreign/unknown id.
 */
async function isTaxRateInOrg(
  organizationId: string,
  taxRateId: string | null | undefined
): Promise<boolean> {
  if (!taxRateId) return true;
  const rate = await db.query.taxRate.findFirst({
    where: and(
      eq(taxRate.id, taxRateId),
      eq(taxRate.organizationId, organizationId)
    ),
  });
  return !!rate;
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    // Keep the org's default categories continuously in sync with the
    // code-owned template: any default added in code shows up here for every
    // org automatically. Best-effort — never let a sync hiccup break the list.
    try {
      await syncSystemAccounts(ctx.organizationId);
    } catch {
      // non-fatal: fall through and return whatever the org already has
    }

    const accounts = await db.query.chartAccount.findMany({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        isNull(chartAccount.deletedAt)
      ),
      orderBy: chartAccount.code,
    });

    return NextResponse.json({ accounts });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:accounts");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    // Check for duplicate code
    const existing = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, parsed.code)
      ),
    });
    if (existing) {
      return NextResponse.json(
        { error: "Account code already exists" },
        { status: 409 }
      );
    }

    // Validate the default tax rate belongs to this org (if supplied)
    if (!(await isTaxRateInOrg(ctx.organizationId, parsed.defaultTaxRateId))) {
      return NextResponse.json(
        { error: "Tax rate not found" },
        { status: 400 }
      );
    }

    const [account] = await db
      .insert(chartAccount)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "chart_account", entityId: account.id, request });

    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
