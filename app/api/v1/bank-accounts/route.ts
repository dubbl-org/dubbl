import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  accountName: z.string().min(1),
  accountNumber: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  currencyCode: z.string().default("USD"),
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

    const [created] = await db
      .insert(bankAccount)
      .values({
        organizationId: ctx.organizationId,
        accountName: parsed.accountName,
        accountNumber: parsed.accountNumber || null,
        bankName: parsed.bankName || null,
        currencyCode: parsed.currencyCode,
        chartAccountId: parsed.chartAccountId || null,
        balance: parsed.balance,
      })
      .returning();

    return NextResponse.json({ bankAccount: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
