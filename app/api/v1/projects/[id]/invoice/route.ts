import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { requireProjectAccess } from "@/lib/api/project-access";
import { createProjectInvoice } from "@/lib/api/project-invoicing";
import { z } from "zod";

const invoiceSchema = z.object({
  issueDate: z.string().min(1).optional(),
  dueDate: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  // Include registered (not-yet-billed) billable expenses on this invoice.
  includeBillableExpenses: z.boolean().optional().default(true),
  // Markup (basis points, 1000 = 10%) applied to billable expenses whose own
  // markup is 0 (i.e. a default markup at invoice time). Each item's stored
  // markup takes precedence when non-zero.
  defaultExpenseMarkupBasisPoints: z.number().int().min(0).optional().default(0),
});

/**
 * Quick "bill everything unbilled" draft invoice. Respects the billing type:
 * hourly projects bill every unbilled billable time entry; fixed price and
 * milestone projects only pick up billable expenses here (their work is billed
 * through /progress-invoice); non-billable projects are refused.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const { project: proj } = await requireProjectAccess(ctx, id, "manage");

    const body = await request.json().catch(() => ({}));
    const parsed = invoiceSchema.parse(body);

    const created = await createProjectInvoice(ctx, proj, {
      allUnbilledTime: proj.billingType === "hourly",
      includeBillableExpenses: parsed.includeBillableExpenses,
      defaultExpenseMarkupBasisPoints: parsed.defaultExpenseMarkupBasisPoints,
      issueDate: parsed.issueDate,
      dueDate: parsed.dueDate,
      notes: parsed.notes,
    });

    return NextResponse.json({ invoice: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
