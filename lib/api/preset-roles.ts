import { db } from "@/lib/db";
import { customRole } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { PRESET_ROLES } from "@/lib/plans";

/**
 * Idempotently seed the built-in preset system roles (Read-only, Advisor,
 * Invoice-only, Standard) for an organization. Safe to call repeatedly — it
 * only inserts roles that are missing and refreshes the permissions of
 * existing preset roles so they stay in sync as the permission set evolves.
 *
 * Matching is done by name (case-sensitive) among the org's system roles so
 * we never duplicate a preset that already exists.
 *
 * Accepts an optional executor (a Drizzle transaction) so callers can seed
 * presets atomically alongside organization creation.
 */
export async function seedPresetRoles(
  organizationId: string,
  exec: Pick<typeof db, "query" | "insert" | "update"> = db
): Promise<void> {
  const existing = await exec.query.customRole.findMany({
    where: and(
      eq(customRole.organizationId, organizationId),
      eq(customRole.isSystem, true)
    ),
  });
  const byName = new Map(existing.map((r) => [r.name, r]));

  for (const preset of PRESET_ROLES) {
    const current = byName.get(preset.name);
    if (!current) {
      await exec.insert(customRole).values({
        organizationId,
        name: preset.name,
        description: preset.description,
        permissions: preset.permissions,
        isSystem: true,
      });
    } else if (
      JSON.stringify(current.permissions ?? []) !==
      JSON.stringify(preset.permissions)
    ) {
      // Keep the preset's permission list authoritative as it evolves.
      await exec
        .update(customRole)
        .set({
          description: preset.description,
          permissions: preset.permissions,
          updatedAt: new Date(),
        })
        .where(eq(customRole.id, current.id));
    }
  }
}
