import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payrollEmployee } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  position: z.string().nullable().optional(),
  salary: z.number().int().min(0).optional(),
  payFrequency: z.enum(["weekly", "biweekly", "monthly"]).optional(),
  taxRate: z.number().int().min(0).optional(),
  bankAccountNumber: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  memberId: z.string().uuid().nullable().optional(),
  compensationType: z.enum(["salary", "hourly", "milestone", "commission"]).optional(),
  hourlyRate: z.number().int().min(0).nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const employee = await db.query.payrollEmployee.findFirst({
      where: and(
        eq(payrollEmployee.id, id),
        eq(payrollEmployee.organizationId, ctx.organizationId),
        notDeleted(payrollEmployee.deletedAt)
      ),
      with: { member: { with: { user: true } } },
    });

    if (!employee) return notFound("Employee");
    return NextResponse.json({ employee });
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
    requireRole(ctx, "manage:payroll");

    const existing = await db.query.payrollEmployee.findFirst({
      where: and(
        eq(payrollEmployee.id, id),
        eq(payrollEmployee.organizationId, ctx.organizationId),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });

    if (!existing) return notFound("Employee");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(payrollEmployee)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(payrollEmployee.id, id))
      .returning();

    return NextResponse.json({ employee: updated });
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
    requireRole(ctx, "manage:payroll");

    const existing = await db.query.payrollEmployee.findFirst({
      where: and(
        eq(payrollEmployee.id, id),
        eq(payrollEmployee.organizationId, ctx.organizationId),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });

    if (!existing) return notFound("Employee");

    await db
      .update(payrollEmployee)
      .set(softDelete())
      .where(eq(payrollEmployee.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
