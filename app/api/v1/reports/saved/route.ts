import { db } from "@/lib/db";
import { savedReport } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const reports = await db.query.savedReport.findMany({
      where: and(
        eq(savedReport.organizationId, ctx.organizationId),
        notDeleted(savedReport.deletedAt)
      ),
      orderBy: savedReport.updatedAt,
    });

    return ok({ reports });
  } catch (err) {
    return handleError(err);
  }
}

const configSchema = z.object({
  dataSource: z.enum(["invoices", "expenses", "transactions", "payroll", "inventory", "contacts"]),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    value: z.string(),
  })).default([]),
  groupBy: z.array(z.string()).default([]),
  columns: z.array(z.string()).min(1),
  dateRange: z.object({
    from: z.string(),
    to: z.string(),
  }).optional(),
  chartType: z.enum(["table", "bar", "line", "pie"]).optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  config: configSchema,
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [report] = await db
      .insert(savedReport)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        description: parsed.description || null,
        config: parsed.config,
      })
      .returning();

    return created({ report });
  } catch (err) {
    return handleError(err);
  }
}
