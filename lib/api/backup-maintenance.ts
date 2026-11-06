import { db } from "@/lib/db";
import { dataBackup } from "@/lib/db/schema";
import { subscription } from "@/lib/db/schema";
import { organization } from "@/lib/db/schema";
import { eq, lt, and, gte, inArray, isNull } from "drizzle-orm";
import { createOrgSnapshot } from "./backup-snapshot";
import { deleteBackupObject } from "./backup-storage";
import { getEffectiveLimits } from "@/lib/plans";
import { isSelfHostedUnlimited } from "@/lib/site-settings";
import { notifySafely, notifySystemAlert } from "@/lib/notifications/events";

const SCHEDULED_BACKUP_INTERVAL_MS = 23 * 60 * 60 * 1000;

export async function processBackupMaintenance() {
  // Get all orgs with their subscriptions via a join
  const orgs = await db
    .select({
      orgId: organization.id,
      sub: subscription,
    })
    .from(organization)
    .leftJoin(subscription, eq(subscription.organizationId, organization.id));

  let created = 0;
  let skipped = 0;
  let purged = 0;

  for (const org of orgs) {
    try {
      const recentCutoff = new Date(Date.now() - SCHEDULED_BACKUP_INTERVAL_MS);
      const recentScheduledBackup = await db.query.dataBackup.findFirst({
        where: and(
          eq(dataBackup.organizationId, org.orgId),
          eq(dataBackup.type, "scheduled"),
          inArray(dataBackup.status, ["pending", "completed"]),
          gte(dataBackup.createdAt, recentCutoff),
          isNull(dataBackup.deletedAt),
        ),
      });

      if (recentScheduledBackup) {
        skipped++;
        continue;
      }

      const retentionDays = getEffectiveLimits(org.sub, await isSelfHostedUnlimited()).backupRetentionDays;

      const backup = await createOrgSnapshot(org.orgId, null, "scheduled");

      // Set expiry
      if (Number.isFinite(retentionDays)) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + retentionDays);
        await db
          .update(dataBackup)
          .set({ expiresAt })
          .where(eq(dataBackup.id, backup.id));
      }

      created++;
    } catch (err) {
      console.error(`Backup failed for org ${org.orgId}:`, err);
      await notifySafely(
        notifySystemAlert(org.orgId, {
          title: "Scheduled backup failed",
          body: "Today's automatic backup didn't complete. Open Settings > Backups to make one by hand.",
        })
      );
    }
  }

  // Purge expired backups
  const expired = await db.query.dataBackup.findMany({
    where: and(
      lt(dataBackup.expiresAt, new Date()),
    ),
  });

  for (const backup of expired) {
    try {
      if (backup.fileKey) {
        await deleteBackupObject(backup.fileKey);
      }
      await db.delete(dataBackup).where(eq(dataBackup.id, backup.id));
      purged++;
    } catch (err) {
      console.error(`Purge failed for backup ${backup.id}:`, err);
    }
  }

  return { created, skipped, purged };
}
