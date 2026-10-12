import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { CHART_TEMPLATES, chartTemplateForCountry, seededAccountsFor } from "@/lib/db/chart-templates";
import { applyChartTemplate, ChartTemplateError } from "@/lib/api/org-setup";

/** GET: the available default charts, the org's current one and its country's default. */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
      columns: { chartTemplate: true, countryCode: true },
    });
    return NextResponse.json({
      templates: Object.values(CHART_TEMPLATES).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        accountCount: seededAccountsFor(t).length,
      })),
      current: org?.chartTemplate ?? null,
      recommended: chartTemplateForCountry(org?.countryCode).id,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const applySchema = z.object({ templateId: z.string().min(1) });

/** POST { templateId }: switch to a template (only before anything is posted). */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:accounts");
    const { templateId } = applySchema.parse(await request.json());
    const t = await applyChartTemplate(ctx.organizationId, templateId);
    return NextResponse.json({ template: { id: t.id, name: t.name } });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ChartTemplateError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
