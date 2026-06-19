import { GENERIC_ACCOUNTS } from "./chart-templates";
import { syncSystemAccounts } from "./system-accounts";

/** @deprecated Use getAccountsForCountry() for country-specific templates */
export const DEFAULT_ACCOUNTS = GENERIC_ACCOUNTS;

/**
 * Seeds an org's default categories from the code-owned template.
 *
 * Delegates to {@link syncSystemAccounts}, which is idempotent: it adds any
 * template categories the org is missing (as locked system categories) and
 * never duplicates existing ones. Safe to call repeatedly — the same sync also
 * runs continuously on the accounts list endpoint, so later additions to the
 * template propagate to every existing org automatically.
 */
export async function seedDefaultAccounts(
  orgId: string,
  currencyCode: string,
  countryCode?: string,
) {
  await syncSystemAccounts(orgId, { currencyCode, countryCode });
}
