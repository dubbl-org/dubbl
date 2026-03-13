import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  organization,
  subscription,
  journalEntry,
  contact,
  invoice,
  bankAccount,
  project,
  document,
  attachment,
  member,
} from "@/lib/db/schema";
import { eq, sql, desc, isNull } from "drizzle-orm";
import { handleError } from "@/lib/api/response";
import { requireSiteAdmin } from "@/lib/api/require-site-admin";

export async function GET(request: Request) {
  try {
    const result = await requireSiteAdmin();
    if (result instanceof NextResponse) return result;

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "25"), 100);

    // Top orgs by file storage
    const topByStorage = await db
      .select({
        organizationId: document.organizationId,
        orgName: organization.name,
        totalBytes: sql<number>`coalesce(sum(${document.fileSize}), 0)`,
        fileCount: sql<number>`count(*)`,
      })
      .from(document)
      .innerJoin(organization, eq(organization.id, document.organizationId))
      .where(isNull(document.deletedAt))
      .groupBy(document.organizationId, organization.name)
      .orderBy(desc(sql`sum(${document.fileSize})`))
      .limit(limit);

    // Top orgs by journal entries (total)
    const topByEntries = await db
      .select({
        organizationId: journalEntry.organizationId,
        orgName: organization.name,
        entryCount: sql<number>`count(*)`,
      })
      .from(journalEntry)
      .innerJoin(organization, eq(organization.id, journalEntry.organizationId))
      .where(isNull(journalEntry.deletedAt))
      .groupBy(journalEntry.organizationId, organization.name)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    // Top orgs by contacts
    const topByContacts = await db
      .select({
        organizationId: contact.organizationId,
        orgName: organization.name,
        contactCount: sql<number>`count(*)`,
      })
      .from(contact)
      .innerJoin(organization, eq(organization.id, contact.organizationId))
      .where(isNull(contact.deletedAt))
      .groupBy(contact.organizationId, organization.name)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    // Top orgs by members
    const topByMembers = await db
      .select({
        organizationId: member.organizationId,
        orgName: organization.name,
        memberCount: sql<number>`count(*)`,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .groupBy(member.organizationId, organization.name)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    // Per-org summary for the top orgs (union of all top lists)
    const topOrgIds = new Set([
      ...topByStorage.map((r) => r.organizationId),
      ...topByEntries.map((r) => r.organizationId),
      ...topByContacts.map((r) => r.organizationId),
      ...topByMembers.map((r) => r.organizationId),
    ]);

    const orgDetails: Record<string, {
      plan: string;
      storagePlan: string;
      status: string;
      managedBy: string;
    }> = {};

    if (topOrgIds.size > 0) {
      const subs = await db.query.subscription.findMany({
        where: sql`${subscription.organizationId} IN ${[...topOrgIds]}`,
      });
      for (const s of subs) {
        orgDetails[s.organizationId] = {
          plan: s.plan,
          storagePlan: s.storagePlan,
          status: s.status,
          managedBy: s.managedBy,
        };
      }
    }

    // Global totals
    const [totalEntries] = await db
      .select({ count: sql<number>`count(*)` })
      .from(journalEntry)
      .where(isNull(journalEntry.deletedAt));

    const [totalInvoices] = await db
      .select({ count: sql<number>`count(*)` })
      .from(invoice)
      .where(isNull(invoice.deletedAt));

    const [totalContacts] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contact)
      .where(isNull(contact.deletedAt));

    const [totalStorage] = await db
      .select({ totalBytes: sql<number>`coalesce(sum(${document.fileSize}), 0)` })
      .from(document)
      .where(isNull(document.deletedAt));

    const [totalAttachmentStorage] = await db
      .select({ totalBytes: sql<number>`coalesce(sum(${attachment.fileSize}), 0)` })
      .from(attachment);

    return NextResponse.json({
      globalTotals: {
        entries: Number(totalEntries.count),
        invoices: Number(totalInvoices.count),
        contacts: Number(totalContacts.count),
        fileStorageBytes: Number(totalStorage.totalBytes) + Number(totalAttachmentStorage.totalBytes),
      },
      topByStorage: topByStorage.map((r) => ({
        ...r,
        totalBytes: Number(r.totalBytes),
        fileCount: Number(r.fileCount),
        ...orgDetails[r.organizationId],
      })),
      topByEntries: topByEntries.map((r) => ({
        ...r,
        entryCount: Number(r.entryCount),
        ...orgDetails[r.organizationId],
      })),
      topByContacts: topByContacts.map((r) => ({
        ...r,
        contactCount: Number(r.contactCount),
        ...orgDetails[r.organizationId],
      })),
      topByMembers: topByMembers.map((r) => ({
        ...r,
        memberCount: Number(r.memberCount),
        ...orgDetails[r.organizationId],
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
