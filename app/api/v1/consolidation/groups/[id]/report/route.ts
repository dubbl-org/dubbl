import { db } from "@/lib/db";
import {
  consolidationGroup,
  chartAccount,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, isNull, sql, gte, lte } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

interface EntityBalance {
  orgId: string;
  label: string;
  orgName: string;
  accountType: string;
  accountName: string;
  accountCode: string;
  totalDebit: number;
  totalCredit: number;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
    const endDate = url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);

    // Verify the group belongs to this org
    const group = await db.query.consolidationGroup.findFirst({
      where: and(
        eq(consolidationGroup.id, id),
        eq(consolidationGroup.parentOrgId, ctx.organizationId),
        notDeleted(consolidationGroup.deletedAt)
      ),
      with: {
        members: {
          with: { organization: true },
        },
      },
    });

    if (!group) return notFound("Consolidation group");

    if (group.members.length === 0) {
      return ok({
        group: { id: group.id, name: group.name },
        members: [],
        startDate,
        endDate,
        consolidatedPnL: {
          totalRevenue: 0,
          totalExpenses: 0,
          netIncome: 0,
          byEntity: [],
          accounts: [],
        },
        consolidatedBalanceSheet: {
          totalAssets: 0,
          totalLiabilities: 0,
          totalEquity: 0,
          byEntity: [],
          accounts: [],
        },
      });
    }

    // Fetch GL balances for all member orgs
    const allBalances: EntityBalance[] = [];

    for (const m of group.members) {
      const balances = await db
        .select({
          accountType: chartAccount.type,
          accountName: chartAccount.name,
          accountCode: chartAccount.code,
          totalDebit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`,
          totalCredit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`,
        })
        .from(journalLine)
        .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
        .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
        .where(
          and(
            eq(journalEntry.organizationId, m.orgId),
            eq(journalEntry.status, "posted"),
            isNull(journalEntry.deletedAt),
            gte(journalEntry.date, startDate),
            lte(journalEntry.date, endDate)
          )
        )
        .groupBy(chartAccount.type, chartAccount.name, chartAccount.code);

      for (const b of balances) {
        allBalances.push({
          orgId: m.orgId,
          label: m.label || m.organization.name,
          orgName: m.organization.name,
          accountType: b.accountType,
          accountName: b.accountName,
          accountCode: b.accountCode,
          totalDebit: Number(b.totalDebit),
          totalCredit: Number(b.totalCredit),
        });
      }
    }

    // Build consolidated P&L
    const pnlEntityMap = new Map<string, { revenue: number; expenses: number }>();
    const pnlAccountMap = new Map<string, { type: string; name: string; code: string; total: number; byEntity: Record<string, number> }>();

    // Build consolidated Balance Sheet
    const bsEntityMap = new Map<string, { assets: number; liabilities: number; equity: number }>();
    const bsAccountMap = new Map<string, { type: string; name: string; code: string; total: number; byEntity: Record<string, number> }>();

    for (const b of allBalances) {
      const accountKey = `${b.accountType}:${b.accountCode}:${b.accountName}`;

      if (b.accountType === "revenue" || b.accountType === "expense") {
        // P&L accounts
        if (!pnlEntityMap.has(b.orgId)) {
          pnlEntityMap.set(b.orgId, { revenue: 0, expenses: 0 });
        }
        const entity = pnlEntityMap.get(b.orgId)!;

        if (!pnlAccountMap.has(accountKey)) {
          pnlAccountMap.set(accountKey, { type: b.accountType, name: b.accountName, code: b.accountCode, total: 0, byEntity: {} });
        }
        const account = pnlAccountMap.get(accountKey)!;

        let balance: number;
        if (b.accountType === "revenue") {
          balance = b.totalCredit - b.totalDebit;
          entity.revenue += balance;
        } else {
          balance = b.totalDebit - b.totalCredit;
          entity.expenses += balance;
        }
        account.total += balance;
        account.byEntity[b.orgId] = (account.byEntity[b.orgId] || 0) + balance;
      } else {
        // Balance sheet accounts (asset, liability, equity)
        if (!bsEntityMap.has(b.orgId)) {
          bsEntityMap.set(b.orgId, { assets: 0, liabilities: 0, equity: 0 });
        }
        const entity = bsEntityMap.get(b.orgId)!;

        if (!bsAccountMap.has(accountKey)) {
          bsAccountMap.set(accountKey, { type: b.accountType, name: b.accountName, code: b.accountCode, total: 0, byEntity: {} });
        }
        const account = bsAccountMap.get(accountKey)!;

        let balance: number;
        if (b.accountType === "asset") {
          balance = b.totalDebit - b.totalCredit;
          entity.assets += balance;
        } else if (b.accountType === "liability") {
          balance = b.totalCredit - b.totalDebit;
          entity.liabilities += balance;
        } else {
          // equity
          balance = b.totalCredit - b.totalDebit;
          entity.equity += balance;
        }
        account.total += balance;
        account.byEntity[b.orgId] = (account.byEntity[b.orgId] || 0) + balance;
      }
    }

    // Build members info
    const membersInfo = group.members.map((m) => ({
      orgId: m.orgId,
      label: m.label || m.organization.name,
      orgName: m.organization.name,
    }));

    // Build P&L response
    let totalRevenue = 0;
    let totalExpenses = 0;
    const pnlByEntity = membersInfo.map((m) => {
      const e = pnlEntityMap.get(m.orgId) || { revenue: 0, expenses: 0 };
      totalRevenue += e.revenue;
      totalExpenses += e.expenses;
      return {
        orgId: m.orgId,
        label: m.label,
        revenue: e.revenue,
        expenses: e.expenses,
        netIncome: e.revenue - e.expenses,
      };
    });

    const pnlAccounts = Array.from(pnlAccountMap.values()).sort((a, b) => {
      if (a.type !== b.type) return a.type === "revenue" ? -1 : 1;
      return a.code.localeCompare(b.code);
    });

    // Build Balance Sheet response
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    const bsByEntity = membersInfo.map((m) => {
      const e = bsEntityMap.get(m.orgId) || { assets: 0, liabilities: 0, equity: 0 };
      totalAssets += e.assets;
      totalLiabilities += e.liabilities;
      totalEquity += e.equity;
      return {
        orgId: m.orgId,
        label: m.label,
        assets: e.assets,
        liabilities: e.liabilities,
        equity: e.equity,
      };
    });

    const bsAccounts = Array.from(bsAccountMap.values()).sort((a, b) => {
      const typeOrder: Record<string, number> = { asset: 0, liability: 1, equity: 2 };
      if (a.type !== b.type) return (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0);
      return a.code.localeCompare(b.code);
    });

    return ok({
      group: { id: group.id, name: group.name },
      members: membersInfo,
      startDate,
      endDate,
      consolidatedPnL: {
        totalRevenue,
        totalExpenses,
        netIncome: totalRevenue - totalExpenses,
        byEntity: pnlByEntity,
        accounts: pnlAccounts,
      },
      consolidatedBalanceSheet: {
        totalAssets,
        totalLiabilities,
        totalEquity,
        byEntity: bsByEntity,
        accounts: bsAccounts,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
