import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransaction, bankAccount } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { generateCSV, centsToDecimal } from "@/lib/import-export/csv-utils";

const COLUMNS = ["date", "description", "amount", "reference", "bankAccountName", "reconciled"];

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    // Get bank accounts for this org
    const bankAccounts = await db.query.bankAccount.findMany({
      where: eq(bankAccount.organizationId, ctx.organizationId),
      columns: { id: true, accountName: true },
    });
    const bankAccountMap = new Map(bankAccounts.map(ba => [ba.id, ba.accountName]));
    const bankAccountIds = bankAccounts.map(ba => ba.id);

    if (bankAccountIds.length === 0) {
      const csv = generateCSV([], COLUMNS);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=bank-transactions.csv",
        },
      });
    }

    const allTxns: Record<string, unknown>[] = [];
    for (const baId of bankAccountIds) {
      const conditions = [eq(bankTransaction.bankAccountId, baId)];
      if (startDate) conditions.push(gte(bankTransaction.date, startDate));
      if (endDate) conditions.push(lte(bankTransaction.date, endDate));

      const txns = await db.query.bankTransaction.findMany({
        where: and(...conditions),
      });

      for (const t of txns) {
        allTxns.push({
          date: t.date,
          description: t.description,
          amount: centsToDecimal(t.amount),
          reference: t.reference || "",
          bankAccountName: bankAccountMap.get(t.bankAccountId) || "",
          reconciled: t.status === "reconciled" ? "true" : "false",
        });
      }
    }

    const csv = generateCSV(allTxns, COLUMNS);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=bank-transactions.csv",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
