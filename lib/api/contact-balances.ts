import { db } from "@/lib/db";
import { contact, invoice, bill, payment, paymentAllocation, customerCredit, portalAccessToken } from "@/lib/db/schema";
import { and, asc, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";

export type BalanceSide = "customer" | "supplier";

/**
 * One customer's receivables or one supplier's payables, aggregated in SQL.
 * Every amount is integer cents. Deliberately carries no tax identifiers or
 * bank details so it is safe to list and export.
 */
export interface ContactBalance {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: "customer" | "supplier" | "both";
  currencyCode: string | null;
  paymentTermsDays: number | null;
  creditLimit: number | null;
  is1099Vendor: boolean;
  createdAt: Date;
  /** Unpaid amount on open invoices (customer) or bills (supplier). */
  outstanding: number;
  /** The part of `outstanding` that is past its due date. */
  overdue: number;
  openCount: number;
  overdueCount: number;
  /** Due date of the oldest open document that is past due (YYYY-MM-DD). */
  oldestOverdueDate: string | null;
  /** Ageing of `outstanding` by days past due. */
  aging: { current: number; d1to30: number; d31to60: number; d61to90: number; over90: number };
  /** Issue date of the latest invoice/bill (YYYY-MM-DD). */
  lastDocumentDate: string | null;
  /** Total of invoices/bills issued since 1 January this year. */
  totalThisYear: number;
  /** Total of invoices/bills issued last calendar year. */
  totalLastYear: number;
  /** Date of the latest payment received (customer) or made (supplier). */
  lastPaymentDate: string | null;
  /** How many documents were fully paid, and their average days from issue to payment. */
  paidCount: number;
  avgDaysToPay: number | null;
  /** Customers only: unapplied prepayments/overpayments held on account. */
  unappliedCredit: number;
  /** Customers only: whether a live customer-portal link exists. */
  hasPortalAccess: boolean;
}

const OPEN_INVOICE = ["sent", "partial", "overdue"] as const;
const OPEN_BILL = ["received", "partial", "overdue"] as const;
const NOT_ISSUED_INVOICE = ["draft", "void", "pending_approval", "rejected"];
const NOT_ISSUED_BILL = ["draft", "void", "pending_approval"];

function sideTypes(side: BalanceSide) {
  return side === "customer" ? (["customer", "both"] as const) : (["supplier", "both"] as const);
}

/** Has at least one open document with money still owed. */
function hasOpenBalance(side: BalanceSide): SQL {
  return side === "customer"
    ? sql`exists (select 1 from ${invoice} where ${invoice.contactId} = ${contact.id} and ${invoice.deletedAt} is null and ${inArray(invoice.status, [...OPEN_INVOICE])} and ${invoice.amountDue} > 0)`
    : sql`exists (select 1 from ${bill} where ${bill.contactId} = ${contact.id} and ${bill.deletedAt} is null and ${inArray(bill.status, [...OPEN_BILL])} and ${bill.amountDue} > 0)`;
}

export async function listContactBalances(
  organizationId: string,
  side: BalanceSide,
  opts: { search?: string | null; openOnly?: boolean; limit: number; offset: number }
): Promise<{ rows: ContactBalance[]; total: number }> {
  const conditions: SQL[] = [
    eq(contact.organizationId, organizationId),
    notDeleted(contact.deletedAt),
    inArray(contact.type, [...sideTypes(side)]),
  ];
  if (opts.search) {
    conditions.push(or(ilike(contact.name, `%${opts.search}%`), ilike(contact.email, `%${opts.search}%`))!);
  }
  if (opts.openOnly) conditions.push(hasOpenBalance(side));

  const [contacts, [countRow]] = await Promise.all([
    db
      .select({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        type: contact.type,
        currencyCode: contact.currencyCode,
        paymentTermsDays: contact.paymentTermsDays,
        creditLimit: contact.creditLimit,
        is1099Vendor: contact.is1099Vendor,
        createdAt: contact.createdAt,
      })
      .from(contact)
      .where(and(...conditions))
      .orderBy(asc(contact.name))
      .limit(opts.limit)
      .offset(opts.offset),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(contact)
      .where(and(...conditions)),
  ]);

  const ids = contacts.map((c) => c.id);
  if (ids.length === 0) return { rows: [], total: Number(countRow?.count ?? 0) };

  // invoice and bill share every column used below (contactId, amountDue,
  // dueDate, issueDate, total, status, paidAt), so one query shape serves both.
  const doc = (side === "customer" ? invoice : bill) as unknown as typeof invoice;
  const open = side === "customer" ? inArray(invoice.status, [...OPEN_INVOICE]) : inArray(bill.status, [...OPEN_BILL]);
  const notIssued = side === "customer" ? NOT_ISSUED_INVOICE : NOT_ISSUED_BILL;
  const issued = sql`${doc.status} not in (${sql.join(notIssued.map((s) => sql`${s}`), sql`, `)})`;
  const late = sql`(current_date - ${doc.dueDate})`;
  // Overpaid documents can carry a negative amountDue; that is credit, not debt.
  const due = sql`greatest(${doc.amountDue}, 0)`;
  // When a document was fully paid: paidAt, else the latest payment allocated to it.
  const paidOn = sql`coalesce(${doc.paidAt}::date, (select max(${payment.date}) from ${paymentAllocation} join ${payment} on ${payment.id} = ${paymentAllocation.paymentId} where ${paymentAllocation.documentId} = ${doc.id} and ${paymentAllocation.documentType} = ${side === "customer" ? "invoice" : "bill"} and ${payment.deletedAt} is null))`;

  const [docRows, payRows, creditRows, portalRows] = await Promise.all([
    db
      .select({
        contactId: doc.contactId,
        outstanding: sql<number>`coalesce(sum(${due}) filter (where ${open}), 0)::bigint`.mapWith(Number),
        overdue: sql<number>`coalesce(sum(${due}) filter (where ${open} and ${doc.dueDate} < current_date), 0)::bigint`.mapWith(Number),
        openCount: sql<number>`count(*) filter (where ${open} and ${doc.amountDue} > 0)`.mapWith(Number),
        overdueCount: sql<number>`count(*) filter (where ${open} and ${doc.amountDue} > 0 and ${doc.dueDate} < current_date)`.mapWith(Number),
        oldestOverdueDate: sql<string | null>`min(${doc.dueDate}) filter (where ${open} and ${doc.amountDue} > 0 and ${doc.dueDate} < current_date)`,
        current: sql<number>`coalesce(sum(${due}) filter (where ${open} and ${late} <= 0), 0)::bigint`.mapWith(Number),
        d1to30: sql<number>`coalesce(sum(${due}) filter (where ${open} and ${late} between 1 and 30), 0)::bigint`.mapWith(Number),
        d31to60: sql<number>`coalesce(sum(${due}) filter (where ${open} and ${late} between 31 and 60), 0)::bigint`.mapWith(Number),
        d61to90: sql<number>`coalesce(sum(${due}) filter (where ${open} and ${late} between 61 and 90), 0)::bigint`.mapWith(Number),
        over90: sql<number>`coalesce(sum(${due}) filter (where ${open} and ${late} > 90), 0)::bigint`.mapWith(Number),
        lastDocumentDate: sql<string | null>`max(${doc.issueDate}) filter (where ${issued})`,
        totalThisYear: sql<number>`coalesce(sum(${doc.total}) filter (where ${issued} and ${doc.issueDate} >= date_trunc('year', current_date)::date), 0)::bigint`.mapWith(Number),
        totalLastYear: sql<number>`coalesce(sum(${doc.total}) filter (where ${issued} and ${doc.issueDate} >= (date_trunc('year', current_date) - interval '1 year')::date and ${doc.issueDate} < date_trunc('year', current_date)::date), 0)::bigint`.mapWith(Number),
        paidCount: sql<number>`count(*) filter (where ${doc.status} = 'paid' and ${paidOn} is not null)`.mapWith(Number),
        avgDaysToPay: sql<number | null>`round(avg(greatest(0, ${paidOn} - ${doc.issueDate})) filter (where ${doc.status} = 'paid'))`.mapWith((v) => (v == null ? null : Number(v))),
      })
      .from(doc)
      .where(and(eq(doc.organizationId, organizationId), isNull(doc.deletedAt), inArray(doc.contactId, ids)))
      .groupBy(doc.contactId),
    db
      .select({ contactId: payment.contactId, last: sql<string | null>`max(${payment.date})` })
      .from(payment)
      .where(
        and(
          eq(payment.organizationId, organizationId),
          isNull(payment.deletedAt),
          eq(payment.type, side === "customer" ? "received" : "made"),
          gt(payment.amount, 0),
          inArray(payment.contactId, ids)
        )
      )
      .groupBy(payment.contactId),
    side === "customer"
      ? db
          .select({ contactId: customerCredit.contactId, remaining: sql<number>`coalesce(sum(${customerCredit.amountRemaining}), 0)::bigint`.mapWith(Number) })
          .from(customerCredit)
          .where(
            and(
              eq(customerCredit.organizationId, organizationId),
              isNull(customerCredit.deletedAt),
              eq(customerCredit.status, "open"),
              inArray(customerCredit.contactId, ids)
            )
          )
          .groupBy(customerCredit.contactId)
      : Promise.resolve([] as { contactId: string; remaining: number }[]),
    side === "customer"
      ? db
          .selectDistinct({ contactId: portalAccessToken.contactId })
          .from(portalAccessToken)
          .where(
            and(
              eq(portalAccessToken.organizationId, organizationId),
              isNull(portalAccessToken.revokedAt),
              or(isNull(portalAccessToken.expiresAt), sql`${portalAccessToken.expiresAt} > now()`),
              inArray(portalAccessToken.contactId, ids)
            )
          )
      : Promise.resolve([] as { contactId: string }[]),
  ]);

  const docs = new Map(docRows.map((r) => [r.contactId, r]));
  const pays = new Map(payRows.map((r) => [r.contactId, r.last]));
  const credits = new Map(creditRows.map((r) => [r.contactId, r.remaining]));
  const portal = new Set(portalRows.map((r) => r.contactId));

  const rows: ContactBalance[] = contacts.map((c) => {
    const d = docs.get(c.id);
    return {
      ...c,
      outstanding: d?.outstanding ?? 0,
      overdue: d?.overdue ?? 0,
      openCount: d?.openCount ?? 0,
      overdueCount: d?.overdueCount ?? 0,
      oldestOverdueDate: d?.oldestOverdueDate ?? null,
      aging: {
        current: d?.current ?? 0,
        d1to30: d?.d1to30 ?? 0,
        d31to60: d?.d31to60 ?? 0,
        d61to90: d?.d61to90 ?? 0,
        over90: d?.over90 ?? 0,
      },
      lastDocumentDate: d?.lastDocumentDate ?? null,
      totalThisYear: d?.totalThisYear ?? 0,
      totalLastYear: d?.totalLastYear ?? 0,
      lastPaymentDate: pays.get(c.id) ?? null,
      paidCount: d?.paidCount ?? 0,
      avgDaysToPay: d?.avgDaysToPay ?? null,
      unappliedCredit: credits.get(c.id) ?? 0,
      hasPortalAccess: portal.has(c.id),
    };
  });

  return { rows, total: Number(countRow?.count ?? 0) };
}
