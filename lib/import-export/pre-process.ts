import type { SourceSystem } from "./types";
import { normalizeAccountType, normalizeContactType, parseDate, parseMoney } from "./transformers";

type RawRow = Record<string, unknown>;

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function preProcessAccounts(rows: RawRow[], source: SourceSystem): RawRow[] {
  return rows.map(row => {
    const result = { ...row };
    if (result.type) {
      result.type = normalizeAccountType(str(result.type), source);
    }
    return result;
  });
}

export function preProcessContacts(rows: RawRow[]): RawRow[] {
  return rows.map(row => {
    const result = { ...row };
    if (result.type) {
      result.type = normalizeContactType(str(result.type));
    }
    return result;
  });
}

export function preProcessInvoices(rows: RawRow[], source: SourceSystem): RawRow[] {
  return rows.map(row => {
    const result = { ...row };
    if (result.issueDate) result.issueDate = parseDate(str(result.issueDate), source);
    if (result.dueDate) result.dueDate = parseDate(str(result.dueDate), source);
    return result;
  });
}

export function preProcessBills(rows: RawRow[], source: SourceSystem): RawRow[] {
  return rows.map(row => {
    const result = { ...row };
    if (result.issueDate) result.issueDate = parseDate(str(result.issueDate), source);
    if (result.dueDate) result.dueDate = parseDate(str(result.dueDate), source);
    return result;
  });
}

export function preProcessEntries(rows: RawRow[], source: SourceSystem): RawRow[] {
  return rows.map(row => {
    const result = { ...row };
    if (result.date) result.date = parseDate(str(result.date), source);
    return result;
  });
}

export function preProcessProducts(rows: RawRow[]): RawRow[] {
  return rows.map(row => {
    const result = { ...row };
    if (result.unitPrice && typeof result.unitPrice === "string") {
      const cents = parseMoney(result.unitPrice);
      result.unitPrice = cents / 100;
    }
    if (result.costPrice && typeof result.costPrice === "string") {
      const cents = parseMoney(result.costPrice);
      result.costPrice = cents / 100;
    }
    return result;
  });
}

export function preProcessBankTransactions(rows: RawRow[], source: SourceSystem): RawRow[] {
  return rows.map(row => {
    const result = { ...row };
    if (result.date) result.date = parseDate(str(result.date), source);

    // Handle split Debit/Credit columns -> single amount
    if (!result.amount && (result.debit || result.credit)) {
      const debitVal = parseMoney(str(result.debit));
      const creditVal = parseMoney(str(result.credit));
      // Deposits are positive, payments are negative
      result.amount = (creditVal - debitVal) / 100;
    }
    // Clean up helper fields
    delete result.debit;
    delete result.credit;

    return result;
  });
}
