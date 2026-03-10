import { db } from "@/lib/db";
import { documentTemplate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const templates = await db.query.documentTemplate.findMany({
      where: and(
        eq(documentTemplate.organizationId, ctx.organizationId),
        notDeleted(documentTemplate.deletedAt)
      ),
      orderBy: documentTemplate.createdAt,
    });

    return ok({ templates });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["invoice", "quote", "receipt", "payslip", "purchase_order"]),
  headerHtml: z.string().nullable().optional(),
  footerHtml: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  accentColor: z.string().optional(),
  showTaxBreakdown: z.boolean().optional(),
  showPaymentTerms: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    // If this is set as default, unset other defaults of same type
    if (parsed.isDefault) {
      const existing = await db.query.documentTemplate.findMany({
        where: and(
          eq(documentTemplate.organizationId, ctx.organizationId),
          eq(documentTemplate.type, parsed.type),
          eq(documentTemplate.isDefault, true),
          notDeleted(documentTemplate.deletedAt)
        ),
      });
      for (const t of existing) {
        await db
          .update(documentTemplate)
          .set({ isDefault: false })
          .where(eq(documentTemplate.id, t.id));
      }
    }

    const [template] = await db
      .insert(documentTemplate)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    return created({ template });
  } catch (err) {
    return handleError(err);
  }
}
