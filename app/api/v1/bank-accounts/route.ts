import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { checkResourceLimit, checkMultiCurrency } from "@/lib/api/check-limit";
import { z } from "zod";

const createSchema = z.object({
  accountName: z.string().min(1),
  accountNumber: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  currencyCode: z.string().default("USD"),
  countryCode: z.string().length(2).nullable().optional(),
  accountType: z
    .enum(["checking", "savings", "credit_card", "cash", "loan", "investment", "other"])
    .default("checking"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f766e"),
  chartAccountId: z.string().nullable().optional(),
  balance: z.number().int().default(0),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const accounts = await db.query.bankAccount.findMany({
      where: and(
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
      orderBy: bankAccount.accountName,
      with: { chartAccount: true },
    });

    return NextResponse.json({ bankAccounts: accounts });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await checkResourceLimit(ctx.organizationId, bankAccount, bankAccount.organizationId, "bankAccounts", bankAccount.deletedAt);
    await checkMultiCurrency(ctx.organizationId, parsed.currencyCode);

    const [created] = await db
      .insert(bankAccount)
      .values({
        organizationId: ctx.organizationId,
        accountName: parsed.accountName,
        accountNumber: parsed.accountNumber || null,
        bankName: parsed.bankName || null,
        currencyCode: parsed.currencyCode,
        countryCode: parsed.countryCode || null,
        accountType: parsed.accountType,
        color: parsed.color,
        chartAccountId: parsed.chartAccountId || null,
        balance: parsed.balance,
      })
      .returning();

    return NextResponse.json({ bankAccount: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
