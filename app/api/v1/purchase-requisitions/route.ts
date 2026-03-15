import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { purchaseRequisition, purchaseRequisitionLine } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { getNextNumber } from "@/lib/api/numbering";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
});

const createSchema = z.object({
  contactId: z.string().nullable().optional(),
  requestDate: z.string().min(1),
  requiredDate: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");

    const conditions = [
      eq(purchaseRequisition.organizationId, ctx.organizationId),
      notDeleted(purchaseRequisition.deletedAt),
    ];

    if (
      status &&
      ["draft", "submitted", "approved", "rejected", "converted"].includes(
        status
      )
    ) {
      conditions.push(
        eq(purchaseRequisition.status, status as "draft")
      );
    }

    const items = await db.query.purchaseRequisition.findMany({
      where: and(...conditions),
      orderBy: desc(purchaseRequisition.createdAt),
      limit,
      offset,
      with: { contact: true, lines: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(purchaseRequisition)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(
        items,
        Number(countResult?.count || 0),
        page,
        limit
      )
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const requisitionNumber = await getNextNumber(
      ctx.organizationId,
      "purchase_requisition",
      "requisition_number",
      "REQ"
    );

    let subtotal = 0;
    const processedLines = parsed.lines.map((l, i) => {
      const amount = Math.round(l.quantity * l.unitPrice * 100);
      subtotal += amount;
      return {
        description: l.description,
        quantity: Math.round(l.quantity * 100),
        unitPrice: Math.round(l.unitPrice * 100),
        accountId: l.accountId || null,
        taxRateId: l.taxRateId || null,
        taxAmount: 0,
        amount,
        sortOrder: i,
      };
    });

    const [created] = await db
      .insert(purchaseRequisition)
      .values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId || null,
        requisitionNumber,
        requestDate: parsed.requestDate,
        requiredDate: parsed.requiredDate || null,
        reference: parsed.reference || null,
        notes: parsed.notes || null,
        subtotal,
        taxTotal: 0,
        total: subtotal,
        requestedBy: ctx.userId,
      })
      .returning();

    if (processedLines.length > 0) {
      await db
        .insert(purchaseRequisitionLine)
        .values(
          processedLines.map((l) => ({ requisitionId: created.id, ...l }))
        );
    }

    logAudit({ ctx, action: "create", entityType: "purchase_requisition", entityId: created.id, request });

    return NextResponse.json({ requisition: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
