---
name: dubbl-qa
description: "Verify changes to the Dubbl Next.js accounting application, including API, database, MCP, and accounting-domain changes. Use when asked to test, QA, or review an implementation in this repository."
---

# Dubbl Qa

Assess the change first, then run the smallest relevant verification set. Report what was checked, any failures, and pre-existing warnings separately. Do not run a Next.js production build or start the dev server unless the user explicitly asks.

## Baseline verification

- Run `npx tsc --noEmit` for TypeScript changes.
- Run `npm run lint`; existing warnings may be reported, but new errors or warnings introduced by the change must be fixed or called out.
- Run `npm test` when changing business logic covered by `tests/`, or add a focused regression test when a defect is fixed.
- Use `git diff --check` before handoff.

## Change-specific checks

- For database schema changes, confirm a matching migration exists under `drizzle/`, generated with `npx drizzle-kit generate`. Inspect the migration for the intended table/column operations; never use `drizzle-kit push`.
- For REST API changes, validate authentication, organization scoping, input validation, error status, and response shape using the surrounding route conventions.
- For an MCP user-facing capability, verify there is a matching direct-Drizzle MCP tool in `lib/mcp/tools/`, registered in `lib/mcp/tools/index.ts`, wrapped with `wrapTool()`, scoped through `AuthContext`, and documented with `.describe()` on every Zod input field. Monetary values must remain integer cents.
- For accounting, tax, currency, or payment behavior, check integer minor-unit handling, balanced journal entries where applicable, organization isolation, and boundary cases such as zero, negative, and non-2-decimal currencies.
- For UI changes, inspect empty/loading/error states and keyboard/accessibility affordances in the changed component. Do not claim browser testing unless it actually occurred.

Do not modify unrelated files merely to clear existing lint warnings. Keep QA proportional: explain skipped checks when they would need unavailable credentials, a running service, or user authorization.
