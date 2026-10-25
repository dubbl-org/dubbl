# ACRA taxonomy 2026, vendored

The filing taxonomy the XBRL emitter reads. Committed so a filing is built from
the same bytes that were reviewed, with no network fetch at emit time.

- Package: **ACRA Taxonomy 2026 v1.0** (`ACRA Taxonomy 2026 v1.0`, taxonomy date `2026-01-01`)
- Downloaded: 2026-10-25 from `https://go.gov.sg/acrataxonomyzip` (SHA-256 of the
  original zip: see `SHA256SUMS`, first line)
- Used by: `scripts/gen-xbrl-taxonomy.ts` -> `lib/reports/xbrl/taxonomy.generated.ts`

## What is here

| Directory | Why |
|---|---|
| `fr/sg-sim`, `fr/sg-sfrs` | Presentation, calculation, definition, label and role definitions for the two filing templates |
| `elts/` | Element declarations (name, type, balance, period type) and the `sg-ee-sfrs` framework |
| `labels/` | Human labels, read by the generator |
| `references/` | Accounting-standard references; the element schemas reference them, so they travel with the package |
| `META-INF/` | Package descriptor and catalog, as published |

## What is not, and why

- `formula/` — ACRA's own validation formulas. We re-implement the arithmetic
  from the calculation linkbases (`lib/reports/xbrl/validate.ts`); shipping
  them would add ~0.7 MB to every upload for no benefit.
- `TagObjects/` — empty in the published package.

Nothing the emitted instance or its linkbases reference was dropped: the
extension schema imports `elts/`, `fr/<framework>/` and the label linkbase, and
`package.ts` zips exactly those directories.

## Bumping the version

1. Unpack the new package here, keeping the same directory names.
2. `npx tsx scripts/gen-xbrl-taxonomy.ts` — rewrites the generated table, and
   records the source hashes in its header.
3. `npx tsc --noEmit && pnpm test` — the mapping test lists every concept the new
   taxonomy presents that has no mapping row.
4. Refresh `SHA256SUMS`.
5. Emit a fixture and run it through <https://www.bizfinx.gov.sg/ValidateXbrl.aspx>
   (no CorpPass needed) before the first live filing.
