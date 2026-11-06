/**
 * Reusable general-ledger aggregation.
 *
 * Every financial report (balance sheet, P&L, trial balance, aged reports,
 * dimension/segment reports …) ultimately needs the same thing: posted
 * `journalLine`s joined to their `journalEntry`, summed per account, filtered
 * by a date window and (optionally) a tracking dimension. This module is the
 * single shared place that builds that aggregation so the route handlers stay
 * thin and consistent.
 *
 * Conventions (see CLAUDE.md + the bookkeeping schema):
 * - All monetary amounts are integer minor units (cents).
 * - Only `status = 'posted'` (and non-deleted) entries count toward reports.
 * - Every query is org-scoped via `ctx.organizationId`.
 *
 * The functions here are pure/composable: they only read the DB and return
 * plain data. Callers turn the returned account aggregates into their own
 * statement shapes (balance sheet sections, P&L, TB rows, etc.).
 */
import { db } from "@/lib/db";
import {
  bill,
  chartAccount,
  entityTag,
  expenseClaim,
  invoice,
  journalEntry,
  journalLine,
  payment,
  paymentAllocation,
} from "@/lib/db/schema";
import { and, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { CASH_SOURCE_TYPES } from "@/lib/reports/cash-basis";
import {
  loadCashRealisedLines,
  type CashRealisedLine,
  type CashWindow,
} from "@/lib/reports/cash-basis-ledger";

/** Reporting basis. */
export type ReportBasis = "accrual" | "cash";

/** Tracking dimension that can be filtered and/or grouped on. */
export type Dimension = "costCenterId" | "projectId";

/**
 * Cash basis (see lib/reports/cash-basis.ts for the full model):
 *   An entry counts on the CASH basis on its own date when EITHER
 *     (a) its `sourceType` is a cash source (payments, bank-feed
 *         categorisations, sales receipts), OR
 *     (b) it touches a bank/cash chart account (`subType = 'bank'`).
 *   Invoice, bill and credit note entries never move cash themselves; they
 *   count pro rata to their settlements instead: a payment (or applied credit)
 *   of 40% of the document realises 40% of every line of the document's entry
 *   on the payment date. Other accrual-only entries (accruals, depreciation,
 *   manual adjustments) are excluded.
 */
export { CASH_SOURCE_TYPES };

/** chartAccount.subType values treated as bank/cash accounts for cash basis. */
const CASH_ACCOUNT_SUBTYPES = ["bank"] as const;

/** Account-level aggregate returned by every aggregation function. */
export interface AccountAggregate {
  accountId: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  subType: string | null;
  /** Summed debit amount in integer cents. */
  debit: number;
  /** Summed credit amount in integer cents. */
  credit: number;
  /**
   * Natural-sign balance in integer cents: debit-normal accounts
   * (asset/expense) = debit − credit; credit-normal accounts
   * (liability/equity/revenue) = credit − debit.
   */
  balance: number;
}

/** Shared options accepted by the aggregation functions. */
export interface GLQueryOptions {
  /** Reporting basis. Defaults to 'accrual' (current behavior). */
  basis?: ReportBasis;
  /**
   * Restrict to accounts of these types. Omit for all types.
   * e.g. ['asset','liability','equity'] for a balance sheet,
   *      ['revenue','expense'] for a P&L.
   */
  accountTypes?: AccountAggregate["type"][];
  /**
   * Optional dimension filter: only include lines whose dimension column
   * equals `dimensionValue`. Pass `null` for `dimensionValue` to match lines
   * where the dimension is unset (IS NULL).
   */
  dimension?: Dimension;
  dimensionValue?: string | null;
  /**
   * Optional tag filter: only include lines whose entry carries this tag (see
   * {@link tagPredicate} for how a tag on an invoice, bill, expense, contact or
   * project reaches its postings).
   */
  tagId?: string;
  /**
   * Include accounts that have no matching activity (zero debit/credit).
   * Defaults to false (only accounts with activity are returned), matching
   * the entry-driven reports (P&L / GL). Balance sheet / trial balance can set
   * this true if they want every account listed.
   */
  includeEmptyAccounts?: boolean;
}

/** A date window. Both bounds are inclusive ISO date strings (YYYY-MM-DD). */
export interface DateRange {
  /** Inclusive start (journalEntry.date >= startDate). */
  startDate: string;
  /** Inclusive end (journalEntry.date <= endDate). */
  endDate: string;
}

function isDebitNormal(type: AccountAggregate["type"]): boolean {
  return type === "asset" || type === "expense";
}

/**
 * Line-level predicate for the tag filter. A journal line matches tag `tagId`
 * when the tag is attached to:
 *   - the journal entry itself (entity type `journal_entry`);
 *   - a document the entry posts: an invoice, bill or expense claim whose
 *     `journalEntryId` is the entry, whose id is the entry's `sourceId` (voids,
 *     write-offs, reversals, claim payments), or that a payment on the entry
 *     is allocated to;
 *   - the contact on one of those invoices / bills, or on a payment posted by
 *     the entry;
 *   - the project on the line (`journalLine.projectId`).
 * Correlated on the unaliased `journal_line` row of the outer query.
 */
function tagPredicate(tagId: string): SQL {
  const je = journalLine.journalEntryId;
  const docIds = sql`
    select tag_je.source_id from ${journalEntry} tag_je
      where tag_je.id = ${je} and tag_je.source_id is not null
    union all select tag_inv.id from ${invoice} tag_inv where tag_inv.journal_entry_id = ${je}
    union all select tag_bill.id from ${bill} tag_bill where tag_bill.journal_entry_id = ${je}
    union all select tag_exp.id from ${expenseClaim} tag_exp where tag_exp.journal_entry_id = ${je}
    union all select tag_pa.document_id from ${paymentAllocation} tag_pa
      join ${payment} tag_pay on tag_pay.id = tag_pa.payment_id
      where tag_pay.journal_entry_id = ${je}`;
  return sql`exists (
    select 1 from ${entityTag} tag_et
    where tag_et.tag_id = ${tagId}
      and (
        (tag_et.entity_type = 'journal_entry' and tag_et.entity_id = ${je})
        or (tag_et.entity_type = 'project' and tag_et.entity_id = ${journalLine.projectId})
        or (tag_et.entity_type in ('invoice', 'bill', 'expense') and tag_et.entity_id in (${docIds}))
        or (tag_et.entity_type = 'contact' and tag_et.entity_id in (
          select tag_ci.contact_id from ${invoice} tag_ci where tag_ci.id in (${docIds})
          union all select tag_cb.contact_id from ${bill} tag_cb where tag_cb.id in (${docIds})
          union all select tag_cp.contact_id from ${payment} tag_cp where tag_cp.journal_entry_id = ${je}
        ))
      )
  )`;
}

/**
 * Build the WHERE predicate shared by every aggregation. `dateClause` is the
 * caller-specific date predicate (range vs. as-at). Returns the combined SQL.
 */
function buildWhere(
  organizationId: string,
  dateClause: SQL | undefined,
  opts: GLQueryOptions
): SQL {
  const clauses: (SQL | undefined)[] = [
    eq(journalEntry.organizationId, organizationId),
    eq(journalEntry.status, "posted"),
    isNull(journalEntry.deletedAt),
    dateClause,
  ];

  if (opts.accountTypes && opts.accountTypes.length > 0) {
    clauses.push(
      sql`${chartAccount.type} in (${sql.join(
        opts.accountTypes.map((t) => sql`${t}`),
        sql`, `
      )})`
    );
  }

  if (opts.dimension) {
    const col =
      opts.dimension === "costCenterId"
        ? journalLine.costCenterId
        : journalLine.projectId;
    if (opts.dimensionValue === null) {
      clauses.push(isNull(col));
    } else if (opts.dimensionValue !== undefined) {
      clauses.push(eq(col, opts.dimensionValue));
    }
  }

  if (opts.tagId) clauses.push(tagPredicate(opts.tagId));

  if (opts.basis === "cash") {
    // Cash-basis filter (see CASH_SOURCE_TYPES doc): keep the entry if its
    // sourceType is a cash/payment source OR the entry has any line hitting a
    // bank/cash account.
    const cashEntry = sql`(
      ${journalEntry.sourceType} in (${sql.join(
        CASH_SOURCE_TYPES.map((s) => sql`${s}`),
        sql`, `
      )})
      or exists (
        select 1 from ${journalLine} cash_jl
        join ${chartAccount} cash_acct on cash_acct.id = cash_jl.account_id
        where cash_jl.journal_entry_id = ${journalEntry.id}
          and cash_acct.sub_type in (${sql.join(
            CASH_ACCOUNT_SUBTYPES.map((s) => sql`${s}`),
            sql`, `
          )})
      )
    )`;
    clauses.push(cashEntry);
  }

  return and(...clauses) as SQL;
}

/**
 * The date predicate, re-expressed for the correlated EXISTS subquery used on
 * the account-driven (includeEmptyAccounts) path. Either a range or an as-at.
 */
type JoinDate =
  | { kind: "range"; startDate: string; endDate: string }
  | { kind: "asAt"; asAt: string }
  | null;

/**
 * Core aggregation: sum posted journal lines per account for a given WHERE.
 *
 * When `includeEmptyAccounts` is true we drive the query from `chartAccount`
 * (LEFT JOIN) so accounts with no activity still appear; otherwise we drive
 * from `journalLine` (INNER JOIN) so only accounts with activity are returned.
 */
async function aggregate(
  organizationId: string,
  dateClause: SQL | undefined,
  joinDate: JoinDate,
  opts: GLQueryOptions
): Promise<AccountAggregate[]> {
  const includeEmpty = opts.includeEmptyAccounts ?? false;
  const debitSum = sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`;
  const creditSum = sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`;

  let rows: Array<{
    accountId: string;
    code: string;
    name: string;
    type: AccountAggregate["type"];
    subType: string | null;
    debit: number;
    credit: number;
  }>;

  if (includeEmpty) {
    // Account-driven: every account that matches the type/org filter appears.
    // The entry-level predicates (status/date/basis/dimension) must live on the
    // JOIN, not the WHERE, so empty accounts are not filtered out.
    const accountClauses: (SQL | undefined)[] = [
      eq(chartAccount.organizationId, organizationId),
    ];
    if (opts.accountTypes && opts.accountTypes.length > 0) {
      accountClauses.push(
        sql`${chartAccount.type} in (${sql.join(
          opts.accountTypes.map((t) => sql`${t}`),
          sql`, `
        )})`
      );
    }

    const lineJoin = buildEntryJoinPredicate(organizationId, joinDate, opts);

    rows = (await db
      .select({
        accountId: chartAccount.id,
        code: chartAccount.code,
        name: chartAccount.name,
        type: chartAccount.type,
        subType: chartAccount.subType,
        debit: debitSum,
        credit: creditSum,
      })
      .from(chartAccount)
      .leftJoin(journalLine, lineJoin)
      .leftJoin(
        journalEntry,
        eq(journalLine.journalEntryId, journalEntry.id)
      )
      .where(and(...accountClauses))
      .groupBy(
        chartAccount.id,
        chartAccount.code,
        chartAccount.name,
        chartAccount.type,
        chartAccount.subType
      )
      .orderBy(chartAccount.code)) as typeof rows;
  } else {
    const where = buildWhere(organizationId, dateClause, opts);
    rows = (await db
      .select({
        accountId: journalLine.accountId,
        code: chartAccount.code,
        name: chartAccount.name,
        type: chartAccount.type,
        subType: chartAccount.subType,
        debit: debitSum,
        credit: creditSum,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
      .where(where)
      .groupBy(
        journalLine.accountId,
        chartAccount.code,
        chartAccount.name,
        chartAccount.type,
        chartAccount.subType
      )
      .orderBy(chartAccount.code)) as typeof rows;
  }

  if (opts.basis === "cash") {
    // Add the realised share of invoices / bills / credit notes (dated on
    // their settlements), which the cash-entry SQL above never sees.
    const window: CashWindow =
      joinDate?.kind === "range"
        ? { startDate: joinDate.startDate, endDate: joinDate.endDate }
        : { endDate: joinDate?.kind === "asAt" ? joinDate.asAt : "9999-12-31" };
    const realised = await cashRealisedFor(organizationId, window, opts);
    rows = mergeRealised(rows, realised);
  }

  return rows.map((r) => {
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    const balance = isDebitNormal(r.type) ? debit - credit : credit - debit;
    return {
      accountId: r.accountId,
      code: r.code,
      name: r.name,
      type: r.type,
      subType: r.subType,
      debit,
      credit,
      balance,
    };
  });
}

/**
 * Realised invoice / bill / credit note lines for the cash basis, filtered the
 * same way as the SQL aggregation (account types, dimension, tag).
 */
async function cashRealisedFor(
  organizationId: string,
  window: CashWindow,
  opts: Omit<GLQueryOptions, "includeEmptyAccounts">
): Promise<CashRealisedLine[]> {
  let lines = await loadCashRealisedLines(organizationId, window);
  if (opts.accountTypes && opts.accountTypes.length > 0) {
    const types = new Set(opts.accountTypes);
    lines = lines.filter((l) => types.has(l.type));
  }
  if (opts.dimension && opts.dimensionValue !== undefined) {
    const dim = opts.dimension;
    lines = lines.filter((l) => (l[dim] ?? null) === opts.dimensionValue);
  }
  if (opts.tagId && lines.length > 0) {
    const ids = [...new Set(lines.map((l) => l.journalLineId))];
    const tagged = await db
      .select({ id: journalLine.id })
      .from(journalLine)
      .where(and(inArray(journalLine.id, ids), tagPredicate(opts.tagId)));
    const keep = new Set(tagged.map((t) => t.id));
    lines = lines.filter((l) => keep.has(l.journalLineId));
  }
  return lines;
}

type AggregateRow = {
  accountId: string;
  code: string;
  name: string;
  type: AccountAggregate["type"];
  subType: string | null;
  debit: number;
  credit: number;
};

/** Add realised lines into per-account rows (new accounts are appended, sorted by code). */
function mergeRealised(rows: AggregateRow[], lines: CashRealisedLine[]): AggregateRow[] {
  if (lines.length === 0) return rows;
  const byId = new Map(rows.map((r) => [r.accountId, { ...r, debit: Number(r.debit), credit: Number(r.credit) }]));
  let added = false;
  for (const l of lines) {
    let row = byId.get(l.accountId);
    if (!row) {
      row = { accountId: l.accountId, code: l.code, name: l.name, type: l.type, subType: l.subType, debit: 0, credit: 0 };
      byId.set(l.accountId, row);
      added = true;
    }
    row.debit += l.debit;
    row.credit += l.credit;
  }
  const merged = [...byId.values()];
  return added ? merged.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)) : merged;
}

/**
 * Build the LEFT JOIN predicate for the account-driven (includeEmptyAccounts)
 * path. All entry-level filters move here so non-matching activity is dropped
 * while the account row itself survives.
 */
function buildEntryJoinPredicate(
  organizationId: string,
  joinDate: JoinDate,
  opts: GLQueryOptions
): SQL {
  const clauses: (SQL | undefined)[] = [
    eq(journalLine.accountId, chartAccount.id),
  ];

  if (opts.dimension) {
    const col =
      opts.dimension === "costCenterId"
        ? journalLine.costCenterId
        : journalLine.projectId;
    if (opts.dimensionValue === null) {
      clauses.push(isNull(col));
    } else if (opts.dimensionValue !== undefined) {
      clauses.push(eq(col, opts.dimensionValue));
    }
  }

  if (opts.tagId) clauses.push(tagPredicate(opts.tagId));

  // Entry-level predicates referenced via a correlated EXISTS so they apply to
  // the matched line's entry without changing the LEFT-JOIN cardinality.
  const entryPredicates: SQL[] = [
    sql`je.organization_id = ${organizationId}`,
    sql`je.status = 'posted'`,
    sql`je.deleted_at is null`,
  ];
  if (joinDate?.kind === "range") {
    entryPredicates.push(
      sql`je.date >= ${joinDate.startDate} and je.date <= ${joinDate.endDate}`
    );
  } else if (joinDate?.kind === "asAt") {
    entryPredicates.push(sql`je.date <= ${joinDate.asAt}`);
  }
  if (opts.basis === "cash") {
    entryPredicates.push(
      sql`(
        je.source_type in (${sql.join(
          CASH_SOURCE_TYPES.map((s) => sql`${s}`),
          sql`, `
        )})
        or exists (
          select 1 from ${journalLine} cash_jl
          join ${chartAccount} cash_acct on cash_acct.id = cash_jl.account_id
          where cash_jl.journal_entry_id = je.id
            and cash_acct.sub_type in (${sql.join(
              CASH_ACCOUNT_SUBTYPES.map((s) => sql`${s}`),
              sql`, `
            )})
        )
      )`
    );
  }

  clauses.push(
    sql`exists (select 1 from ${journalEntry} je where je.id = ${journalLine.journalEntryId} and ${sql.join(
      entryPredicates,
      sql` and `
    )})`
  );

  return and(...clauses) as SQL;
}

/**
 * Aggregate posted activity WITHIN a date range (inclusive both ends).
 *
 * Use for P&L and any period report. `balance` is the natural-sign movement
 * for the period. Pass `accountTypes: ['revenue','expense']` for a P&L.
 */
export async function aggregateByDateRange(
  organizationId: string,
  range: DateRange,
  opts: GLQueryOptions = {}
): Promise<AccountAggregate[]> {
  const dateClause = and(
    gte(journalEntry.date, range.startDate),
    lte(journalEntry.date, range.endDate)
  );
  return aggregate(
    organizationId,
    dateClause,
    { kind: "range", startDate: range.startDate, endDate: range.endDate },
    opts
  );
}

/**
 * Aggregate CUMULATIVE posted activity up to and including `asAt`.
 *
 * Use for balance sheet and trial balance. `balance` is the natural-sign
 * cumulative balance as at the date. There is no lower bound, so this includes
 * all history (opening balances, prior years) — matching balance-sheet
 * semantics. Pass `includeEmptyAccounts: true` to list every account.
 */
export async function aggregateAsAt(
  organizationId: string,
  asAt: string,
  opts: GLQueryOptions = {}
): Promise<AccountAggregate[]> {
  const dateClause = lte(journalEntry.date, asAt);
  return aggregate(organizationId, dateClause, { kind: "asAt", asAt }, opts);
}

/**
 * Group aggregated activity by a tracking dimension AND account.
 *
 * Returns one bucket per distinct dimension value (including a `null` bucket
 * for unset), each holding the per-account aggregates for that dimension value.
 * Built on top of {@link aggregateByDateRange} semantics (date-range mode).
 */
export interface DimensionGroup {
  /** The dimension value for this bucket, or null for lines with no value. */
  dimensionValue: string | null;
  accounts: AccountAggregate[];
}

export async function aggregateByDimension(
  organizationId: string,
  range: DateRange,
  dimension: Dimension,
  opts: Omit<GLQueryOptions, "dimension" | "dimensionValue"> = {}
): Promise<DimensionGroup[]> {
  const debitSum = sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`;
  const creditSum = sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`;
  const dimCol =
    dimension === "costCenterId"
      ? journalLine.costCenterId
      : journalLine.projectId;

  const dateClause = and(
    gte(journalEntry.date, range.startDate),
    lte(journalEntry.date, range.endDate)
  );
  const where = buildWhere(organizationId, dateClause, opts);

  let rows = (await db
    .select({
      dimensionValue: dimCol,
      accountId: journalLine.accountId,
      code: chartAccount.code,
      name: chartAccount.name,
      type: chartAccount.type,
      subType: chartAccount.subType,
      debit: debitSum,
      credit: creditSum,
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
    .where(where)
    .groupBy(
      dimCol,
      journalLine.accountId,
      chartAccount.code,
      chartAccount.name,
      chartAccount.type,
      chartAccount.subType
    )
    .orderBy(chartAccount.code)) as Array<{
    dimensionValue: string | null;
    accountId: string;
    code: string;
    name: string;
    type: AccountAggregate["type"];
    subType: string | null;
    debit: number;
    credit: number;
  }>;

  if (opts.basis === "cash") {
    // Merge the realised share of settled invoices / bills / credit notes into
    // the matching (dimension value, account) rows.
    const realised = await cashRealisedFor(organizationId, range, opts);
    if (realised.length > 0) {
      const byKey = new Map(
        rows.map((r) => [`${r.dimensionValue ?? ""}|${r.accountId}`, { ...r, debit: Number(r.debit), credit: Number(r.credit) }])
      );
      for (const l of realised) {
        const dimensionValue = l[dimension] ?? null;
        const key = `${dimensionValue ?? ""}|${l.accountId}`;
        let row = byKey.get(key);
        if (!row) {
          row = { dimensionValue, accountId: l.accountId, code: l.code, name: l.name, type: l.type, subType: l.subType, debit: 0, credit: 0 };
          byKey.set(key, row);
        }
        row.debit += l.debit;
        row.credit += l.credit;
      }
      rows = [...byKey.values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    }
  }

  const buckets = new Map<string, DimensionGroup>();
  for (const r of rows) {
    const key = r.dimensionValue ?? " null";
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { dimensionValue: r.dimensionValue ?? null, accounts: [] };
      buckets.set(key, bucket);
    }
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    bucket.accounts.push({
      accountId: r.accountId,
      code: r.code,
      name: r.name,
      type: r.type,
      subType: r.subType,
      debit,
      credit,
      balance: isDebitNormal(r.type) ? debit - credit : credit - debit,
    });
  }

  return Array.from(buckets.values());
}
