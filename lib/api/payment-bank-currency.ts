/**
 * Why a bank account can't pay a document in `documentCurrency`, or null when
 * it can. A payment posts its cash leg in base currency (converted at the
 * payment-date rate), so a bank account can pay a document in its own currency
 * or, for a foreign-currency document, a base-currency account (the usual
 * "pay a EUR supplier from the home account" case). A foreign account paying a
 * document in yet another currency (or in base) would book an amount that
 * never matches what left that account, so it's rejected, like matching a
 * bank line to a document in another currency is.
 */
export function bankAccountCurrencyError(
  bankCurrency: string,
  documentCurrency: string,
  baseCurrency: string,
  documentLabel = "bill"
): string | null {
  if (bankCurrency === documentCurrency || bankCurrency === baseCurrency) return null;
  return `This ${documentLabel} is in ${documentCurrency} but the bank account is in ${bankCurrency}. Pay it from a bank account in ${documentCurrency}${
    documentCurrency === baseCurrency ? "" : ` or ${baseCurrency}`
  }.`;
}
