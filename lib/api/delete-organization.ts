import Stripe from "stripe";
import { db } from "@/lib/db";
import {
  organization,
  subscription,
  document,
  attachment,
  dataBackup,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { deleteObject } from "@/lib/s3";

/**
 * Permanently delete an organization and everything in it. A paid Stripe
 * subscription is cancelled first so the card stops being charged, and stored
 * files (documents, attachments, backups) are removed from storage afterwards,
 * best effort.
 *
 * Rows go table by table rather than through one cascading delete of the
 * organization: lines that cascade from one record but also point at another
 * (a journal line's account, say) make Postgres reject the single cascade.
 * Each pass deletes every org-scoped table it can; a table still referenced by
 * rows that aren't gone yet is retried on the next pass.
 */
export async function deleteOrganization(organizationId: string) {
  const sub = await db.query.subscription.findFirst({
    where: eq(subscription.organizationId, organizationId),
  });
  if (sub?.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    try {
      await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    } catch {
      // Already cancelled in Stripe
    }
  }

  const [docs, files, backups] = await Promise.all([
    db.select({ key: document.fileKey }).from(document).where(eq(document.organizationId, organizationId)),
    db.select({ key: attachment.fileKey }).from(attachment).where(eq(attachment.organizationId, organizationId)),
    db.select({ key: dataBackup.fileKey }).from(dataBackup).where(eq(dataBackup.organizationId, organizationId)),
  ]);

  await db.transaction(async (tx) => {
    const tables = await tx.execute<{ table_name: string }>(sql`
      select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and c.column_name = 'organization_id'
        and t.table_type = 'BASE TABLE' and c.table_name <> 'organization'
    `);
    let remaining = tables.rows.map((r) => r.table_name);
    while (remaining.length > 0) {
      const blocked: string[] = [];
      for (const table of remaining) {
        try {
          await tx.transaction(async (sp) => {
            await sp.execute(sql`delete from ${sql.identifier(table)} where organization_id = ${organizationId}`);
          });
        } catch {
          blocked.push(table);
        }
      }
      if (blocked.length === remaining.length) {
        throw new Error(`Couldn't delete the organization's data (${blocked.join(", ")})`);
      }
      remaining = blocked;
    }
    await tx.delete(organization).where(eq(organization.id, organizationId));
  });

  const keys = [...docs, ...files, ...backups].map((r) => r.key).filter((k): k is string => !!k);
  await Promise.allSettled(keys.map((key) => deleteObject(key)));
}
