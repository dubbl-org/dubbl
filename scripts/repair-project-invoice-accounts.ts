/**
 * One-off repair for project invoices created before project invoice lines
 * got an income account.
 *
 * The old project invoicing routes (/projects/:id/invoice and
 * /projects/:id/progress-invoice) inserted invoice lines with no account. When
 * such an invoice was sent, its journal entry credited no income and debited
 * no receivable (usually an empty posted entry), so a later payment pushed
 * Accounts Receivable negative and the income never reached the books.
 *
 * For every invoice line that has a project, no account and a non-zero amount:
 * - The income account is the client's default income account, else the
 *   organization's Sales account (4000, created if missing).
 * - Draft invoices: the lines get the account. Nothing else changes.
 * - Void invoices: left alone (nothing they post counts).
 * - Sent, partly paid, paid or overdue invoices whose issue date is open:
 *   in one transaction the lines get the account, the old entry is retired
 *   (an empty entry is marked void; one with lines gets a reversing entry),
 *   a new balanced entry is posted the same way sending does, and the invoice
 *   points at it. Voiding the invoice later reverses the new entry.
 * - Invoices dated on or before the lock date, or in a closed fiscal year, are
 *   skipped and listed. Unlock the period, run again, then lock it again.
 * - An invoice that can't be reposted (for example no exchange rate for its
 *   currency) is rolled back and listed.
 *
 * Dry run by default; nothing is written. Run it against the database in
 * DATABASE_URL:
 *   pnpm tsx --env-file=.env scripts/repair-project-invoice-accounts.ts            (dry run)
 *   pnpm tsx --env-file=.env scripts/repair-project-invoice-accounts.ts --apply    (write)
 *   add --org <organizationId> to limit it to one organization.
 * Safe to run more than once: repaired lines have an account and are not
 * picked up again.
 */
import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { chartAccount, invoice, invoiceLine, journalEntry, journalLine } from "@/lib/db/schema";
import { ensureAccountForCode } from "@/lib/api/account-roles";
import { getBaseCurrency } from "@/lib/api/payment-bank-account";
import { assertNotLocked } from "@/lib/api/period-lock";
import { createInvoiceJournalEntry, getNextEntryNumber } from "@/lib/api/journal-automation";
import { projectInvoiceRevenueAccount } from "@/lib/projects/rules";

const SALES_ACCOUNT = { code: "4000", name: "Sales Revenue", type: "revenue" as const, subType: "operating" };
const POSTED_STATUSES = new Set(["sent", "partial", "paid", "overdue"]);

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const orgIdx = args.indexOf("--org");
const onlyOrg = orgIdx >= 0 ? args[orgIdx + 1] : undefined;

type Outcome = { invoiceNumber: string; organizationId: string; result: string };

async function revenueAccountFor(organizationId: string, contactId: string): Promise<string | null> {
  const c = await db.query.contact.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.id, contactId), e(t.organizationId, organizationId)),
    columns: { defaultRevenueAccountId: true },
  });
  let contactAccount: string | null = null;
  if (c?.defaultRevenueAccountId) {
    const acct = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.id, c.defaultRevenueAccountId),
        eq(chartAccount.organizationId, organizationId),
        isNull(chartAccount.deletedAt)
      ),
      columns: { id: true },
    });
    contactAccount = acct?.id ?? null;
  }
  if (contactAccount) return contactAccount;
  if (!apply) return "(Sales 4000)";
  const sales = await ensureAccountForCode(organizationId, SALES_ACCOUNT, await getBaseCurrency(organizationId));
  return projectInvoiceRevenueAccount(null, sales?.id);
}

async function main() {
  const broken = await db
    .selectDistinct({ invoiceId: invoiceLine.invoiceId })
    .from(invoiceLine)
    .innerJoin(invoice, eq(invoice.id, invoiceLine.invoiceId))
    .where(
      and(
        isNull(invoiceLine.accountId),
        ne(invoiceLine.amount, 0),
        isNull(invoice.deletedAt),
        isNotNull(invoiceLine.projectId),
        onlyOrg ? eq(invoice.organizationId, onlyOrg) : undefined
      )
    );

  const outcomes: Outcome[] = [];
  for (const { invoiceId } of broken) {
    const inv = await db.query.invoice.findFirst({ where: eq(invoice.id, invoiceId), with: { lines: true } });
    if (!inv) continue;
    const missing = inv.lines.filter((l) => l.projectId && !l.accountId && l.amount !== 0);
    if (missing.length === 0) continue;
    const base = { invoiceNumber: inv.invoiceNumber, organizationId: inv.organizationId };

    if (inv.status === "void") {
      outcomes.push({ ...base, result: "skipped: void" });
      continue;
    }
    const isPosted = POSTED_STATUSES.has(inv.status) || !!inv.journalEntryId;
    if (isPosted) {
      try {
        await assertNotLocked(inv.organizationId, inv.issueDate);
      } catch (err) {
        outcomes.push({ ...base, result: `skipped: locked period (${(err as Error).message})` });
        continue;
      }
    }

    const accountId = await revenueAccountFor(inv.organizationId, inv.contactId);
    if (!accountId) {
      outcomes.push({ ...base, result: "skipped: no income account could be found or created" });
      continue;
    }
    const plan = `${missing.length} line(s) -> ${accountId}${isPosted ? ", repost entry" : ""}`;
    if (!apply) {
      outcomes.push({ ...base, result: `would fix (${inv.status}): ${plan}` });
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(invoiceLine)
          .set({ accountId })
          .where(and(eq(invoiceLine.invoiceId, inv.id), inArray(invoiceLine.id, missing.map((l) => l.id))));
        if (!isPosted) return;

        const ctx = { organizationId: inv.organizationId, userId: inv.createdBy ?? "" };
        if (inv.journalEntryId) {
          const old = await tx.query.journalEntry.findFirst({ where: eq(journalEntry.id, inv.journalEntryId) });
          const oldLines = await tx.query.journalLine.findMany({ where: eq(journalLine.journalEntryId, inv.journalEntryId) });
          if (old && oldLines.length === 0) {
            await tx
              .update(journalEntry)
              .set({ status: "void", voidedAt: new Date(), voidReason: "Replaced: invoice lines had no income account", updatedAt: new Date() })
              .where(eq(journalEntry.id, old.id));
          } else if (old && old.status === "posted" && !old.reversedByEntryId) {
            const entryNumber = await getNextEntryNumber(inv.organizationId, tx);
            const [reversal] = await tx
              .insert(journalEntry)
              .values({
                organizationId: inv.organizationId,
                entryNumber,
                date: inv.issueDate,
                description: `Repost invoice ${inv.invoiceNumber} (reverse entry with missing income account)`,
                reference: inv.invoiceNumber,
                status: "posted",
                sourceType: "invoice_repair",
                sourceId: inv.id,
                reversesEntryId: old.id,
                postedAt: new Date(),
                createdBy: inv.createdBy,
              })
              .returning();
            await tx.insert(journalLine).values(
              oldLines.map((l) => ({
                journalEntryId: reversal.id,
                accountId: l.accountId,
                description: reversal.description,
                debitAmount: l.creditAmount,
                creditAmount: l.debitAmount,
                currencyCode: l.currencyCode,
                exchangeRate: l.exchangeRate,
                costCenterId: l.costCenterId,
                projectId: l.projectId,
              }))
            );
            await tx.update(journalEntry).set({ reversedByEntryId: reversal.id, updatedAt: new Date() }).where(eq(journalEntry.id, old.id));
          }
        }

        const lines = await tx.query.invoiceLine.findMany({ where: eq(invoiceLine.invoiceId, inv.id) });
        const entry = await createInvoiceJournalEntry(
          ctx,
          {
            invoiceNumber: inv.invoiceNumber,
            total: inv.total,
            taxTotal: inv.taxTotal,
            subtotal: inv.subtotal,
            lines: lines.map((l) => ({ accountId: l.accountId, amount: l.amount, taxAmount: l.taxAmount, taxRateId: l.taxRateId })),
            date: inv.issueDate,
            currencyCode: inv.currencyCode,
          },
          tx
        );
        if (!entry) throw new Error("No Accounts Receivable account to post to");
        const posted = await tx.query.journalLine.findMany({ where: eq(journalLine.journalEntryId, entry.id) });
        const dr = posted.reduce((s, l) => s + l.debitAmount, 0);
        const cr = posted.reduce((s, l) => s + l.creditAmount, 0);
        if (posted.length === 0 || dr !== cr) throw new Error(`New entry isn't balanced (debits ${dr}, credits ${cr})`);
        await tx.update(invoice).set({ journalEntryId: entry.id, updatedAt: new Date() }).where(eq(invoice.id, inv.id));
      });
      outcomes.push({ ...base, result: `fixed (${inv.status}): ${plan}` });
    } catch (err) {
      outcomes.push({ ...base, result: `failed, rolled back: ${(err as Error).message}` });
    }
  }

  console.log(apply ? "Repair (applied)" : "Repair (dry run, nothing written; add --apply to write)");
  if (outcomes.length === 0) console.log("No project invoice lines without an income account.");
  for (const o of outcomes) console.log(`${o.organizationId} ${o.invoiceNumber}: ${o.result}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
