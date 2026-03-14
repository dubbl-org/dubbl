import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const senderSchema = z.object({
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
  registrationNumber: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
}).partial().refine((v) => Object.keys(v).length > 0, "At least one field required");

const recipientSchema = z.object({
  name: z.string().min(1),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  taxNumber: z.string().nullable().optional(),
}).partial().refine((v) => Object.keys(v).length > 0, "At least one field required");

const updateSchema = z.object({
  sender: senderSchema.optional(),
  recipient: recipientSchema.optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const inv = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!inv) return notFound("Invoice");

    return NextResponse.json({
      sender: inv.senderSnapshot || null,
      recipient: inv.recipientSnapshot || null,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const inv = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!inv) return notFound("Invoice");
    if (inv.status === "draft") {
      return NextResponse.json(
        { error: "Draft invoices don't have snapshots yet, edit the invoice directly" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (parsed.sender) {
      const existing = (inv.senderSnapshot || {}) as Record<string, unknown>;
      updates.senderSnapshot = { ...existing, ...parsed.sender };
    }

    if (parsed.recipient) {
      const existing = (inv.recipientSnapshot || {}) as Record<string, unknown>;
      updates.recipientSnapshot = { ...existing, ...parsed.recipient };
    }

    const [updated] = await db
      .update(invoice)
      .set(updates)
      .where(eq(invoice.id, id))
      .returning();

    return NextResponse.json({
      sender: updated.senderSnapshot,
      recipient: updated.recipientSnapshot,
    });
  } catch (err) {
    return handleError(err);
  }
}
