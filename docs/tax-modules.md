# Adding a tax jurisdiction

The tax layer is **one engine plus per-jurisdiction data**. A country is a
`TaxModule` in `lib/tax/modules/`; the engine never contains an `if (country)`.

```
lib/tax/
  types.ts          TaxModule, ReturnDefinition, BoxSpec, BoxSource, FsPresentation
  registry.ts       getTaxModule / listTaxModules / resolveTaxModuleForOrg
  engine.ts         gatherReturnInputs (async) + computeReturn (pure)
  ledger.ts         the queries behind the box sources
  return-service.ts module resolution + manual overrides → a computed return
  workpaper.ts      ReturnResult → xlsx (statements-workbook)
  periods.ts        the filing calendar for a fiscal year
  modules/
    eu-vat.ts       GB VAT100, NL, IE, ZA, AU BAS, CA, IN
    sg.ts           GST F5, Form C-S, ECI, capital allowances, SFRS, XBRL
    us-sales.ts     US sales tax (1099 lives in lib/api/reports/1099.ts)
```

## The five steps

1. **Write the module** (`lib/tax/modules/<code>.ts`) and export a `TaxModule`:

   ```ts
   export const XX_MODULE: TaxModule = {
     country: "XX",                 // ISO 3166-1 alpha-2, the registry key
     countryName: "Exemplia",
     regime: "vat",                 // vat | gst | us_sales_tax
     taxName: "VAT",
     currencyRule: "org-base",      // "local" forces the filing currency (SG → SGD)
     chartTemplate: "XX",           // optional: lib/db/chart-templates/xx.ts
     controlAccounts: { output: "2200", input: "1500", suspense: "2240" },
     rates: [...],                  // seeded by applyTaxProfile, effective-dated
     returns: [...],                // at least one ReturnDefinition
     periods: [{ returnKind: "vat100", frequency: "quarterly", dueDays: 39 }],
     fsPresentation: {...},         // optional: captions + current/non-current order
     xbrl: { templates: ["sim", "full"], authority: "ACRA" }, // optional
   };
   ```

   Register it in `lib/tax/registry.ts` (`MODULES`) and, if it should be the
   default for a regime, in `REGIME_DEFAULT_COUNTRY`.

2. **Describe the boxes** as data. Each box is `{ box, label, help, compute }`,
   and `compute` is one of the six query shapes:

   | `BoxSource` | Figure |
   |---|---|
   | `controlAccount` | posted movement on a control account (natural sign) |
   | `reverseCharge` | output tax self-accounted (`ledger`) or reverse-charge tax on bills (`docLines`) |
   | `docLines` | invoice/bill line totals, by supply category (`standard`, `zero_rated`, `exempt`, `outside_scope`) |
   | `docTotal` | document header subtotal or gross |
   | `ecSales` / `ecAcquisitions` | tax-numbered cross-border counterparties |
   | `revenueFromPnl` / `accountType` / `accountTag` | ledger balances by account type or `chartAccount.subType` |
   | `sum` / `difference` | arithmetic over other boxes, in any definition order |
   | `manual` / `taxBasisSchedule` | typed on the return, or computed by a tax workpaper |

   Boxes with `supplyCategory` are what make zero-rated, exempt and
   outside-scope separable — `tax_rate.kind` alone cannot do it, because zero
   rated and exempt both post 0%.

3. **Add the chart template** if the country needs its own account structure
   (`lib/db/chart-templates/xx.ts` + a line in `index.ts`). The `subType` values
   are the contract: return boxes (`accountTag`) and XBRL captions read them. Seed
   `taxDisallowedPercent` on accounts whose costs are not deductible (Singapore
   entertainment, 50%) — that is the add-back line on a tax computation.

4. **Update the rate seed** and, if rates change over time, set
   `effectiveFrom` / `effectiveTo`. A GST change from 8% to 9% is two rows, not an
   edit, so a re-opened return still reproduces the filed figures.

5. **Test it.** Add a case to `tests/tax-return-golden.test.ts` (or a new file)
   that calls `computeReturn` with literal `ReturnInputs` and asserts every box to
   a literal cent value. No database, no HTTP.

## Where the numbers come from

`gatherReturnInputs` fetches only what the definition uses, once each, then
`computeReturn` is pure. That split is deliberate: the arithmetic is what gets
tested, and the same input always produces the same return.

Recognition basis: accrual recognises tax on the entry date; cash recognises only
entries whose source is a cash/payment type or that touch a `bank` account. A
module that cannot file on a cash basis says so (`bases: ["accrual"]`) and the
service downgrades rather than silently misreporting.

Manual values on `tax_return_line` (`isCalculated = false`) win over computed
figures for every box, including derived ones — that is how a filed return keeps
its own numbers when re-opened.

## What lives outside the module

- `lib/api/tax-profiles.ts` is a **view** over modules (rate seeding + the flat
  profile shape the API and MCP tools return).
- Tax periods are `tax_period` rows keyed by `(organization, return_kind, start,
  end)`; `lib/tax/periods.ts` generates them, `POST /api/v1/tax-periods/generate`
  inserts them idempotently.
- Filing deadlines are not columns: `generatePeriods` returns `dueDate` and the
  calendar derives it, so a statutory change is one constant.

## Front-end

`/tax/returns/[kind]` renders any return: the tabs in `app/(dashboard)/tax/layout.tsx`
and the cards in the reports catalogue come from `GET /api/v1/tax/returns`, not
from a country list. Adding a jurisdiction re-points all of it.
