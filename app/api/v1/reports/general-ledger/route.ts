import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine, chartAccount, organization } from "@/lib/db/schema";
import { eq, and, isNull, gte, lte, asc, sql, type SQL } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import type { Statement } from "@/lib/reports/statement-export";
import { aggregateByDateRange, type Dimension } from "@/lib/reports/gl-query";

const DEFAULT_ENTRIES_PER_ACCOUNT = 50;

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const format = (url.searchParams.get("format") || "json").toLowerCase();
    const startDate = url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
    const endDate = url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);
    // Optional: fetch entries for a single account with pagination
    const accountId = url.searchParams.get("accountId");
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || String(DEFAULT_ENTRIES_PER_ACCOUNT), 10) || DEFAULT_ENTRIES_PER_ACCOUNT));

    // Optional tracking-dimension filter. Restrict the ledger to journal lines
    // tagged with a given cost center or project. costCenterId takes precedence
    // if both are supplied. Pass the literal value "none"/"null" to match lines
    // where the dimension is unset.
    const costCenterId = url.searchParams.get("costCenterId");
    const projectId = url.searchParams.get("projectId");
    let dimension: Dimension | undefined;
    let dimensionValue: string | null | undefined;
    let dimensionRaw: string | null = null;
    if (costCenterId !== null) {
      dimension = "costCenterId";
      dimensionRaw = costCenterId;
    } else if (projectId !== null) {
      dimension = "projectId";
      dimensionRaw = projectId;
    }
    if (dimension) {
      dimensionValue =
        dimensionRaw === "none" || dimensionRaw === "null" || dimensionRaw === ""
          ? null
          : dimensionRaw;
    }

    // Line-level predicate for the detail queries that mirror the gl-query
    // dimension filter (gl-query handles the aggregated totals).
    const dimensionClause: SQL | undefined = dimension
      ? (() => {
          const col =
            dimension === "costCenterId"
              ? journalLine.costCenterId
              : journalLine.projectId;
          return dimensionValue === null ? isNull(col) : eq(col, dimensionValue!);
        })()
      : undefined;

    const baseWhere = and(
      eq(journalEntry.organizationId, ctx.organizationId),
      eq(journalEntry.status, "posted"),
      isNull(journalEntry.deletedAt),
      gte(journalEntry.date, startDate),
      lte(journalEntry.date, endDate),
      dimensionClause
    );

    // Single-account mode: return paginated entries for one account
    if (accountId) {
      const rows = await db
        .select({
          date: journalEntry.date,
          entryNumber: journalEntry.entryNumber,
          description: journalEntry.description,
          reference: journalEntry.reference,
          debit: journalLine.debitAmount,
          credit: journalLine.creditAmount,
          accountType: chartAccount.type,
        })
        .from(journalLine)
        .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
        .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
        .where(and(baseWhere, eq(journalLine.accountId, accountId)))
        .orderBy(asc(journalEntry.date), asc(journalEntry.entryNumber))
        .offset(offset)
        .limit(limit);

      // Compute running balances starting from offset
      // If offset > 0, we need the balance up to that point
      let runningBalance = 0;
      if (offset > 0) {
        const priorRows = await db
          .select({
            debit: journalLine.debitAmount,
            credit: journalLine.creditAmount,
            accountType: chartAccount.type,
          })
          .from(journalLine)
          .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
          .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
          .where(and(baseWhere, eq(journalLine.accountId, accountId)))
          .orderBy(asc(journalEntry.date), asc(journalEntry.entryNumber))
          .limit(offset);

        for (const r of priorRows) {
          const isDebitNormal = r.accountType === "asset" || r.accountType === "expense";
          runningBalance += isDebitNormal ? r.debit - r.credit : r.credit - r.debit;
        }
      }

      const entries = rows.map((row) => {
        const isDebitNormal = row.accountType === "asset" || row.accountType === "expense";
        runningBalance += isDebitNormal ? row.debit - row.credit : row.credit - row.debit;
        return {
          date: row.date,
          entryNumber: row.entryNumber,
          description: row.description,
          reference: row.reference,
          debit: row.debit,
          credit: row.credit,
          runningBalance,
        };
      });

      return NextResponse.json({ entries, offset, limit });
    }

    // Summary mode: return all accounts with totals + capped entries per account
    // Per-account totals come from the shared GL aggregation (so basis/dimension
    // handling stays consistent across reports). Entry counts are still pulled
    // from the detail query below.
    const aggregates = await aggregateByDateRange(
      ctx.organizationId,
      { startDate, endDate },
      dimension ? { dimension, dimensionValue } : {}
    );
    const summaries = aggregates.map((a) => ({
      accountId: a.accountId,
      accountName: a.name,
      accountCode: a.code,
      accountType: a.type,
      totalDebit: a.debit,
      totalCredit: a.credit,
    }));

    // Then fetch first N entries per account using a single query with row numbers
    const entriesRows = await db
      .select({
        accountId: journalLine.accountId,
        accountType: chartAccount.type,
        date: journalEntry.date,
        entryNumber: journalEntry.entryNumber,
        description: journalEntry.description,
        reference: journalEntry.reference,
        debit: journalLine.debitAmount,
        credit: journalLine.creditAmount,
        rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${journalLine.accountId} ORDER BY ${journalEntry.date} ASC, ${journalEntry.entryNumber} ASC)`.as("rn"),
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
      .where(baseWhere)
      .orderBy(asc(chartAccount.code), asc(journalEntry.date), asc(journalEntry.entryNumber));

    // Group entries by account, capped at limit. The window's ROW_NUMBER gives
    // us the true total line count per account as the max rn, so we can keep
    // reporting `totalEntries` without a separate COUNT query.
    const entriesByAccount = new Map<string, typeof entriesRows>();
    const countByAccount = new Map<string, number>();
    for (const row of entriesRows) {
      countByAccount.set(
        row.accountId,
        Math.max(countByAccount.get(row.accountId) || 0, Number(row.rn))
      );
      if (row.rn > limit) continue;
      const existing = entriesByAccount.get(row.accountId) || [];
      existing.push(row);
      entriesByAccount.set(row.accountId, existing);
    }

    const accounts = summaries.map((s) => {
      const rows = entriesByAccount.get(s.accountId) || [];
      const isDebitNormal = s.accountType === "asset" || s.accountType === "expense";
      let runningBalance = 0;
      const entries = rows.map((row) => {
        runningBalance += isDebitNormal ? row.debit - row.credit : row.credit - row.debit;
        return {
          date: row.date,
          entryNumber: row.entryNumber,
          description: row.description,
          reference: row.reference,
          debit: row.debit,
          credit: row.credit,
          runningBalance,
        };
      });

      const balance = isDebitNormal
        ? (s.totalDebit || 0) - (s.totalCredit || 0)
        : (s.totalCredit || 0) - (s.totalDebit || 0);

      return {
        accountId: s.accountId,
        accountName: s.accountName,
        accountCode: s.accountCode,
        accountType: s.accountType,
        entries,
        totalEntries: countByAccount.get(s.accountId) || 0,
        totalDebit: s.totalDebit || 0,
        totalCredit: s.totalCredit || 0,
        balance,
      };
    });

    if (format === "pdf" || format === "xlsx") {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      });
      const currency = org?.defaultCurrency || "USD";

      // One section per account: its entries (debit positive, credit negative)
      // plus a running closing balance as the subtotal.
      const statement: Statement = {
        title: "General Ledger",
        periodLabel: `${startDate} to ${endDate}`,
        currency,
        sections: accounts.map((acct) => ({
          label: `${acct.accountCode} ${acct.accountName}`,
          rows: acct.entries.map((e) => ({
            name: `${e.date} ${e.entryNumber}${e.description ? ` - ${e.description}` : ""}`,
            amount: e.debit - e.credit,
            depth: 1,
          })),
          subtotal: acct.balance,
        })),
      };

      const { toPdf, toXlsx } = await import("@/lib/reports/statement-export");
      if (format === "pdf") {
        const buffer = await toPdf(statement);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="general-ledger-${startDate}-${endDate}.pdf"`,
          },
        });
      }
      const buffer = await toXlsx(statement);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="general-ledger-${startDate}-${endDate}.xlsx"`,
        },
      });
    }

    return NextResponse.json({
      startDate,
      endDate,
      ...(dimension
        ? { dimension, dimensionValue: dimensionValue ?? null }
        : {}),
      accounts,
    });
  } catch (err) {
    return handleError(err);
  }
}
