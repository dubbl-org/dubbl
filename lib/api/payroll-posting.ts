import { db } from "@/lib/db";
import {
  payrollRun,
  payrollItemDeduction,
  payrollItemTaxBreakdown,
  payrollItemEmployerTax,
  payrollSettings,
  deductionType,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  getNextEntryNumber,
  findAccountByCode,
  ensureAccountByCode,
  resolveBaseRate,
} from "@/lib/api/journal-automation";

/**
 * A transaction handle compatible with the one passed to db.transaction().
 * postPayrollRun does ALL its reads and writes through this so the journal
 * entry commits (or rolls back) together with the run-completion update.
 */
type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

interface PayrollPostingContext {
  organizationId: string;
  userId: string;
}

// ─── GL account codes for the payroll posting ───────────────────────
// NOTE: payrollSettings.taxPayableAccountCode defaults to 2200 (the OUTPUT VAT
// control account) in the schema column default — posting every withholding
// there is the books-corrupting bug this module fixes. We treat 2200 as
// "unset" and fall back to 2220 (Income Tax Payable) in code, never crediting
// payroll withholdings to the VAT liability.
const SALARY_EXPENSE_CODE = "5100"; // Wages & Salaries Expense (DR gross)
const EMPLOYER_TAX_EXPENSE_CODE = "5120"; // Employer Payroll Taxes Expense (DR)
const INCOME_TAX_PAYABLE_CODE = "2220"; // PAYE / income-tax withheld (CR)
const PAYROLL_TAXES_PAYABLE_CODE = "2235"; // FICA / SS / Medicare / NIC (CR)
const PENSION_BENEFITS_PAYABLE_CODE = "2245"; // pension & benefit withholdings (CR)
const OTHER_STATUTORY_PAYABLE_CODE = "2236"; // garnishments / other statutory (CR)
const WAGES_PAYABLE_CODE = "2310"; // net pay accrued-not-paid (CR)
const BANK_FALLBACK_CODE = "1100"; // default bank/cash for net pay (CR)

const ACCOUNT_DEFS = {
  [SALARY_EXPENSE_CODE]: { name: "Wages & Salaries Expense", type: "expense" as const, subType: "operating" },
  [EMPLOYER_TAX_EXPENSE_CODE]: { name: "Employer Payroll Taxes", type: "expense" as const, subType: "operating" },
  [INCOME_TAX_PAYABLE_CODE]: { name: "Income Tax Payable", type: "liability" as const, subType: "current" },
  [PAYROLL_TAXES_PAYABLE_CODE]: { name: "Payroll Taxes Payable", type: "liability" as const, subType: "current" },
  [PENSION_BENEFITS_PAYABLE_CODE]: { name: "Pension & Benefits Payable", type: "liability" as const, subType: "current" },
  [OTHER_STATUTORY_PAYABLE_CODE]: { name: "Other Statutory Deductions Payable", type: "liability" as const, subType: "current" },
  [WAGES_PAYABLE_CODE]: { name: "Wages Payable", type: "liability" as const, subType: "current" },
} as const;

/**
 * Classify a withholding into the liability account it should be credited to.
 * Used for BOTH payrollItemTaxBreakdown.taxKind and (fallback) deduction-type
 * names so a FICA/Medicare line never lands in the income-tax bucket.
 */
function classifyTaxKind(taxKind: string): string {
  const k = taxKind.toLowerCase();
  if (
    k.includes("social_security") ||
    k.includes("social security") ||
    k.includes("medicare") ||
    k.includes("fica") ||
    k.includes("nic") ||
    k.includes("national insurance") ||
    k.includes("unemployment") ||
    k.includes("futa") ||
    k.includes("suta")
  ) {
    return PAYROLL_TAXES_PAYABLE_CODE;
  }
  // income tax / PAYE / FIT / state income / withholding tax
  return INCOME_TAX_PAYABLE_CODE;
}

/**
 * Classify a deduction type (by category + name) into a liability account.
 * pre_tax deductions are typically pension/benefit/HSA style → 2245;
 * post_tax statutory items (garnishments) → 2236; payroll-tax-shaped names → 2235.
 */
function classifyDeduction(name: string | null, category: string): string {
  const n = (name ?? "").toLowerCase();
  if (
    n.includes("social security") ||
    n.includes("medicare") ||
    n.includes("fica") ||
    n.includes("nic") ||
    n.includes("national insurance") ||
    n.includes("payroll tax")
  ) {
    return PAYROLL_TAXES_PAYABLE_CODE;
  }
  if (
    n.includes("paye") ||
    n.includes("income tax") ||
    n.includes("withholding") ||
    n.includes("fit") ||
    n.includes("federal tax") ||
    n.includes("state tax")
  ) {
    return INCOME_TAX_PAYABLE_CODE;
  }
  if (
    n.includes("pension") ||
    n.includes("401") ||
    n.includes("retirement") ||
    n.includes("benefit") ||
    n.includes("health") ||
    n.includes("hsa") ||
    n.includes("medical") ||
    n.includes("insurance") ||
    n.includes("dental") ||
    n.includes("vision") ||
    category === "pre_tax"
  ) {
    return PENSION_BENEFITS_PAYABLE_CODE;
  }
  // garnishments, levies, union dues and other post-tax statutory deductions
  return OTHER_STATUTORY_PAYABLE_CODE;
}

/**
 * Resolve (find-or-create) a GL account by code within the transaction, using
 * the known def for the canonical payroll codes, or a sensible liability default
 * for any other code (e.g. an operator-configured taxPayableAccountCode).
 */
async function resolveAccount(
  organizationId: string,
  code: string,
  baseCurrency: string,
  tx: Tx
) {
  const existing = await findAccountByCode(organizationId, code, tx);
  if (existing) return existing;
  const def = ACCOUNT_DEFS[code as keyof typeof ACCOUNT_DEFS];
  return ensureAccountByCode(
    organizationId,
    def
      ? { code, name: def.name, type: def.type, subType: def.subType }
      : { code, name: `Account ${code}`, type: "liability", subType: "current" },
    baseCurrency,
    tx
  );
}

/** The per-run figures the journal needs, all in the org BASE currency. */
interface RunBuckets {
  /** Gross wages, base cents (sum of each item's gross at its own fxRate). */
  grossWages: number;
  /** Employer-side payroll-tax expense, base cents (DR 5120). */
  employerTax: number;
  /** Credit per liability account code, base cents. */
  liabilityByCode: Map<string, number>;
}

/**
 * Read a run's per-item withholding/employer-tax/deduction detail and roll it up
 * into BASE-currency buckets, converting every local-currency amount once at that
 * item's own fxRate. Splits each withholding to its proper liability account via
 * classifyTaxKind / classifyDeduction. Used both for the run being posted and —
 * for corrections — for the PARENT run, so a clawback reverses the parent's real
 * per-bucket split (FICA, pension, income tax) in the same proportions.
 */
async function accumulateBaseBuckets(
  tx: Tx,
  items: { id: string; grossAmount: number; fxRate: number | null }[]
): Promise<RunBuckets> {
  const itemIds = items.map((i) => i.id);
  const itemRate = new Map<string, number>(items.map((i) => [i.id, i.fxRate ?? 1]));
  const toBase = (itemId: string, localAmount: number): number =>
    Math.round(localAmount * (itemRate.get(itemId) ?? 1));

  const liabilityByCode = new Map<string, number>();
  const addLiability = (code: string, amount: number) => {
    if (amount === 0) return;
    liabilityByCode.set(code, (liabilityByCode.get(code) ?? 0) + amount);
  };

  if (itemIds.length === 0) {
    return { grossWages: 0, employerTax: 0, liabilityByCode };
  }

  const taxBreakdowns = await tx.query.payrollItemTaxBreakdown.findMany({
    where: inArray(payrollItemTaxBreakdown.payrollItemId, itemIds),
  });
  const employerTaxRows = await tx.query.payrollItemEmployerTax.findMany({
    where: inArray(payrollItemEmployerTax.payrollItemId, itemIds),
  });
  const deductionRows = await tx
    .select({
      payrollItemId: payrollItemDeduction.payrollItemId,
      amount: payrollItemDeduction.amount,
      category: payrollItemDeduction.category,
      name: deductionType.name,
    })
    .from(payrollItemDeduction)
    .innerJoin(
      deductionType,
      eq(payrollItemDeduction.deductionTypeId, deductionType.id)
    )
    .where(inArray(payrollItemDeduction.payrollItemId, itemIds));

  let employerTax = 0;

  // Employee withholdings → matching liability (FICA/SS/Medicare → 2235, income
  // tax → 2220). Legacy employer-flagged rows in this table also feed 5120.
  for (const tb of taxBreakdowns) {
    const amount = toBase(tb.payrollItemId, tb.amount);
    const kind = tb.taxKind.toLowerCase();
    if (
      kind.startsWith("employer") ||
      kind.includes("employer_") ||
      kind.includes("company_")
    ) {
      employerTax += amount;
    }
    addLiability(classifyTaxKind(tb.taxKind), amount);
  }

  // Employer taxes (DR 5120 expense + CR the matching liability).
  for (const et of employerTaxRows) {
    const amount = toBase(et.payrollItemId, et.amount);
    employerTax += amount;
    addLiability(classifyTaxKind(et.taxKind), amount);
  }

  // Post-tax / benefit deductions split by kind (pension/benefits → 2245,
  // statutory FICA-shaped → 2235, income tax → 2220, garnishments/other → 2236).
  for (const d of deductionRows) {
    addLiability(classifyDeduction(d.name, d.category), toBase(d.payrollItemId, d.amount));
  }

  const grossWages = items.reduce((sum, it) => sum + toBase(it.id, it.grossAmount), 0);

  return { grossWages, employerTax, liabilityByCode };
}

/**
 * Build and post ONE balanced journal entry for a completed payroll run and
 * stamp payrollRun.journalEntryId. Returns the posted journalEntry id, or null
 * when the run has no monetary effect (zero gross AND zero deductions).
 *
 * Posting (all amounts integer cents, double-entry MUST balance):
 *   DR Wages & Salaries Expense (5100) ............ gross wages
 *   DR Employer Payroll Taxes (5120) .............. employer-side taxes (if any)
 *   CR Income Tax Payable (2220) .................. PAYE / income-tax withheld
 *   CR Payroll Taxes Payable (2235) .............. FICA / SS / Medicare / NIC
 *   CR Pension & Benefits Payable (2245) ......... pension/benefit withholdings
 *   CR Other Statutory Payable (2236) ............ garnishments / other statutory
 *   CR Bank/Cash (settings bank, fallback 1100) .. net pay   [paid]
 *      — OR —
 *   CR Wages Payable (2310) ...................... net pay   [accrued-not-paid]
 *
 * The employee withholding split is driven from payrollItemTaxBreakdown when
 * populated, else from payrollItemDeduction rows mapped by kind. As a last resort
 * the run's lumped totalDeductions is credited to Income Tax Payable (2220) —
 * NEVER to the VAT control account (2200). Employer-side taxes are read from
 * payrollItemEmployerTax and posted as an expense (DR 5120) plus a liability (CR
 * the matching account). For correction runs (parentRunId set) every amount is
 * signed so the entry self-reverses the parent's posting.
 *
 * MULTI-CURRENCY: gross, withholdings, employer taxes and deductions all start
 * life in each employee's LOCAL currency (payrollItem.currency). Every amount is
 * converted to the org BASE currency exactly once, using that item's own stored
 * fxRate (local→base decimal multiplier). All legs are then built and posted in
 * base currency at 1:1 — there is no second conversion pass, so a mixed-currency
 * run posts a single balanced base-currency entry.
 *
 * Must be called inside a db.transaction; pass that tx so the journal and the
 * run update commit together.
 *
 * @param accrued when true, net pay is credited to Wages Payable (2310) instead
 *   of the bank account — i.e. the liability is recognized but not yet disbursed.
 */
export async function postPayrollRun(
  ctx: PayrollPostingContext,
  runId: string,
  tx: Tx,
  opts: { accrued?: boolean } = {}
): Promise<string | null> {
  const run = await tx.query.payrollRun.findFirst({
    where: and(
      eq(payrollRun.id, runId),
      eq(payrollRun.organizationId, ctx.organizationId)
    ),
    with: { items: true },
  });
  if (!run) throw new Error(`Payroll run ${runId} not found`);

  // Correction runs (parentRunId set) carry SIGNED delta amounts: a positive
  // gross adjustment pays more, a negative one claws back. We post those deltas
  // directly so the books move by exactly the correction — the reversing effect
  // for negative deltas is produced by pushLeg flipping a negative debit/credit
  // to the opposite column (so a clawback debits the bank, a reduced gross
  // credits the wage expense). No global negation: that would invert a genuine
  // additional-pay correction and corrupt the books.
  const isCorrection = run.runType === "correction" || run.parentRunId != null;

  // The org base currency every leg is posted in. All per-item local amounts are
  // converted into this currency by accumulateBaseBuckets, using each item's own
  // fxRate exactly once — there is no second conversion at insert time.
  const { base } = await resolveBaseRate(
    ctx.organizationId,
    undefined,
    run.payPeriodEnd
  );

  // Roll this run's per-item detail up into base-currency buckets.
  const own = await accumulateBaseBuckets(tx, run.items);
  const grossWages = own.grossWages;
  let employerTax = own.employerTax;
  let liabilityByCode = own.liabilityByCode;

  // ── Correction: reverse the PARENT's actual per-bucket split ──────────
  // A correction posts a SIGNED gross delta. Rather than recompute withholdings
  // on the delta (which would dump everything to income tax), scale the PARENT
  // run's real liability split (2220 income tax, 2235 FICA, 2245 pension, …) by
  // the gross-correction proportion, so each parent liability nets back in the
  // same proportion it was originally credited. Falls back to the correction
  // run's own breakdown if the parent has no posted gross/breakdown.
  if (isCorrection && run.parentRunId) {
    const parent = await tx.query.payrollRun.findFirst({
      where: and(
        eq(payrollRun.id, run.parentRunId),
        eq(payrollRun.organizationId, ctx.organizationId)
      ),
      with: { items: true },
    });
    const parentBuckets = parent
      ? await accumulateBaseBuckets(tx, parent.items)
      : null;

    if (parentBuckets && parentBuckets.grossWages !== 0) {
      // Proportion of the parent's gross this correction adjusts (signed).
      const ratio = grossWages / parentBuckets.grossWages;
      employerTax = Math.round(parentBuckets.employerTax * ratio);
      const scaled = new Map<string, number>();
      for (const [code, amount] of parentBuckets.liabilityByCode.entries()) {
        const v = Math.round(amount * ratio);
        if (v !== 0) scaled.set(code, v);
      }
      liabilityByCode = scaled;
    }
  }

  // Last-resort fallback: nothing itemized, but the run reports deductions. Credit
  // them to Income Tax Payable (2220) — explicitly NOT the VAT account (2200).
  // The run's totalDeductions is already stored in base currency, so it is NOT
  // re-converted here.
  if (liabilityByCode.size === 0 && run.totalDeductions !== 0) {
    liabilityByCode.set(INCOME_TAX_PAYABLE_CODE, run.totalDeductions);
  }

  // Net pay must balance the entry against the actual debits/credits we post.
  // DR side total = gross + employerTax. CR side = withholdings + employerTax-liability
  // ... but employer-tax liability is already in liabilityByCode. So:
  //   debits  = grossWages (5100) + employerTax (5120)
  //   credits = sum(liabilityByCode) + netPay
  // → netPay = grossWages + employerTax − sum(liabilityByCode)
  // Everything here is already in base currency.
  const totalLiabilityCredits = [...liabilityByCode.values()].reduce(
    (a, b) => a + b,
    0
  );
  const netPay = grossWages + employerTax - totalLiabilityCredits;

  // Nothing to post.
  if (grossWages === 0 && totalLiabilityCredits === 0 && netPay === 0) {
    return null;
  }

  const settings = await tx.query.payrollSettings.findFirst({
    where: eq(payrollSettings.organizationId, ctx.organizationId),
  });

  const salaryCode = settings?.salaryExpenseAccountCode || SALARY_EXPENSE_CODE;
  // Treat the legacy 2200 (VAT) default as unset; never credit payroll there.
  const configuredTaxCode = settings?.taxPayableAccountCode;
  const incomeTaxCode =
    configuredTaxCode && configuredTaxCode !== "2200"
      ? configuredTaxCode
      : INCOME_TAX_PAYABLE_CODE;
  const bankCode = settings?.bankAccountCode || BANK_FALLBACK_CODE;

  // If the operator configured a non-default tax payable code, route the income
  // tax bucket there (keep FICA/pension/etc on their canonical accounts).
  if (incomeTaxCode !== INCOME_TAX_PAYABLE_CODE && liabilityByCode.has(INCOME_TAX_PAYABLE_CODE)) {
    const moved = liabilityByCode.get(INCOME_TAX_PAYABLE_CODE)!;
    liabilityByCode.delete(INCOME_TAX_PAYABLE_CODE);
    liabilityByCode.set(incomeTaxCode, (liabilityByCode.get(incomeTaxCode) ?? 0) + moved);
  }

  const salaryAccount = await resolveAccount(ctx.organizationId, salaryCode, base, tx);
  const netPayCode = opts.accrued ? WAGES_PAYABLE_CODE : bankCode;
  const netPayAccount = await resolveAccount(ctx.organizationId, netPayCode, base, tx);

  if (!salaryAccount || !netPayAccount) {
    throw new Error("Could not resolve payroll GL accounts");
  }

  // Pre-resolve every liability account.
  const liabilityAccounts = new Map<string, string>();
  for (const code of liabilityByCode.keys()) {
    const acct = await resolveAccount(ctx.organizationId, code, base, tx);
    if (!acct) throw new Error(`Could not resolve payroll liability account ${code}`);
    liabilityAccounts.set(code, acct.id);
  }

  let employerTaxAccountId: string | null = null;
  if (employerTax !== 0) {
    const acct = await resolveAccount(ctx.organizationId, EMPLOYER_TAX_EXPENSE_CODE, base, tx);
    if (!acct) throw new Error("Could not resolve employer payroll tax account");
    employerTaxAccountId = acct.id;
  }

  // ── Build the entry header ────────────────────────────────────────
  // Pass tx: postPayrollRun runs inside a db.transaction and several runs may be
  // posted in one tx, so the number must be read from the uncommitted tx state.
  const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
  const descBase = isCorrection
    ? `Payroll correction ${run.payPeriodStart} to ${run.payPeriodEnd}`
    : `Payroll ${run.payPeriodStart} to ${run.payPeriodEnd}`;

  const [entry] = await tx
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: run.payPeriodEnd,
      description: descBase,
      reference: `PR-${run.id.slice(0, 8)}`,
      status: "posted",
      sourceType: "payroll",
      sourceId: run.id,
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  // ── Build balanced lines ──────────────────────────────────────────
  // A negative posting amount (correction clawback / reduced gross) can't be a
  // negative debit or credit, so pushLeg flips it to the opposite column. This
  // makes a correction self-reversing: e.g. a negative net pay debits the bank
  // (cash recovered) and a negative gross credits the wage expense.
  const lines: (typeof journalLine.$inferInsert)[] = [];
  const pushLeg = (
    accountId: string,
    description: string,
    debit: number,
    credit: number
  ) => {
    let d = debit;
    let c = credit;
    if (d < 0) {
      c += -d;
      d = 0;
    }
    if (c < 0) {
      d += -c;
      c = 0;
    }
    if (d === 0 && c === 0) return;
    // Every amount is already in base currency, so each line is posted 1:1 in
    // base — no second conversion pass (the bug that double-converted gross/net).
    lines.push({
      journalEntryId: entry.id,
      accountId,
      description,
      debitAmount: d,
      creditAmount: c,
      currencyCode: base,
    });
  };

  // DR gross wages
  pushLeg(salaryAccount.id, "Payroll - Gross wages", grossWages, 0);

  // DR employer payroll taxes
  if (employerTax !== 0 && employerTaxAccountId) {
    pushLeg(employerTaxAccountId, "Payroll - Employer taxes", employerTax, 0);
  }

  // CR each withholding liability
  for (const [code, amount] of liabilityByCode.entries()) {
    const acctId = liabilityAccounts.get(code)!;
    pushLeg(acctId, "Payroll - Withholding", 0, amount);
  }

  // CR net pay (bank or wages payable)
  pushLeg(
    netPayAccount.id,
    opts.accrued ? "Payroll - Net wages accrued" : "Payroll - Net wages paid",
    0,
    netPay
  );

  if (lines.length > 0) {
    // Lines are already base-currency; insert as-is (exchangeRate defaults 1:1).
    await tx.insert(journalLine).values(lines);
  }

  await tx
    .update(payrollRun)
    .set({ journalEntryId: entry.id })
    .where(eq(payrollRun.id, run.id));

  return entry.id;
}
