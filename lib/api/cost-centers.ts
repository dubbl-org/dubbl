import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { costCenter } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";
import { LineReferenceError } from "./line-stock-refs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The distinct cost center ids being newly set: non-empty ids that aren't
 * already saved on the record (`saved`). Unchanged ids are left alone so
 * records saved before a cost center was deactivated keep working.
 */
export function newCostCenterIds(
  ids: Iterable<string | null | undefined>,
  saved: Iterable<string | null | undefined> = []
): string[] {
  const keep = new Set([...saved].filter((v): v is string => !!v));
  return [...new Set([...ids].filter((v): v is string => !!v && !keep.has(v)))];
}

/**
 * Check every cost center being newly set on an invoice, journal entry or bank
 * categorization belongs to this organization and is active. Ids already saved
 * on the record (`saved`) are skipped. Throws LineReferenceError: 404 when a
 * cost center isn't found, 400 when it's inactive.
 */
export async function assertCostCentersActive(
  organizationId: string,
  ids: Iterable<string | null | undefined>,
  saved: Iterable<string | null | undefined> = []
): Promise<void> {
  const wanted = newCostCenterIds(ids, saved);
  if (wanted.length === 0) return;
  const malformed = wanted.filter((id) => !UUID_RE.test(id));
  if (malformed.length > 0) throw new LineReferenceError(`Cost center not found: ${malformed.join(", ")}`);
  const rows = await db
    .select({ id: costCenter.id, code: costCenter.code, name: costCenter.name, isActive: costCenter.isActive })
    .from(costCenter)
    .where(
      and(
        eq(costCenter.organizationId, organizationId),
        inArray(costCenter.id, wanted),
        notDeleted(costCenter.deletedAt)
      )
    );
  const found = new Set(rows.map((r) => r.id));
  const missing = wanted.filter((id) => !found.has(id));
  if (missing.length > 0) throw new LineReferenceError(`Cost center not found: ${missing.join(", ")}`);
  const inactive = rows.filter((r) => !r.isActive);
  if (inactive.length > 0) {
    const names = inactive.map((r) => `${r.code} ${r.name}`).join(", ");
    throw new LineReferenceError(
      `Cost center ${names} is inactive. Reactivate it in Settings > Cost Centers or pick an active cost center.`,
      400
    );
  }
}
