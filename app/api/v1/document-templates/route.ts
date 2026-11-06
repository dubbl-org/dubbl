import { db } from "@/lib/db";
import { documentTemplate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";
import { clearOtherDefaults } from "@/lib/documents/templates";
import { HEX_COLOR_RE } from "@/lib/documents/template-text";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const templates = await db.query.documentTemplate.findMany({
      where: and(
        eq(documentTemplate.organizationId, ctx.organizationId),
        notDeleted(documentTemplate.deletedAt)
      ),
      // Grouped by type (invoice first, in the enum's order), then oldest first.
      orderBy: [documentTemplate.type, documentTemplate.createdAt],
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
  accentColor: z.string().regex(HEX_COLOR_RE, "Accent color must be a hex colour like #10b981").optional(),
  showTaxBreakdown: z.boolean().optional(),
  showPaymentTerms: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  bankDetails: z.string().nullable().optional(),
  paymentInstructions: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    // Exactly one default per type: a new default takes over from the old one.
    const template = await db.transaction(async (tx) => {
      await clearOtherDefaults(tx, ctx.organizationId, parsed);
      const [row] = await tx
        .insert(documentTemplate)
        .values({
          organizationId: ctx.organizationId,
          ...parsed,
        })
        .returning();
      return row;
    });

    logAudit({ ctx, action: "create", entityType: "document_template", entityId: template.id, request });

    return created({ template });
  } catch (err) {
    return handleError(err);
  }
}
