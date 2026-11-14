# Security review — dubbl

**Date:** 2026-10-23
**Commit reviewed:** `f91a29f` (branch `security/hardening`, the code running in production)
**Scope:** application source in this repository, plus the deployment shape of the hosted instance
**Method:** source reading across 542 API route files, 208 pages, 66 schema modules, middleware/auth configuration, plus targeted verification of every finding listed below. Each finding names the file and line it comes from. Findings already closed by the earlier hardening pass are not repeated.

---

## What this system is, in risk terms

A multi-tenant double-entry accounting system. One deployment serves several organisations; a single compromised account or query bug reaches bank account numbers, payroll, invoices, customer and supplier records, and the full general ledger. There is no data classification lower than "financial records", so tenant-isolation bugs and authentication gaps matter more here than in a typical SaaS CRUD app.

The earlier hardening pass fixed real problems (payroll IDOR, backup restore scoping, Stripe state forgery, upload allowlists, rate limits on login/register/invite). What follows is what it did not cover.

---

## Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 9 |
| Medium | 11 |
| Low | 8 |

**Fix first, in this order:** C-1 (cross-tenant payroll write), H-1 (cross-tenant object read), H-2 (blind-update PATCH routes), H-4 (webhook secret exposure), H-6 (revocation does not revoke), H-7 (2FA bypassed on OAuth).

### Remediation status

| Finding | Status |
|---|---|
| C-1 cross-tenant payroll write | fixed — org + path-contractor scoping, commit `72014b2` |
| H-1 cross-tenant object read (`receipt-url`) | fixed — `isOrgOwnedKey` prefix check before signing, and foreign keys rejected at write time |
| H-2 blind body spread (quotes, debit notes, credit notes) | fixed — explicit zod whitelist + org predicate on the update |
| H-3 checklist / labels / comments | fixed — parent task or project bound on every read and write, mutations scoped by parent |
| H-4 webhook secret exposure | fixed — stripped from REST list/single and MCP list; still returned once at creation |
| H-5 webhook SSRF | fixed — `lib/api/url-guard.ts` (https only, public addresses only, DNS resolved) enforced at create, update, and send; redirects no longer followed; stored response capped |
| H-6 revocation does not revoke | fixed — API-key and MCP token paths fail closed when membership is gone; member removal deletes keys and MCP tokens; refresh refuses removed members |
| H-7 2FA bypassed on OAuth | fixed — OAuth sign-in refused for 2FA accounts, redirected to password + code with an explanatory message |
| H-8 period lock advisory | fixed — `assertNotLocked` added to all eleven GL-writing routes; the batch payment check runs once, before the allocation loop |
| H-9 no edge access control | **blocked** — the available Cloudflare credential is read-only for Access (token creation returns 401). A setup script is prepared; it needs an API token with *Access: Apps and Policies: Edit*. |

---

## Critical

### C-1. Contractor payment processing has no tenant check

**Where:** `app/api/v1/payroll/contractors/[id]/payments/[paymentId]/process/route.ts:19-24`, `:92-102`

```ts
const payment = await db.query.contractorPayment.findFirst({
  where: eq(contractorPayment.id, paymentId),     // no org, no contractor join
});
...
await db.update(contractorPayment)
  .set({ status: "paid", paidAt: new Date(), journalEntryId })   // scoped by id only
  .where(eq(contractorPayment.id, paymentId));
```

The handler then posts a journal entry in the **caller's** organisation (`:53-88`) using the foreign payment's amount.

**Impact:** Any user with `manage:contractors` — a member-level permission — who learns a `contractorPayment.id` from another tenant marks that payment paid, attaches a fabricated journal entry id, and books a phantom subcontractor expense against their own ledger. Tenant B's payroll shows a payment that never happened. The sibling route `payments/[paymentId]/route.ts:28-38` performs the correct check and its comment states the reason; this route omits it.

**Fix:** Resolve the contractor with `eq(contractor.organizationId, ctx.organizationId)` and add `eq(contractorPayment.contractorId, id)` to both the read and the update.

**Status:** fixed — the lookup now joins the contractor and requires both the org match and the path's contractor id, and the update carries the same predicates. Every other payroll sub-resource route already scoped this way; this was the one that was missed.

---

## High

### H-1. Cross-tenant object read through `receipt-url`

**Where:** `app/api/v1/expenses/receipt-url/route.ts:27-50`; key written from client input at `app/api/v1/expenses/route.ts:27,129` and `[id]/route.ts:20,106`

The endpoint proves that *some expense row in my organisation* carries the requested `fileKey`, then signs a download for it. But `receiptFileKey` is a client-supplied field on the expense item — so the attacker supplies the key too:

```ts
receiptFileKey: z.string().nullable().optional(),   // client-controlled
```

**Impact:** POST an expense item with `receiptFileKey = "documents/<victim-org-id>/<timestamp>-invoice.pdf"`, then GET `receipt-url?fileKey=...` returns a presigned URL for the victim's object. Keys are deterministic (`documents/{orgId}/{Date.now()}-{fileName}`, `documents/route.ts:83`), so a known org id, approximate upload time and filename are enough. The in-code comment at `:18-22` claims this is prevented; it is not.

**Fix:** Require `fileKey.startsWith(`documents/${ctx.organizationId}/`)` (and the other legal prefixes) before signing, and stop accepting `receiptFileKey` from the client — derive it from a `document` row the server created.

### H-2. Three document PATCH routes spread the request body into the update

**Where:** `app/api/v1/quotes/[id]/route.ts:65-69`, `app/api/v1/debit-notes/[id]/route.ts:65-69`, `app/api/v1/credit-notes/[id]/route.ts:65-69`

```ts
const body = await request.json();
const [updated] = await db.update(quote)
  .set({ ...body, updatedAt: new Date() })
  .where(eq(quote.id, id));       // no organisationId in the write predicate
```

**Impact:** Any user with `manage:invoices` writes arbitrary columns on a draft: `total`, `billedTotal`, `status: "sent"`, `deletedAt: null` (resurrects a trashed document), `organizationId` (moves the document into another tenant), `createdBy` (forges attribution). The "only drafts can be edited" guard above it is meaningless when the same request sets `status`. The org check is a separate read, so the write itself is unconstrained.

**Fix:** Use an explicit zod `.partial()` whitelist, exactly as `bills/[id]/route.ts:30-46` already does, and add `eq(table.organizationId, ctx.organizationId)` to the `where`.

### H-3. Project checklist, labels and comments are not bound to the project in the path

**Where:** `app/api/v1/projects/[id]/tasks/[taskId]/checklist/route.ts:96-104,124-128`, `projects/[id]/labels/route.ts:79-83`, `projects/[id]/tasks/[taskId]/comments/route.ts:27-31`

```ts
for (const item of parsed.items) {
  await db.update(taskChecklist).set(updates).where(eq(taskChecklist.id, item.id));  // id from body
}
await db.delete(projectLabel).where(eq(projectLabel.id, labelId));                 // id from query
where: eq(taskComment.taskId, taskId),                                             // taskId from path
```

Only the attacker's own project id is verified. The row ids being acted on never are.

**Impact:** Cross-tenant read of any task's comments including author user records, and cross-tenant bulk rewrite or hard delete of checklist items and labels — mass-writable, since `items[]` is an array of attacker-chosen ids.

**Fix:** Add the parent predicate to every one of these statements (`eq(taskChecklist.taskId, taskId)`, `eq(projectLabel.projectId, id)`, and resolve `taskId` under `id` before reading comments).

### H-4. Webhook signing secrets are returned to any authenticated member

**Where:** `app/api/v1/webhooks/route.ts:22-46` (list), `app/api/v1/webhooks/[id]/route.ts:29-37` (single), `lib/mcp/tools/webhooks.ts:54-59` (MCP)

No `requireRole`, no field whitelist: the full row — including `secret` (`lib/db/schema/webhooks.ts:42`) — is serialised to the response.

**Impact:** `X-Dubbl-Signature` is the only integrity control on outbound deliveries. A read-only member, or an API key issued to an integration partner, reads the secret and can forge `payment.received` / `invoice.paid` into the customer's downstream systems. A read-only account gains write authority elsewhere.

**Fix:** Strip `secret` from every read path, render it once at creation only, and require `manage:webhooks` for the single-webhook GET. Encrypt at rest so a database read alone does not yield it.

### H-5. Outbound webhook delivery is an SSRF sink, and the response is stored and readable

**Where:** `lib/webhooks/deliver.ts:42-54`; URL accepted as `z.string().url()` at `app/api/v1/webhooks/route.ts:15`, `subscribe/route.ts:11`, `docs`; tested by `app/api/v1/webhooks/[id]/test/route.ts:16-47`

```ts
const res = await fetch(wh.url, { method: "POST", ... });
const responseBody = await res.text().catch(() => "");
```

**Impact:** `z.string().url()` accepts `http://169.254.169.254/latest/meta-data/iam/security-credentials/`, `http://localhost:3100/api/v1/...`, and any address on the docker network. Trigger a delivery and read the body back from `webhook_delivery.response_body` — a scriptable internal port scanner and response exfiltrator, hitting cloud metadata credentials if the host is a cloud VM. Redirects are followed, so a public URL that 302s to a private address defeats a naive host list. `http://` targets also receive financial payloads in clear text.

**Fix:** Resolve the hostname at send time and reject non-`https`, loopback, private, link-local, CGNAT and metadata ranges — re-validated after each redirect or with `redirect: "manual"`. Do not return or persist raw response bodies.

### H-6. Revocation does not revoke: API keys and MCP tokens survive membership removal

**Where:** `lib/api/auth-context.ts:69-82`; `lib/mcp/auth.ts:24-32`; `app/api/mcp/oauth/token/route.ts:236-273`

```ts
const mem = await db.query.member.findFirst({ ... });
return { userId: key.createdBy, role: (mem?.role ?? "member") as MemberRole, ... };
```

A missing membership is not a denial — it silently degrades to `member`, and `apiKey.expiresAt` is optional, so a removed employee's `dk_` key keeps working permanently. MCP access tokens do the same (`mem?.role ?? token.role`), and the refresh chain issues fresh 30-day tokens indefinitely. Nothing deletes a user's keys or MCP tokens when they are removed from an organisation.

**Impact:** Offboarding does not revoke access. A former employee or contractor retains read/write over the organisation's books for as long as their key exists.

**Fix:** Fail closed when the membership row is gone, in both `getAuthContext`'s API-key path and `resolveToken`/`handleRefreshToken`; delete `api_key`, `mcp_access_token` and `mcp_refresh_token` rows on membership removal.

### H-7. 2FA is bypassed by every OAuth provider

**Where:** `lib/auth.ts:112-131` versus `:99-104`

TOTP is checked only inside the Credentials provider's `authorize`. The OAuth `signIn` callback returns `true` for any existing user without consulting it.

**Impact:** A user who enabled TOTP can be signed in with only their Google account session. The second factor protects nothing for precisely the accounts that opted into it. Combined with H-9 (no MFA requirement anywhere), a phished Google password is full access.

**Fix:** If 2FA is enabled, require a step-up for OAuth sign-ins (dedicated challenge page, or record `mfaVerifiedAt` on the session and gate sensitive routes on it).

### H-8. Period lock is advisory, not an invariant

**Where:** 39 of the 92 routes that write journal entries call `assertNotLocked`. Notably absent: `app/api/v1/opening-balances/route.ts` (takes a client date, posts `status: "posted"` at `:111-115`), `payments/batch/route.ts`, `loans/[id]/post-payment`, `revenue-schedules/[id]/recognize`, `fixed-assets/[id]/depreciate`, `run-depreciation`, `accrual-schedules/[id]/post`, `fiscal-years/[id]/close`, `inventory/[id]/adjust`, `stock-takes/[id]/apply`, `bank-transactions/[id]/split-account`.

`opening-balances` also flips the replaced entry straight to `status: "void"` (`:93-99`) instead of posting a reversal — the exact failure mode that `entries/[id]/void` was written to avoid.

**Impact:** A locked period or closed fiscal year can be changed through a side door. Reported figures for a closed period change with no offsetting entry, so the audit trail and the reported numbers disagree.

**Fix:** Call `assertNotLocked` before every journal-entry insert (add it to the eleven routes above) and route opening-balance replacement through `reverseJournalEntry`.

### H-9. No edge access control and no MFA requirement on an internet-facing financial system

**Where:** deployment state, verified live: the Cloudflare account hosting `dubbl.genbalabs.com` has **zero Access applications, zero identity providers, zero service tokens**. Application side: `lib/auth.ts:94-99` — 2FA is opt-in for everyone, `isSiteAdmin` and org `owner` included.

**Impact:** The only control in front of the ledger is one password. Credential stuffing, a reused password, or a phished session yields bank accounts, payroll, invoices, exports and backups. TOTP exists and is correctly implemented (`lib/auth/totp.ts`), but nothing requires it.

**Fix:** Put a Cloudflare Access application in front of the hostname with an allow policy for named users as the primary gate, and require TOTP for site admins and organisation owners. Both are configuration, not code — this is the highest impact per hour of work in the report.

> Note on the upstream default compose (`docker-compose.prod.yml:4-5,39-40`): it publishes the app on `0.0.0.0:3000` and PostgreSQL on `0.0.0.0:5432`, which would bypass the tunnel entirely. The hosted instance does not use it — `web` binds `127.0.0.1:3100` and Postgres is unpublished. Keep it that way, and consider fixing the upstream file since self-hosters copy it.

---

## Medium

### M-1. Journal entries accept any `accountId`, and entry creation skips its role gate

**Where:** `app/api/v1/entries/route.ts:17,149` and `entries/[id]/route.ts:20,163` (no account ownership check); `entries/route.ts:69` (`getAuthContext` with no `requireRole`, so `create:entries` is not enforced)

**Impact:** A member posts a balanced entry against another tenant's chart account. `accounts/[id]/route.ts:52-70` aggregates `journalLine` by account id without an organisation predicate, so the foreign lines appear in the account owner's ledger and balance. Also, any authenticated member — including a `view:data`-only custom role — can create entries.

**Fix:** Preload referenced accounts with `inArray(chartAccount.id, ids)` + `eq(chartAccount.organizationId, ctx.organizationId)` and reject on mismatch; add `requireRole(ctx, "create:entries")`.

### M-2. Client-supplied exchange rate is accepted unchecked

**Where:** `app/api/v1/entries/route.ts:20,96-104`; `entries/[id]/route.ts:20,132-142` (PUT re-checks only raw debit=credit, not base currency)

**Impact:** A line with `exchangeRate: 999999999` balances while carrying a base-currency value ~1000× reality. FX revaluation and every base-currency report inherit the fabricated rate.

**Fix:** Resolve the rate server-side from `exchange_rate` for `(org, currency→base, date)`, as `bank-transactions/[id]/categorize/route.ts:104` does, and reuse the base-currency balance check in PUT.

### M-3. `payments/batch` posts cash without validating the documents it settles

**Where:** `app/api/v1/payments/batch/route.ts:23,47-51,80-124,149-200`

No status guard (a void or draft invoice can be settled), no over-allocation guard (`amountDue` is clamped to 0 at `:95,119` while the GL amount stays the full total), unknown or foreign `documentId`s are silently skipped while their allocations still reach the payment total, `z.number().positive()` admits fractional cents, and there is no `assertNotLocked`.

**Impact:** `amountPaid + amountDue = total` stops holding; cash is posted with no receivable relief; payments can be dated into a locked period.

**Fix:** Reject missing, foreign, `draft` and `void` documents; reject over-allocation; compute the total from accepted allocations; use integer cents; add the period-lock check.

### M-4. No self-approval enforcement

**Where:** `expenses/[id]/approve/route.ts:20,60-68`, `purchase-requisitions/[id]/approve/route.ts:18-32`, `bills/[id]/approve/route.ts:83`, `payroll/runs/[id]/approve/route.ts:46-70`, `lib/approvals/engine.ts:148`

No handler compares the approver with the submitter; the engine checks "is this member the step approver" but never "is this member the requester".

**Impact:** Segregation of duties is optional. An owner/admin holding both `manage:expenses` and `approve:expenses` submits and approves their own claim, which immediately posts DR Expense / CR Reimbursements Payable.

**Fix:** Return 403 when `submittedBy === ctx.userId` (and `requestedById === memberId` in the engine).

### M-5. Auth-adjacent endpoints are unrated

**Where:** only five call sites use `rateLimit()`. Nothing on `auth/2fa/disable`, `auth/2fa/backup-codes`, `auth/2fa/verify`, `mcp/oauth/register`, `mcp/oauth/token`.

**Impact:** TOTP removal is a single 6-digit secret and can be brute-forced at full speed from any session; unauthenticated `/api/mcp/oauth/register` inserts rows without limit (DB growth, client-id spam); the token endpoint can be probed freely.

**Fix:** Rate-limit each by user or IP, and lock after N failed TOTP attempts.

### M-6. Enabling or disabling 2FA does not revoke existing sessions

**Where:** `auth/2fa/verify/route.ts:55-60`, `auth/2fa/disable/route.ts:45`

**Impact:** A victim who notices a compromise and enables 2FA leaves the attacker's stolen session working for its full 30-day life; the attacker never meets the new factor.

**Fix:** Set `sessionRevokedAt` alongside both writes and rely on the revocation path — after fixing H-6, which currently does not cover all routes.

### M-7. "Sign out all devices" is enforced on only one auth path

**Where:** the `iat` vs `sessionRevokedAt` comparison lives solely in `getAuthContext` (`lib/api/auth-context.ts:90-101`). Eleven route files call `auth()` directly: `require-site-admin.ts:13-19`, `mcp/oauth/consent/route.ts:19-25`, `mcp/oauth/authorize/route.ts:64-66`, `v1/user/profile/route.ts:12-19`, `v1/invitations/accept/route.ts:17-20`, and others.

**Impact:** After a revocation, a stolen session still reaches site-admin APIs, profile writes, invitation acceptance, and — worst — the MCP consent endpoint, which mints a fresh authorization code that converts into a 1-hour access token and a 30-day refresh chain. Revocation does not evict an MCP foothold.

**Fix:** Centralise the check in one `requireSession()` helper used by every route that calls `auth()` directly, and have `revoke-all` also delete MCP tokens and API keys.

### M-8. Stripe OAuth tokens are stored in plaintext, are never used, and are echoed back

**Where:** `lib/db/schema/integrations.ts:27-28`; written at `integrations/stripe/callback/route.ts:89-90`; returned by `integrations/stripe/settings/route.ts:44-50` (`.returning()` — the whole row); copied into `audit_log.changes` at `integrations/stripe/disconnect/route.ts:57-64`.

No code path reads these tokens — every Stripe call authenticates with the platform key plus `stripeAccount`.

**Impact:** A merchant's `read_write` Stripe OAuth token sits in cleartext, is returned to every admin who saves account mappings, and is duplicated permanently into the audit log (readable with `view:audit-log`). Any database read yields charges, refunds, payouts and customer PII on the merchant's live account — for a capability the code never uses.

**Fix:** Delete the columns and stop persisting the tokens; whitelist the response fields in the settings route; allowlist `changes` in the disconnect audit entry.

### M-9. Outbound webhook signature has no timestamp

**Where:** `lib/webhooks/deliver.ts:33-38`, `:155-160` — `HMAC(secret, body)` only.

**Impact:** Anyone who captures one delivery can replay it indefinitely; receivers following the standard verify-then-act pattern cannot tell a replay from a fresh event.

**Fix:** Sign `${timestamp}.${body}` and send `X-Dubbl-Timestamp` with a documented tolerance window.

### M-10. Stored XSS through document templates

**Where:** `lib/documents/pdf-generator.ts:167,196-201,287,360`; served inline at `invoices/[id]/pdf/route.ts:134-137`, `document-templates/[id]/preview/route.ts:107-110`, `portal/[token]/invoices/[id]/pdf/route.ts:142-145`.

`accentColor: z.string()` is interpolated into a `style` attribute; `headerHtml`/`footerHtml` are inserted raw after placeholder substitution, so a hostile `{{contactName}}` value is executable too. Responses are `text/html`, inline, with no CSP.

**Impact:** Script runs on the application origin when a staff member opens a preview — same-origin, session-authenticated. The portal variant delivers the same payload unauthenticated to an external contact.

**Fix:** Sanitise header/footer HTML with an allowlist (or render in a sandboxed iframe), validate `accentColor` as a hex colour, escape substituted values, and serve these responses with `CSP: default-src 'none'` and `nosniff`.

### M-11. Object keys are built from unsanitised file names

**Where:** `app/api/v1/documents/route.ts:83`, `contacts/[id]/files/route.ts:88`, `attachments/presign/route.ts:34`, `lib/mcp/tools/documents.ts:123,252`

```ts
const fileKey = `documents/${ctx.organizationId}/${Date.now()}-${parsed.fileName}`;
```

`fileName: z.string().min(1)` — no length cap, no rejection of `/`, `..`, or control characters. The resulting key is then used verbatim for signing deletes (`attachments/[id]/route.ts:56`, `documents/[id]/route.ts:66`).

**Impact:** A crafted name targets another tenant's object for overwrite, or escapes the org prefix entirely. Whether `..` survives SigV4 canonicalisation and reaches the store needs runtime verification against the configured backend, but the key is stored and re-signed in that form, so it must be treated as exploitable. `Date.now()` also gives no collision resistance.

**Fix:** `path.basename(fileName)` plus a character allowlist and a length cap, a random key segment (nanoid) instead of `Date.now()`, and a `fileKey.startsWith(prefix)` assertion in `deleteObject` / `getDownloadUrl`.

---

## Low

| # | Finding | Where |
|---|---|---|
| L-1 | TOTP secrets stored in plaintext — a database read yields valid codes for every 2FA user | `lib/db/schema/auth.ts:47` |
| L-2 | CSV exports do not neutralise formulas — a contact name beginning `=` or `+` executes in the accountant's spreadsheet | `lib/import-export/csv-utils.ts:12-18` |
| L-3 | Upload size and type are bound from client-declared values with no `HeadObject` verification; quota is computed from the declared size | `lib/s3.ts:43-66`, `attachments/presign/route.ts:14-37` |
| L-4 | No security headers at all (`next.config.ts:4-6` only sets `output`), `X-Powered-By` enabled: no HSTS, CSP, `frame-ancestors`, `nosniff` or `Referrer-Policy`. Token-bearing URLs leak via `Referer` | `next.config.ts` |
| L-5 | Portal / payment-link / signature tokens are stored unhashed; payment links and signatures have no default expiry and no revoke path | `lib/db/schema/invoicing.ts:102,329,338` |
| L-6 | First registrant becomes site admin with no bootstrap control; `registration_mode` defaults to open | `app/api/auth/register/route.ts:83-130`, `lib/site-settings.ts:12-14` |
| L-7 | `POST /sign/[token]` accepts an unbounded, unvalidated string from an unauthenticated token holder, with no rate limit and no expiry by default | `app/api/sign/[token]/route.ts:13-64` |
| L-8 | Entry numbers use `MAX+1` without a row lock — concurrent posts collide on the unique index and abort the transaction; document numbers already use `FOR UPDATE` | `lib/api/journal-automation.ts:283-292` and 13 call sites |

Also worth knowing, low and cheap to close: `sql.raw` interpolates `organizationId` in `lib/api/numbering.ts:44-48` (blocked only by the column being `uuid`); `EMAIL_ENCRYPTION_KEY` is undocumented in `.env.example` and unvalidated in `lib/env.ts`; the dev compose hardcodes `AUTH_SECRET` and makes the MinIO bucket anonymously readable (`docker-compose.yml:20,59-60,81`); `/api/auth/dev-login` publishes seeded admin credentials whenever `NODE_ENV !== "production"`.

---

## What is already done well

Recorded so this report does not overstate risk, and so future changes do not regress them.

- **Real tenant scoping in the majority of the API.** 495 of 507 route files authenticate through `getAuthContext`, which verifies the `x-organization-id` header against an actual membership. The bank-transaction, invoice, bill, contact, inventory, expense, document, backup and portal routes were sampled and are correctly scoped. The findings above are the exceptions, not the pattern.
- **Upload hygiene:** MIME allowlist enforced at all four presign paths, 50 MB cap, active content (`text/html`, `image/svg+xml`, XML) forced to `Content-Disposition: attachment` before the image/PDF allowance, and `ResponseContentDisposition` is a signed, tamper-proof query parameter.
- **Webhook input signatures:** both Stripe handlers verify signatures before any write, and the platform webhook is idempotent through a unique index.
- **OAuth state:** Stripe's state is HMAC-signed with a server-only key and compared in constant time.
- **Cryptography:** SMTP passwords use AES-256-GCM with a fresh IV and a verified auth tag; `rejectUnauthorized: true` keeps certificate validation on. API keys, MCP tokens and MCP auth codes are stored hashed only.
- **Timing:** sign-in and registration both compare against a dummy bcrypt hash, so unknown-email and wrong-password are indistinguishable by timing.
- **Journal integrity:** balance is enforced on create and edit (including base currency); posted entries are immutable; voiding posts a mirror reversal, is idempotent, and refuses a second reversal.
- **Backups:** org-scoped end to end, restore re-checks ownership and guards inserts by `organizationId`, and snapshots deliberately exclude credentials.
- **Error handling:** clients never receive stack traces or SQL; unknown errors become `{ error: "Internal error" }`. `/api/health` leaks nothing. No source maps in the production browser build.
- **No dangerous primitives:** zero `eval`, `new Function`, `vm`, `child_process`. Sort parameters go through column maps; report SQL is parameterised.

---

## Needs runtime verification

These cannot be settled by reading code; test them against the running instance.

1. **Presigned PUT enforcement** — whether the signer actually binds `Content-Length` and `Content-Type` (L-3), and whether `..` in a key reaches the storage backend (M-11).
2. **MCP code/refresh replay** — send the same `code` twice in parallel; confirm only one token pair is issued (finding not listed above because concurrency behaviour is unproven).
3. **Deployed cookie flags** — inspect `Set-Cookie` on a production sign-in for `Secure`; confirm `AUTH_URL` / `AUTH_TRUST_HOST` are set as the deployment expects.
4. **`/api/v1/portal/*` reachability** — the middleware allowlist covers `/api/portal/` but the portal pages call `/api/v1/portal/`; logged-out customers may be bounced on Payments, Quotes and Statements. Fails closed, but it silently breaks a customer-facing feature.

---

## Recommended sequence

1. **This week, code:** C-1, H-1, H-2, H-3, H-4. All are small, local, and each one closes a cross-tenant hole.
2. **This week, configuration:** the Cloudflare Access policy and TOTP requirement for admins (H-9). No code change, largest risk reduction.
3. **Next:** H-5 (SSRF allowlist), H-6 and M-7 (one revocation path), H-7 (2FA step-up for OAuth), M-8 (delete the unused Stripe tokens).
4. **Then:** M-1 to M-6, H-8 (add `assertNotLocked` to the eleven routes), and the Low table — HSTS and CSP, CSV formula neutralisation, token hashing, and the entry-number lock.
5. **Standing:** a database-level backup with off-host storage (the only backup today is application-level JSON in the same bucket, and the nightly task requires `TRIGGER_SECRET_KEY`), and a dependency audit step in CI.

---

## How this was produced and what it did not cover

Six parallel passes over the source — authentication and session, tenant isolation across the API, upload/download/SSRF, secrets and integrations, the data layer, and deployment and information exposure — followed by direct verification of every Critical, High and Medium finding above by reading the cited lines. Claims that could not be verified from source are listed under *Needs runtime verification* rather than asserted.

Not covered: the ~490 non-auth API v1 handlers beyond the sampling described, `lib/mcp/tools/*` beyond their query patterns, the Trigger.dev job bodies, the Cloudflare account configuration beyond confirming that no Access application, identity provider or service token exists, and any live penetration testing. No code was changed as part of this review.
