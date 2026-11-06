import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { requireProjectAccess } from "@/lib/api/project-access";
import { createProjectInvoice, getProjectUninvoiced } from "@/lib/api/project-invoicing";
import { z } from "zod";

const progressInvoiceSchema = z.object({
  milestoneIds: z.array(z.string()).optional(),
  timeEntryIds: z.array(z.string()).optional(),
  percentageToInvoice: z.number().min(0).max(100).optional(),
  contactId: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().nullable().optional(),
  // Billable-expense on-billing controls.
  includeBillableExpenses: z.boolean().optional().default(false),
  // Specific billable item ids to include; when omitted (and
  // includeBillableExpenses is true), ALL registered unbilled items are added.
  billableItemIds: z.array(z.string()).optional(),
  // Default markup (basis points) for items whose own markup is 0.
  defaultExpenseMarkupBasisPoints: z.number().int().min(0).optional().default(0),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const { project: proj } = await requireProjectAccess(ctx, id, "manage");

    const body = await request.json();
    const parsed = progressInvoiceSchema.parse(body);

    const newInvoice = await createProjectInvoice(ctx, proj, parsed);

    return NextResponse.json({ invoice: newInvoice }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const { project: proj } = await requireProjectAccess(ctx, id, "view");

    return NextResponse.json(await getProjectUninvoiced(ctx, proj));
  } catch (err) {
    return handleError(err);
  }
}
