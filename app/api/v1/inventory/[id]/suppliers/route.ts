import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { linkItemSupplier, listItemSuppliers } from "@/lib/api/inventory-suppliers";
import { z } from "zod";

const createSchema = z.object({
  contactId: z.string().uuid(),
  supplierCode: z.string().nullable().optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  purchasePrice: z.number().int().min(0).optional(),
  isPreferred: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    return NextResponse.json({ data: await listItemSuppliers(ctx.organizationId, id) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    const parsed = createSchema.parse(await request.json());
    const created = await linkItemSupplier(ctx, id, parsed);
    return NextResponse.json({ inventoryItemSupplier: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
