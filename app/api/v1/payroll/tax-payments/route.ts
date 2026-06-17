import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  payrollTaxPayment,
  payrollSettings,
  journalEntry,
  journalLine,
  member,
} from "@/lib/db/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, created, ok } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  getNextEntryNumber,
  findAccountByCode,
  ensureAccountByCode,
  resolveBaseRate,
  toBaseLines,
} from "@/lib/api/journal-automation";
import { z } from "zod";

// ─── Payroll-tax liability accounts (mirror lib/api/payroll-posting.ts) ──────
// A remittance DEBITS one of these (clearing the accrued liability) and CREDITS
// the bank. "income_tax" → 2220, FICA/SS/Medicare/FUTA/SUTA → 2235, pension &
// benefit withholdings → 2245. These are the accounts postPayrollRun credits
// when a run is posted, so paying them down reverses that liability.
const INCOME_TAX_PAYABLE_CODE = "2220";
const PAYROLL_TAXES_PAYABLE_CODE = "2235";
const PENSION_BENEFITS_PAYABLE_CODE = "2245";
const BANK_FALLBACK_CODE = "1100";

const LIABILITY_DEFS: Record<
  string,
  { name: string; type: "liability"; subType: string }
> = {
  [INCOME_TAX_PAYABLE_CODE]: { name: "Income Tax Payable", type: "liability", subType: "current" },
  [PAYROLL_TAXES_PAYABLE_CODE]: { name: "Payroll Taxes Payable", type: "liability", subType: "current" },
  [PENSION_BENEFITS_PAYABLE_CODE]: { name: "Pension & Benefits Payable", type: "liability", subType: "current" },
};

/**
 * Map a liability bucket (or an explicit GL code) to the account code to debit.
 * Accepts the canonical bucket names so a caller can say "income_tax" without
 * knowing the chart, or pass a raw 4-digit code to target a custom account.
 */
function resolveLiabilityCode(bucket: string): string {
  const b = bucket.toLowerCase();
  if (/^\d{3,}$/.test(bucket)) return bucket; // explicit GL code
  if (b === "income_tax" || b === "fit" || b === "paye" || b === "state_income" || b === "withholding") {
    return INCOME_TAX_PAYABLE_CODE;
  }
  if (
    b === "fica" ||
    b === "social_security" ||
    b === "medicare" ||
    b === "futa" ||
    b === "suta" ||
    b === "payroll_tax" ||
    b === "nic"
  ) {
    return PAYROLL_TAXES_PAYABLE_CODE;
  }
  if (b === "pension" || b === "benefits" || b === "retirement") {
    return PENSION_BENEFITS_PAYABLE_CODE;
  }
  return INCOME_TAX_PAYABLE_CODE;
}

const createSchema = z.object({
  periodStart: z.string().describe("Period start (YYYY-MM-DD) this remittance covers"),
  periodEnd: z.string().describe("Period end (YYYY-MM-DD) this remittance covers"),
  jurisdictionLevel: z.enum(["federal", "state", "local"]).default("federal"),
  jurisdiction: z.string().nullable().optional(),
  // What the remittance covers, e.g. "941", "940", "state_income".
  taxKind: z.string().nullable().optional(),
  // Which liability accounts to clear and by how much (integer cents). Each
  // bucket maps to a GL code (income_tax→2220, fica→2235, pension→2245) or pass
  // a raw GL code. The journal debits each of these and credits the bank.
  allocations: z
    .array(
      z.object({
        bucket: z.string().describe("Liability bucket or GL code to debit (e.g. income_tax, fica, pension, 2220)"),
        amount: z.number().int().positive().describe("Amount remitted against this liability, integer cents"),
      })
    )
    .min(1),
  // GL account code of the bank/cash account paid from (defaults to payroll
  // settings bankAccountCode, else 1100).
  bankAccountCode: z.string().optional(),
  paymentDate: z.string().optional().describe("Date the payment is posted (YYYY-MM-DD); defaults to today"),
  reference: z.string().optional().describe("Confirmation / EFTPS number"),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const totalAmount = parsed.allocations.reduce((s, a) => s + a.amount, 0);
    if (totalAmount <= 0) {
      return NextResponse.json({ error: "Total remittance amount must be positive" }, { status: 400 });
    }

    const paymentDate = parsed.paymentDate ?? new Date().toISOString().split("T")[0];

    const mem = await db.query.member.findFirst({
      where: and(eq(member.organizationId, ctx.organizationId), eq(member.userId, ctx.userId)),
    });

    const settings = await db.query.payrollSettings.findFirst({
      where: eq(payrollSettings.organizationId, ctx.organizationId),
    });
    const bankCode = parsed.bankAccountCode || settings?.bankAccountCode || BANK_FALLBACK_CODE;

    // Collapse allocations onto their target GL codes so multiple buckets that
    // map to the same account (e.g. medicare + social_security → 2235) post as
    // one debit leg.
    const debitByCode = new Map<string, number>();
    for (const a of parsed.allocations) {
      const code = resolveLiabilityCode(a.bucket);
      debitByCode.set(code, (debitByCode.get(code) ?? 0) + a.amount);
    }

    const { record, journalEntryId } = await db.transaction(async (tx) => {
      // Remittance is a base-currency cash movement; resolve the base rate (1:1)
      // so the legs are stamped consistently with other GL postings.
      const { base, currency, rate } = await resolveBaseRate(
        ctx.organizationId,
        undefined,
        paymentDate
      );

      // Resolve (find-or-create) the bank account and every liability account.
      const bankAccount =
        (await findAccountByCode(ctx.organizationId, bankCode, tx)) ??
        (await ensureAccountByCode(
          ctx.organizationId,
          { code: bankCode, name: `Bank ${bankCode}`, type: "asset", subType: "bank" },
          base,
          tx
        ));
      if (!bankAccount) throw new Error(`Could not resolve bank account ${bankCode}`);

      const lines: (typeof journalLine.$inferInsert)[] = [];

      // DR each payroll-tax liability being cleared.
      for (const [code, amount] of debitByCode.entries()) {
        if (amount === 0) continue;
        const def = LIABILITY_DEFS[code];
        const acct =
          (await findAccountByCode(ctx.organizationId, code, tx)) ??
          (await ensureAccountByCode(
            ctx.organizationId,
            def
              ? { code, name: def.name, type: def.type, subType: def.subType }
              : { code, name: `Account ${code}`, type: "liability", subType: "current" },
            base,
            tx
          ));
        if (!acct) throw new Error(`Could not resolve payroll liability account ${code}`);
        lines.push({
          journalEntryId: "", // stamped after the header insert below
          accountId: acct.id,
          description: "Payroll tax remittance",
          debitAmount: amount,
          creditAmount: 0,
        });
      }

      // CR the bank for the full remittance.
      lines.push({
        journalEntryId: "",
        accountId: bankAccount.id,
        description: "Payroll tax remittance",
        debitAmount: 0,
        creditAmount: totalAmount,
      });

      // Build the entry header. Pass tx to getNextEntryNumber so concurrent
      // entries in this (or another) transaction don't collide on entryNumber.
      const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: paymentDate,
          description: `Payroll tax remittance ${parsed.periodStart} to ${parsed.periodEnd}`,
          reference: parsed.reference ?? `PTX-${parsed.periodEnd}`,
          status: "posted",
          sourceType: "payroll_tax_payment",
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      const stamped = lines.map((l) => ({ ...l, journalEntryId: entry.id }));
      await tx.insert(journalLine).values(toBaseLines(stamped, currency, rate));

      const [row] = await tx
        .insert(payrollTaxPayment)
        .values({
          organizationId: ctx.organizationId,
          periodStart: parsed.periodStart,
          periodEnd: parsed.periodEnd,
          jurisdictionLevel: parsed.jurisdictionLevel,
          jurisdiction: parsed.jurisdiction ?? null,
          taxKind: parsed.taxKind ?? null,
          amount: totalAmount,
          currency: base,
          bankAccountId: bankAccount.id,
          reference: parsed.reference ?? null,
          notes: parsed.notes ?? null,
          status: "paid",
          paidAt: new Date(),
          journalEntryId: entry.id,
          createdBy: mem?.id ?? null,
        })
        .returning();

      return { record: row, journalEntryId: entry.id };
    });

    logAudit({ ctx, action: "create", entityType: "payrollTaxPayment", entityId: record.id, request });

    return created({ payment: record, journalEntryId });
  } catch (err) {
    return handleError(err);
  }
}

const listSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");
    const url = new URL(request.url);
    const parsed = listSchema.parse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });

    const conditions = [
      eq(payrollTaxPayment.organizationId, ctx.organizationId),
      notDeleted(payrollTaxPayment.deletedAt),
    ];
    if (parsed.from) conditions.push(gte(payrollTaxPayment.periodEnd, parsed.from));
    if (parsed.to) conditions.push(lte(payrollTaxPayment.periodStart, parsed.to));

    const payments = await db
      .select()
      .from(payrollTaxPayment)
      .where(and(...conditions))
      .orderBy(desc(payrollTaxPayment.periodEnd), desc(payrollTaxPayment.createdAt));

    return ok({ payments });
  } catch (err) {
    return handleError(err);
  }
}
