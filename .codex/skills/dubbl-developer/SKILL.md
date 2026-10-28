---
name: dubbl-developer
description: Implement features and fixes in the Dubbl Next.js accounting repository, including dashboard UI, REST APIs, org-scoped MCP tools, Drizzle migrations, and accounting logic. Use for development work in Dubbl; use dubbl-qa for a standalone QA review.
---

# Dubbl developer

Read the repository's `AGENTS.md` and inspect the current diff before changing code. Preserve unrelated work. Resolve paths below from the repository root. This skill supports implementation; it does not authorize deployment, sending customer emails, or applying migrations to a live database.

## Find the complete feature path

Dubbl uses Next.js App Router, React, TypeScript, PostgreSQL with Drizzle, and pnpm. Use the existing `@/` import alias and local component patterns.

- Dashboard routes live in `app/(dashboard)/`; shared application components live in `components/dashboard/`, with primitives in `components/ui/`.
- REST routes live in `app/api/v1/`. Business logic and shared services generally live in `lib/api/`. Inspect the nearest analogous operation before adding a new abstraction.
- Schema definitions live in `lib/db/schema/`, exported through its index; generated migrations and snapshots live in `drizzle/`.
- MCP tools live in `lib/mcp/tools/`, registered through `lib/mcp/tools/index.ts`.
- Documents and email renderers live in `lib/documents/` and `lib/email/`. A feature that changes customer-facing output may have separate rendering, preview, send, resend, and public download paths. Trace the applicable callers.

For a user-facing operation, implement the UI, REST, and corresponding MCP behavior together. Reuse shared business logic so permissions, validation, accounting effects, and responses remain consistent across entry points.

## Authentication and data access

For organization REST routes, use `getAuthContext()` from `lib/api/auth-context.ts`; it handles session/API-key authentication and organization membership. Use `requireRole()` with the operation's permission rather than checking only the legacy role: custom permissions and advisor contexts exist.

Scope reads and writes to `ctx.organizationId`, including child-record ownership checks and foreign-key inputs. A valid UUID does not establish ownership. Follow the feature's existing soft-delete behavior using `lib/db/soft-delete.ts` where applicable. Use transactions for dependent writes that must succeed together; preserve existing audit and plan-limit checks.

Public token routes and user-profile routes have different authentication requirements. Keep public exceptions narrow and update `lib/auth.config.ts` when adding an intentionally public endpoint. Do not relax organization authorization to make a UI request work.

## MCP parity

Each user-facing feature needs corresponding MCP tools, kept aligned with REST changes. Use direct Drizzle access or shared services, never HTTP self-calls. Export `registerXTools(server, ctx)`, register it in the tools index, and wrap handlers with `wrapTool()` from `lib/mcp/errors.ts`.

Create one tool per operation. Describe every Zod input field with `.describe()` and state units, supported enum values, optional/null behavior, and returned data in tool descriptions. Apply the same operation permissions and organization scoping as the REST path; `wrapTool()` handles errors, not authorization.

## Accounting and migrations

Follow `AGENTS.md`'s integer-cents contract ($12.50 = 1250). Some existing currency utilities use ISO currency minor units; inspect the actual storage and caller contract before using them. Do not silently change stored units or parse formatted display strings into ledger values. Reuse `lib/money.ts` and the existing currency/accounting services rather than duplicating conversion or rounding logic.

For posting changes, preserve balanced journal entries, currency conversions, and existing period/fiscal-year protections. Inspect `assertNotLocked()` in `lib/api/period-lock.ts` and the relevant posting service before modifying dated accounting records. Keep date-only values separate from timestamps to avoid timezone shifts.

After changing any schema file, run `npx drizzle-kit generate`, inspect the SQL for unrelated or destructive operations, and include the migration and generated metadata with the schema change. Never use `drizzle-kit push` in production. Generation is separate from applying migrations; do not apply migrations or seed data without task authorization.

## UI and localization

Reuse existing loading, error, empty, and navigation patterns. Handle failed requests visibly rather than refreshing as though they succeeded. Check that changes work in narrow layouts and remain keyboard-accessible.

The current i18n foundation uses `next-intl`, `i18n/request.ts`, and catalogs in `messages/`. Supported locales are defined in `lib/i18n/locales.ts`; fallback is `fr-CA` to `fr` to `en`. Use message keys for newly localized copy and preserve ICU placeholders. The language selector is `components/shared/locale-switcher.tsx`.

Localization is incomplete: a saved organization document locale does not itself translate a PDF/email, and many dashboard strings remain literal English. Thread the chosen locale into the actual renderer/formatter when implementing those paths. Translate labels, not user-entered business names, notes, or accounting data.

## Verify and hand off

Never run full builds (`npm run build`, `next build`). Start the Next.js dev server only when explicitly requested. Use `npx tsc --noEmit`, relevant ESLint checks or `npm run lint`, and `git diff --check`. Run the relevant `node --import tsx --test tests/<file>.test.ts` tests or `npm test` when business behavior changes. Add regression coverage for meaningful defects, especially authorization and accounting boundaries.

Report the resulting behavior, checks actually performed, and any remaining integration gaps. Do not claim browser validation, applied migrations, or complete translations based only on static checks. Commit or push only within the user's requested workflow.
