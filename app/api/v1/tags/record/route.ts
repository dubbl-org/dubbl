import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { TAGGABLE_ENTITY_TYPES, getRecordTags } from "@/lib/api/tags";
import { z } from "zod";

const querySchema = z
  .object({
    entityType: z.enum(TAGGABLE_ENTITY_TYPES),
    entityId: z.string().uuid().optional(),
    // Comma-separated ids, for showing tags in a list (max 200).
    entityIds: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(",").filter(Boolean) : undefined))
      .pipe(z.array(z.string().uuid()).max(200).optional()),
  })
  .refine((q) => q.entityId || q.entityIds, {
    message: "entityId or entityIds is required",
  });

/**
 * GET /api/v1/tags/record?entityType=invoice&entityId=<uuid>
 *   -> { tags: Tag[] } the tags attached to one record.
 * GET /api/v1/tags/record?entityType=invoice&entityIds=<uuid>,<uuid>
 *   -> { byEntity: { [entityId]: Tag[] } } for several records at once.
 * Only the organization's non-deleted tags are returned, sorted by name.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const q = querySchema.parse({
      entityType: url.searchParams.get("entityType") ?? undefined,
      entityId: url.searchParams.get("entityId") ?? undefined,
      entityIds: url.searchParams.get("entityIds") ?? undefined,
    });

    if (q.entityId) {
      const byEntity = await getRecordTags(ctx.organizationId, q.entityType, [q.entityId]);
      return NextResponse.json({ tags: byEntity[q.entityId] ?? [] });
    }

    const byEntity = await getRecordTags(ctx.organizationId, q.entityType, q.entityIds ?? []);
    return NextResponse.json({ byEntity });
  } catch (err) {
    return handleError(err);
  }
}
