import { db } from "./index";
import { chartAccount, organization } from "./schema";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { getAccountsForCountry } from "./chart-templates";
import type { AccountTemplate } from "./chart-templates";
import { UNIVERSAL_ACCOUNTS, nextFreeCode } from "./chart-templates/universal";

/**
 * Continuously syncs the code-owned default category catalog into an org.
 *
 * The chart-of-accounts template (`lib/db/chart-templates/*`) is the single
 * source of truth for the system categories every org gets out of the box.
 * Unlike a one-time seed, this is idempotent and runs on a hot path (the
 * accounts list endpoint), so when a new default category is added to the
 * template in code it automatically appears in EVERY existing org — the same
 * "managed, always up to date" behaviour Xero / QuickBooks / Zoho provide.
 *
 * System categories are flagged `isSystem` so they can't be renamed, recoded,
 * retyped or deleted. Users add their own custom categories on top
 * (`isSystem = false`), which stay fully editable.
 *
 * Returns how many categories were added / revived / locked this call
 * (0/0/0 in steady state, when no writes happen).
 */
export async function syncSystemAccounts(
  orgId: string,
  opts?: { currencyCode?: string; countryCode?: string },
): Promise<{ added: number; revived: number; locked: number }> {
  // Resolve the org's currency + country (only hit the org row if the caller
  // didn't already have these from the request that triggered the sync).
  let currencyCode = opts?.currencyCode;
  let countryCode = opts?.countryCode;
  if (currencyCode === undefined || countryCode === undefined) {
    const [org] = await db
      .select({
        defaultCurrency: organization.defaultCurrency,
        countryCode: organization.countryCode,
      })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);
    currencyCode = currencyCode ?? org?.defaultCurrency ?? "USD";
    countryCode = countryCode ?? org?.countryCode ?? undefined;
  }

  const template = getAccountsForCountry(countryCode || "");
  const templateCodes = new Set(template.map((a) => a.code));
  const templateNames = new Set(template.map((a) => a.name));

  // What does the org already have? Include soft-deleted rows (deletedAt) so we
  // can revive a default the user previously removed, and so we never try to
  // re-insert a code that already exists (the (org, code) unique index).
  const existing = await db
    .select({
      code: chartAccount.code,
      name: chartAccount.name,
      isSystem: chartAccount.isSystem,
      deletedAt: chartAccount.deletedAt,
    })
    .from(chartAccount)
    .where(eq(chartAccount.organizationId, orgId));
  const existingCodes = new Set(existing.map((e) => e.code));
  const existingNames = new Set(existing.map((e) => e.name));

  // Layer the country-agnostic universal categories (owner/director money
  // movements) on top of the country template, but only the ones the template
  // doesn't already provide. Resolve code clashes per org (e.g. Swedish BAS
  // already uses 2510), and dedupe by name so this stays idempotent across runs.
  const usedCodes = new Set([...templateCodes, ...existingCodes]);
  const universalToAdd: AccountTemplate[] = [];
  for (const u of UNIVERSAL_ACCOUNTS) {
    if (templateNames.has(u.name) || existingNames.has(u.name)) continue;
    const code = nextFreeCode(u.code, usedCodes);
    usedCodes.add(code);
    universalToAdd.push({ ...u, code });
  }

  // 1) Add every template (and universal-overlay) category the org is missing,
  //    as a locked system category. onConflictDoNothing makes concurrent syncs
  //    safe on the (organization_id, code) unique index.
  const missing = [
    ...template.filter((a) => !existingCodes.has(a.code)),
    ...universalToAdd,
  ];
  if (missing.length) {
    await db
      .insert(chartAccount)
      .values(
        missing.map((a) => ({
          organizationId: orgId,
          code: a.code,
          name: a.name,
          type: a.type,
          subType: a.subType,
          currencyCode: currencyCode as string,
          isSystem: true,
        })),
      )
      .onConflictDoNothing();
  }

  // 2) Revive any default the user had soft-deleted: a built-in category can't
  //    really be removed, only hidden — so bring it back (and re-lock it) the
  //    next time we sync, matching how Xero/QuickBooks restore system accounts.
  const toRevive = existing
    .filter((e) => e.deletedAt !== null && templateCodes.has(e.code))
    .map((e) => e.code);
  if (toRevive.length) {
    await db
      .update(chartAccount)
      .set({ deletedAt: null, isSystem: true })
      .where(
        and(
          eq(chartAccount.organizationId, orgId),
          inArray(chartAccount.code, toRevive),
          isNotNull(chartAccount.deletedAt),
        ),
      );
  }

  // 3) Lock any pre-existing (live) rows that match a template category but were
  //    seeded before we marked defaults as system. Names are left untouched so
  //    a user's earlier rename of a default is preserved.
  const toLock = existing
    .filter((e) => e.deletedAt === null && !e.isSystem && templateCodes.has(e.code))
    .map((e) => e.code);
  if (toLock.length) {
    await db
      .update(chartAccount)
      .set({ isSystem: true })
      .where(
        and(
          eq(chartAccount.organizationId, orgId),
          inArray(chartAccount.code, toLock),
        ),
      );
  }

  return { added: missing.length, revived: toRevive.length, locked: toLock.length };
}
