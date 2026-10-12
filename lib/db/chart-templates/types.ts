export type AccountKind = "asset" | "liability" | "equity" | "revenue" | "expense";

/**
 * Which of the org's standard tax rates an account defaults to (Xero-style
 * account-driven tax): `standard` = the org's default rate, `exempt` = the
 * exempt rate, `none` = outside the scope of tax ("No VAT" / "BAS Excluded").
 */
export type DefaultTax = "standard" | "exempt" | "none";

export interface AccountTemplate {
  code: string;
  name: string;
  type: AccountKind;
  subType: string;
  /**
   * The posting-engine roles this account fills, as canonical generic codes
   * ("1200" = accounts receivable, "2200" = output tax…). Only used by the
   * role-mapped templates; see lib/api/account-roles.ts.
   */
  roles?: string[];
  /** Default tax rate for lines coded here (role-mapped templates only). */
  tax?: DefaultTax;
}

/**
 * A complete default chart an org is set up with. Unlike the legacy country
 * lists, every engine role the chart can fill is mapped, so postings land on
 * the chart's own accounts instead of a parallel set of generic 4-digit codes.
 */
export interface ChartTemplate {
  /** Stable id stored on organization.chartTemplate (never rename). */
  id: string;
  /** Display name, e.g. "Xero-style UK chart". */
  name: string;
  /** One-line description for pickers and MCP. */
  description: string;
  /** Accounts every org on this template starts with. */
  accounts: AccountTemplate[];
  /**
   * Role-mapped accounts that exist only once something needs them (goods
   * received not invoiced, customer deposits, inventory write-downs…), so the
   * starting chart stays as short as Xero's.
   */
  onDemand: AccountTemplate[];
  /**
   * First code to try, per account type, when the engine needs a role the
   * template doesn't define (walks upward to the next free code).
   */
  fallbackStart: Record<AccountKind, string>;
  /**
   * Where extra bank-feed ledger accounts are numbered from once the
   * template's own bank (role 1100/1110) or card (role 2600) account is taken.
   */
  bankStart: { asset: string; liability: string };
}
