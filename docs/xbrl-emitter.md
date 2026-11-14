# The ACRA XBRL emitter

Turns a year of books into the package BizFinx accepts for a Singapore annual
return. `assets/xbrl/acra-2026/README.md` covers the taxonomy package itself;
this page covers the code and the filing gate.

## Who files what

Two different "small company" tests decide two different things — do not confuse
them:

| Test | Threshold | Consequence |
|---|---|---|
| Companies Act small company (2 of 3) | revenue ≤ S$10m, assets ≤ S$10m, ≤ 50 staff | audit exemption |
| **ACRA template test** (both) | revenue **and** total assets ≤ S$500,000 | Simplified XBRL + PDF of the FS |
| Outside the template test | either figure above S$500,000 | Full XBRL for that year |

`lib/reports/xbrl/assemble.ts` applies ACRA's test itself: the stored
`organization.xbrlTemplate` is the org's expectation, but the year's figures
win, and the filing page says which test fired and why. Solvent exempt private
companies are exempt from XBRL altogether (Full XBRL still applies to insolvent
ones); banks and insurers file the FSH frameworks, which are not implemented.

## Pipeline

```
assemble.ts     DB → XbrlInput   (two years of balances + FsModel + DEI header)
  facts.ts      FsModel + notes → Fact[] (element, context, unit, value)
  rounding.ts   cents → whole dollars, rounded per component then summed
  mapping*.ts   caption → element, per template; unmapped rows carry a reason
  instance.ts   the .xbrl document
  extension.ts  the company .xsd + _pre/_cal/_def linkbases
  validate.ts   generated calculation checks + the published rule subset
  package.ts    zip: instance, extension, linkbases, taxonomy folder
```

Everything except `assemble.ts` is pure, so the golden instance and the rounding
invariant are tested without a database (`tests/sg-xbrl.test.ts`).

**Rounding is the one rule to keep:** the instance is in whole dollars. Round each
component to dollars and **sum the rounded components**; never round a total
independently. Doing it the other way breaks ACRA's `parent = Σ children` rule by
±1 and is the most common software-generated filing failure. `facts.ts` computes
totals from the children, so this holds by construction.

**Validation.** `scripts/gen-xbrl-taxonomy.ts` parses the taxonomy's
`_cal.xml` and emits the sum checks (84 arcs for Simplified, 112 for Full) plus
presentation order and role definitions into
`lib/reports/xbrl/taxonomy.generated.ts`. `validate.ts` applies them per context
(period × dimension) and adds the hand-written rules: `Assets = Liabilities +
Equity`, both periods present for every figure (ACRA's Misc_006), DEI
completeness, whole-dollar integers, sign, and the FS text block for Full. Each
issue is `genuine` (BizFinx rejects) or `possible` (warning).

## The filing gate

The emitter cannot verify itself against ACRA — that is a portal, not an API:

1. `GET /api/v1/reports/xbrl?fiscalYearEnd=YYYY-MM-DD&format=zip` (or the
   **Download** button on `/reports/xbrl`). A genuine error returns 409 instead of
   a file.
2. Validate at <https://www.bizfinx.gov.sg/ValidateXbrl.aspx> — **no CorpPass
   needed to validate**, only to upload.
3. Fix anything genuine here, rebuild, re-validate.
4. Upload through BizFinx (CorpPass) and file the annual return within 14 days.

Nothing in this repo has been through step 2 yet: the first real filing is the
manual gate, and the rule ids it reports belong in `validate.ts`.

## Bumping the taxonomy

Follow `assets/xbrl/acra-2026/README.md`, then regenerate:
`npx tsx scripts/gen-xbrl-taxonomy.ts`. A version bump that presents a new
concept fails `tests/sg-xbrl.test.ts` until the concept is mapped, marked
`manual`, or listed absent with a reason — that is the point of the count
assertions.

## What is deliberately not emitted

Simplified XBRL only asks for the statement of financial position, the income
statement by nature, and four notes (receivables, payables, revenue, PPE). Full
wants the whole FS as one text block plus the PP&E, intangible and cash-flow
movement schedules; those are `manual` rows today, so a Full filing needs the
accountant to paste the text block rather than trusting us with it.

The SG chart cannot produce some taxonomy concepts at all (leases, derivatives,
provisions, goodwill, deferred tax, NCI). Those rows are `absent` with a reason,
which is honest: an empty element and a zero element mean different things in a
filing.
