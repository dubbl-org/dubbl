import { db } from "@/lib/db";
import { deal } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const pipelineId = url.searchParams.get("pipelineId");

    const conditions = [
      eq(deal.organizationId, ctx.organizationId),
      notDeleted(deal.deletedAt),
    ];
    if (pipelineId) conditions.push(eq(deal.pipelineId, pipelineId));

    const deals = await db.query.deal.findMany({
      where: and(...conditions),
      with: { contact: true, assignedUser: true },
      orderBy: desc(deal.createdAt),
    });

    return ok({ data: deals });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  pipelineId: z.string().uuid(),
  stageId: z.string(),
  contactId: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  valueCents: z.number().int().min(0).optional(),
  currency: z.string().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  source: z.enum(["website", "referral", "cold_outreach", "event", "other"]).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [d] = await db
      .insert(deal)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    return created({ deal: d });
  } catch (err) {
    return handleError(err);
  }
}
