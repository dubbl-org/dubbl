import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { approvalRequest, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { processApprovalAction } from "@/lib/approvals/engine";
import { z } from "zod";

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "comment"]),
  comment: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    // Verify request belongs to this org
    const existing = await db.query.approvalRequest.findFirst({
      where: and(
        eq(approvalRequest.id, id),
        eq(approvalRequest.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) return notFound("Approval request");

    const body = await request.json();
    const parsed = actionSchema.parse(body);

    // Resolve the member ID for the current user in this org
    const mem = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, ctx.organizationId),
        eq(member.userId, ctx.userId)
      ),
    });

    if (!mem) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 403 }
      );
    }

    const updated = await processApprovalAction(
      id,
      mem.id,
      parsed.action,
      parsed.comment
    );

    return NextResponse.json({ request: updated });
  } catch (err) {
    if (err instanceof Error && err.message.includes("not the approver")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return handleError(err);
  }
}
