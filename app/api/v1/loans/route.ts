import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loan, loanSchedule } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import {
  calculatePMT,
  generateAmortizationSchedule,
} from "@/lib/api/amortization";
import { decimalToCents } from "@/lib/money";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  bankAccountId: z.string().optional(),
  principalAmount: z.number().positive(),
  interestRate: z.number().min(0), // basis points
  termMonths: z.number().int().positive(),
  startDate: z.string().min(1),
  principalAccountId: z.string().min(1),
  interestAccountId: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(loan.organizationId, ctx.organizationId),
      notDeleted(loan.deletedAt),
    ];

    const loans = await db.query.loan.findMany({
      where: and(...conditions),
      orderBy: desc(loan.createdAt),
      limit,
      offset,
      with: {
        bankAccount: true,
        principalAccount: true,
        interestAccount: true,
      },
    });

    const [countResult] = await db
      .select({ count: db.$count(loan) })
      .from(loan)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(loans, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const principalCents = decimalToCents(parsed.principalAmount);
    const monthlyPayment = calculatePMT(
      principalCents,
      parsed.interestRate,
      parsed.termMonths
    );

    if (monthlyPayment <= 0) {
      return validationError("Invalid loan parameters");
    }

    // Create the loan
    const [created] = await db
      .insert(loan)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        bankAccountId: parsed.bankAccountId || null,
        principalAmount: principalCents,
        interestRate: parsed.interestRate,
        termMonths: parsed.termMonths,
        startDate: parsed.startDate,
        monthlyPayment,
        principalAccountId: parsed.principalAccountId,
        interestAccountId: parsed.interestAccountId,
      })
      .returning();

    // Generate amortization schedule
    const schedule = generateAmortizationSchedule(
      principalCents,
      parsed.interestRate,
      parsed.termMonths,
      parsed.startDate
    );

    // Insert schedule entries
    await db.insert(loanSchedule).values(
      schedule.map((entry) => ({
        loanId: created.id,
        periodNumber: entry.periodNumber,
        date: entry.date,
        principalAmount: entry.principalAmount,
        interestAmount: entry.interestAmount,
        totalPayment: entry.totalPayment,
        remainingBalance: entry.remainingBalance,
        sortOrder: entry.periodNumber,
      }))
    );

    return NextResponse.json({ loan: created, schedule }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
