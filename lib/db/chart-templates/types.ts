export interface AccountTemplate {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  subType: string;
  /**
   * Share of the account that is non-deductible for income tax, basis points
   * (5000 = 50%). Seeds chartAccount.taxDisallowedPercent, which drives the
   * add-back line on a tax computation (e.g. entertainment, private cars).
   */
  taxDisallowedPercent?: number;
}
