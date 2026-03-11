import { db } from "@/lib/db";
import { bomComponent, billOfMaterials } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, notFound, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const bom = await db.query.billOfMaterials.findFirst({
      where: and(
        eq(billOfMaterials.id, id),
        eq(billOfMaterials.organizationId, ctx.organizationId),
        notDeleted(billOfMaterials.deletedAt)
      ),
    });

    if (!bom) return notFound("BOM");

    const components = await db.query.bomComponent.findMany({
      where: eq(bomComponent.bomId, id),
      with: { componentItem: true },
    });

    return ok({ components });
  } catch (err) {
    return handleError(err);
  }
}

const addSchema = z.object({
  componentItemId: z.string().uuid(),
  quantity: z.string().or(z.number()).transform(String),
  wastagePercent: z.string().or(z.number()).transform(String).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const bom = await db.query.billOfMaterials.findFirst({
      where: and(
        eq(billOfMaterials.id, id),
        eq(billOfMaterials.organizationId, ctx.organizationId),
        notDeleted(billOfMaterials.deletedAt)
      ),
    });

    if (!bom) return notFound("BOM");

    const body = await request.json();
    const parsed = addSchema.parse(body);

    const [component] = await db
      .insert(bomComponent)
      .values({
        bomId: id,
        componentItemId: parsed.componentItemId,
        quantity: parsed.quantity,
        wastagePercent: parsed.wastagePercent || "0",
      })
      .returning();

    return created({ component });
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
    requireRole(ctx, "manage:inventory");

    const url = new URL(request.url);
    const componentId = url.searchParams.get("componentId");
    if (!componentId) return notFound("Component ID required");

    await db.delete(bomComponent).where(
      and(eq(bomComponent.id, componentId), eq(bomComponent.bomId, id))
    );

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
