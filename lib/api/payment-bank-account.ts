import { db } from "@/lib/db";
import { bankAccount, organization } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { bankAccountCurrencyError } from "@/lib/api/payment-bank-currency";

export type PaymentBankAccount = {
  id: string;
  accountName: string;
  currencyCode: string;
};

/**
 * Load a bank account a payment will be made from, scoped to the org. Returns
 * null when it doesn't exist (or was deleted), so callers can reject the
 * request instead of silently posting to the default bank account.
 */
export async function findPaymentBankAccount(
  organizationId: string,
  bankAccountId: string
): Promise<PaymentBankAccount | null> {
  const row = await db.query.bankAccount.findFirst({
    where: and(
      eq(bankAccount.id, bankAccountId),
      eq(bankAccount.organizationId, organizationId),
      isNull(bankAccount.deletedAt)
    ),
    columns: { id: true, accountName: true, currencyCode: true },
  });
  return row ?? null;
}

/** The organization's base (reporting) currency. */
export async function getBaseCurrency(organizationId: string): Promise<string> {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { defaultCurrency: true },
  });
  return org?.defaultCurrency ?? "USD";
}

/**
 * Validate a chosen bank account for paying documents in the given
 * currencies. Returns an error message, or null when the account is usable.
 */
export async function checkPaymentBankAccount(
  organizationId: string,
  bankAccountId: string,
  documentCurrencies: string[],
  documentLabel = "bill"
): Promise<string | null> {
  const account = await findPaymentBankAccount(organizationId, bankAccountId);
  if (!account) return "Bank account not found";
  const base = await getBaseCurrency(organizationId);
  for (const currency of new Set(documentCurrencies)) {
    const error = bankAccountCurrencyError(account.currencyCode, currency, base, documentLabel);
    if (error) return error;
  }
  return null;
}
