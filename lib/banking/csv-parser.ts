import { parseBankStatement, type NormalizedTransaction } from "./importer";

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  reference?: string;
}

export function parseBankCSV(csvText: string): ParsedTransaction[] {
  const parsed = parseBankStatement({
    content: csvText,
    format: "csv",
    fileName: "statement.csv",
  });

  return parsed.transactions.map((transaction: NormalizedTransaction) => ({
    date: transaction.date,
    description: transaction.description,
    amount: transaction.amount,
    reference: transaction.reference ?? undefined,
  }));
}
