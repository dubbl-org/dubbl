/**
 * US sales tax module: sales tax return boxes, and the anchor for 1099 /
 * Schedule C reporting (which lives in lib/api/reports/1099.ts).
 *
 * Sales tax is collected on sales but is not recoverable on purchases, so there
 * is no input-tax control account.
 */
import type { TaxModule } from "@/lib/tax/types";

export const US_MODULE: TaxModule = {
  country: "US",
  countryName: "United States",
  regime: "us_sales_tax",
  taxName: "Sales Tax",
  currencyRule: "org-base",
  controlAccounts: { output: "2230" },
  rates: [
    {
      name: "Sales Tax",
      rate: 0,
      type: "both",
      kind: "sales_tax_us",
      supplyCategory: "standard",
      recoverablePercent: 0,
      isDefault: true,
    },
    { name: "Tax Exempt", rate: 0, type: "both", kind: "exempt", supplyCategory: "exempt", recoverablePercent: 0 },
    { name: "No Tax", rate: 0, type: "both", kind: "no_vat", supplyCategory: "outside_scope", recoverablePercent: 0 },
  ],
  returns: [
    {
      kind: "sales_tax",
      title: "Sales tax return",
      authority: "State",
      bases: ["accrual", "cash"],
      boxes: [
        {
          box: "gross_sales",
          label: "Gross Sales",
          compute: { type: "docTotal", doc: "invoice", measure: "net" },
        },
        {
          box: "taxable_sales",
          label: "Taxable Sales",
          compute: { type: "docLines", doc: "invoiceLine", measure: "net", supplyCategory: ["standard"] },
        },
        {
          box: "tax_due",
          label: "Sales Tax Due",
          compute: { type: "controlAccount", account: "2230", sign: "credit" },
        },
      ],
    },
  ],
  periods: [{ returnKind: "sales_tax", frequency: "monthly", dueDays: 20 }],
};
