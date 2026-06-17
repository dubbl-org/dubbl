import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  project,
  projectBillableItem,
  bill,
  billLine,
} from "@/lib/db/schema";
import { eq, and, isNull, inArray, notInArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

/** Billed amount for a cost line = cost grossed up by the markup (basis points). */
function withMarkup(cost: number, markupBasisPoints: number): number {
  return Math.round(cost * (1 + markupBasisPoints / 10000));
}

/**
 * GET — list this project's billable expenses.
 *
 * Returns three buckets:
 *   - registered: projectBillableItem rows NOT yet billed (ready to invoice)
 *   - billed:     projectBillableItem rows already on-billed (history)
 *   - candidates: bill lines tagged with this projectId that are NOT yet
 *                 registered as billable items — surfaced so a user/agent can
 *                 register them via POST. Only lines on non-draft/void bills.
 * All amounts in integer cents.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });
    if (!proj) return notFound("Project");

    const items = await db
      .select()
      .from(projectBillableItem)
      .where(
        and(
          eq(projectBillableItem.organizationId, ctx.organizationId),
          eq(projectBillableItem.projectId, id)
        )
      );

    const registered = items
      .filter((i) => i.billedInvoiceId == null)
      .map((i) => ({
        id: i.id,
        sourceType: i.sourceType,
        sourceLineId: i.sourceLineId,
        description: i.description,
        costAmount: i.costAmount,
        markupBasisPoints: i.markupBasisPoints,
        billableAmount: withMarkup(i.costAmount, i.markupBasisPoints),
      }));

    const billed = items
      .filter((i) => i.billedInvoiceId != null)
      .map((i) => ({
        id: i.id,
        sourceType: i.sourceType,
        sourceLineId: i.sourceLineId,
        description: i.description,
        costAmount: i.costAmount,
        markupBasisPoints: i.markupBasisPoints,
        billedAmount: i.billedAmount,
        billedInvoiceId: i.billedInvoiceId,
        billedAt: i.billedAt,
      }));

    // Candidate bill lines tagged with this project, excluding any already
    // registered (by source line id).
    const registeredBillLineIds = items
      .filter((i) => i.sourceType === "bill_line")
      .map((i) => i.sourceLineId);

    const candidateRows = await db
      .select({
        lineId: billLine.id,
        description: billLine.description,
        amount: billLine.amount,
        billId: bill.id,
        billNumber: bill.billNumber,
      })
      .from(billLine)
      .innerJoin(bill, eq(billLine.billId, bill.id))
      .where(
        and(
          eq(bill.organizationId, ctx.organizationId),
          eq(billLine.projectId, id),
          notInArray(bill.status, ["draft", "void"]),
          registeredBillLineIds.length > 0
            ? notInArray(billLine.id, registeredBillLineIds)
            : undefined
        )
      );

    const candidates = candidateRows.map((r) => ({
      sourceType: "bill_line" as const,
      sourceLineId: r.lineId,
      description: r.description,
      costAmount: r.amount,
      billId: r.billId,
      billNumber: r.billNumber,
    }));

    const registeredTotal = registered.reduce((s, i) => s + i.billableAmount, 0);

    return NextResponse.json({
      projectId: id,
      registered,
      billed,
      candidates,
      registeredCount: registered.length,
      registeredBillableTotal: registeredTotal,
    });
  } catch (err) {
    return handleError(err);
  }
}

const registerSchema = z.object({
  items: z
    .array(
      z.object({
        sourceType: z
          .enum(["bill_line", "expense_item", "journal_line"])
          .default("bill_line")
          .describe("Which kind of cost line this billable item points at"),
        sourceLineId: z
          .string()
          .min(1)
          .describe("Id of the source cost line (e.g. bill_line.id)"),
        description: z.string().optional(),
        // Cost amount override (cents). For bill_line, resolved from the line if omitted.
        costAmount: z.number().int().min(0).optional(),
        // Markup in basis points (1000 = 10%).
        markupBasisPoints: z.number().int().min(0).default(0),
      })
    )
    .min(1),
});

/**
 * POST — register one or more cost lines as billable for this project.
 *
 * For bill_line items, the cost amount + description are resolved from the bill
 * line itself (org-scoped) when not supplied. Idempotent per (project, source
 * line): re-registering updates the markup/description rather than duplicating.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const body = await request.json();
    const parsed = registerSchema.parse(body);

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });
    if (!proj) return notFound("Project");

    // Resolve bill-line costs/descriptions in one query (org-scoped).
    const billLineIds = parsed.items
      .filter((i) => i.sourceType === "bill_line")
      .map((i) => i.sourceLineId);
    const billLineMap = new Map<string, { amount: number; description: string }>();
    if (billLineIds.length > 0) {
      const rows = await db
        .select({
          lineId: billLine.id,
          amount: billLine.amount,
          description: billLine.description,
        })
        .from(billLine)
        .innerJoin(bill, eq(billLine.billId, bill.id))
        .where(
          and(
            eq(bill.organizationId, ctx.organizationId),
            inArray(billLine.id, billLineIds)
          )
        );
      for (const r of rows) {
        billLineMap.set(r.lineId, { amount: r.amount, description: r.description });
      }
    }

    const created: { id: string }[] = [];
    for (const item of parsed.items) {
      let costAmount = item.costAmount;
      let description = item.description;
      if (item.sourceType === "bill_line") {
        const src = billLineMap.get(item.sourceLineId);
        if (!src) {
          return validationError(
            `Bill line ${item.sourceLineId} not found in this organization`
          );
        }
        costAmount = costAmount ?? src.amount;
        description = description ?? src.description;
      }
      if (costAmount == null) {
        return validationError(
          `costAmount is required for ${item.sourceType} ${item.sourceLineId}`
        );
      }

      const [row] = await db
        .insert(projectBillableItem)
        .values({
          organizationId: ctx.organizationId,
          projectId: id,
          sourceType: item.sourceType,
          sourceLineId: item.sourceLineId,
          description: description ?? "Billable expense",
          costAmount,
          markupBasisPoints: item.markupBasisPoints,
        })
        .onConflictDoUpdate({
          target: [
            projectBillableItem.projectId,
            projectBillableItem.sourceType,
            projectBillableItem.sourceLineId,
          ],
          set: {
            description: description ?? "Billable expense",
            costAmount,
            markupBasisPoints: item.markupBasisPoints,
          },
        })
        .returning({ id: projectBillableItem.id });
      if (row) created.push(row);
    }

    logAudit({
      ctx,
      action: "register_billable_items",
      entityType: "project",
      entityId: id,
      changes: { count: created.length },
      request,
    });

    return NextResponse.json({ registered: created.length, items: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

const deleteSchema = z.object({
  itemId: z.string().min(1),
});

/**
 * DELETE — unregister a (not-yet-billed) billable item. Once billed, it is
 * locked (delete the invoice to reverse). Pass ?itemId= as a query param.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const url = new URL(request.url);
    const itemId = url.searchParams.get("itemId");
    const parsed = deleteSchema.parse({ itemId });

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });
    if (!proj) return notFound("Project");

    const existing = await db.query.projectBillableItem.findFirst({
      where: and(
        eq(projectBillableItem.id, parsed.itemId),
        eq(projectBillableItem.organizationId, ctx.organizationId),
        eq(projectBillableItem.projectId, id)
      ),
    });
    if (!existing) return notFound("Billable item");
    if (existing.billedInvoiceId != null) {
      return validationError("Cannot remove an already-billed item");
    }

    await db
      .delete(projectBillableItem)
      .where(
        and(
          eq(projectBillableItem.id, parsed.itemId),
          isNull(projectBillableItem.billedInvoiceId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
