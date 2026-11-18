import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { and, eq, isNull, ne, min, sql } from "drizzle-orm";
import { bankAccount, bankTransaction, organization } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { backfillRates } from "@/lib/currency/rate-backfill";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { z } from "zod";

const bodySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Omit to cover every currency the books are waiting on. */
  currencies: z.array(currencyCodeSchema).optional(),
});

/**
 * What the books actually need: the currencies sitting unreconciled in a
 * currency other than the organisation's own, and the oldest date among them.
 * That is the range whose postings would otherwise fail for want of a rate.
 */
async function deriveScope(organizationId: string, baseCurrency: string) {
  // A transaction usually leaves currency_code null and inherits the account's,
  // so the effective currency is the coalesce. Filtering on the column alone
  // hides every such row, which is exactly the reported "nothing is waiting".
  const effective = sql<string>`coalesce(${bankTransaction.currencyCode}, ${bankAccount.currencyCode})`;

  const rows = await db
    .selectDistinct({ code: effective })
    .from(bankTransaction)
    .innerJoin(bankAccount, eq(bankTransaction.bankAccountId, bankAccount.id))
    .where(
      and(
        eq(bankAccount.organizationId, organizationId),
        notDeleted(bankAccount.deletedAt),
        isNull(bankTransaction.journalEntryId),
        ne(effective, baseCurrency)
      )
    );

  const currencies = rows.map((r) => r.code).filter((c): c is string => Boolean(c));

  const [earliest] = await db
    .select({ oldest: min(bankTransaction.date) })
    .from(bankTransaction)
    .innerJoin(bankAccount, eq(bankTransaction.bankAccountId, bankAccount.id))
    .where(
      and(
        eq(bankAccount.organizationId, organizationId),
        notDeleted(bankAccount.deletedAt),
        isNull(bankTransaction.journalEntryId),
        ne(effective, baseCurrency)
      )
    );

  return { currencies, earliest: earliest?.oldest ?? null };
}

/** The range and pairs the screen should offer before the user touches anything. */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:settings");

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const scope = await deriveScope(ctx.organizationId, org.defaultCurrency);
    const today = new Date().toISOString().slice(0, 10);
    const fallbackFrom = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

    return NextResponse.json({
      baseCurrency: org.defaultCurrency,
      derived: scope.earliest !== null,
      from: scope.earliest ?? fallbackFrom,
      to: today,
      currencies: scope.currencies,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:settings");

    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const to = body.to ?? new Date().toISOString().slice(0, 10);

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const currencies =
      body.currencies ?? (await deriveScope(ctx.organizationId, org.defaultCurrency)).currencies;

    const result = await backfillRates(ctx.organizationId, org.defaultCurrency, currencies, body.from, to);

    return NextResponse.json({
      baseCurrency: org.defaultCurrency,
      from: body.from,
      to,
      currencies,
      ...result,
    });
  } catch (err) {
    return handleError(err);
  }
}
