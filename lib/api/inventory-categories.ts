import { db } from "@/lib/db";
import { inventoryCategory, inventoryItem } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { fail, type Tx } from "@/lib/api/inventory-ops";

type DbOrTx = typeof db | Tx;

/**
 * Items have one category system: `categoryId` points at an inventory
 * category, and the text `category` column is kept as a copy of that
 * category's name (it's what lists, filters, search and exports read).
 * These helpers keep the two in step wherever a category is set.
 */

/** Find a category by exact name (restoring it if it was deleted), or create it. */
export async function findOrCreateCategory(
  exec: DbOrTx,
  organizationId: string,
  rawName: string
): Promise<{ id: string; name: string }> {
  const name = rawName.trim();
  if (!name) fail("Category name is required");
  const existing = await exec.query.inventoryCategory.findFirst({
    where: and(eq(inventoryCategory.organizationId, organizationId), eq(inventoryCategory.name, name)),
  });
  if (existing) {
    if (existing.deletedAt) {
      await exec
        .update(inventoryCategory)
        .set({ deletedAt: null, parentId: null, updatedAt: new Date() })
        .where(eq(inventoryCategory.id, existing.id));
    }
    return { id: existing.id, name: existing.name };
  }
  const [created] = await exec
    .insert(inventoryCategory)
    .values({ organizationId, name })
    .onConflictDoNothing()
    .returning();
  if (created) return { id: created.id, name: created.name };
  // Lost a race with a concurrent insert of the same name.
  const again = await exec.query.inventoryCategory.findFirst({
    where: and(eq(inventoryCategory.organizationId, organizationId), eq(inventoryCategory.name, name)),
  });
  if (!again) throw new Error("Could not create category");
  return { id: again.id, name: again.name };
}

/**
 * Turn the category fields of a create/update payload into the stored pair.
 * `categoryId` wins when given; otherwise a text `category` is matched to (or
 * creates) a category with that name. Returns null when neither field was sent,
 * so an update leaves the category alone.
 */
export async function resolveItemCategory(
  exec: DbOrTx,
  organizationId: string,
  input: { categoryId?: string | null; category?: string | null }
): Promise<{ categoryId: string | null; category: string | null } | null> {
  if (input.categoryId) {
    const cat = await exec.query.inventoryCategory.findFirst({
      where: and(
        eq(inventoryCategory.id, input.categoryId),
        eq(inventoryCategory.organizationId, organizationId),
        notDeleted(inventoryCategory.deletedAt)
      ),
    });
    if (!cat) fail("Category not found", 404);
    return { categoryId: cat.id, category: cat.name };
  }
  if (input.category !== undefined && input.category !== null && input.category.trim()) {
    const cat = await findOrCreateCategory(exec, organizationId, input.category);
    return { categoryId: cat.id, category: cat.name };
  }
  if (input.categoryId === null || input.category === null || input.category === "") {
    return { categoryId: null, category: null };
  }
  return null;
}

/** After a rename, copy the new name onto every item in the category. */
export async function syncCategoryName(exec: DbOrTx, organizationId: string, categoryId: string, name: string) {
  await exec
    .update(inventoryItem)
    .set({ category: name, updatedAt: new Date() })
    .where(and(eq(inventoryItem.organizationId, organizationId), eq(inventoryItem.categoryId, categoryId)));
}

/**
 * Soft-delete a category: its items become uncategorised and its
 * sub-categories move up to the top level (so they don't vanish from the tree).
 */
export async function deleteCategory(tx: Tx, organizationId: string, categoryId: string) {
  const [deleted] = await tx
    .update(inventoryCategory)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(inventoryCategory.id, categoryId),
        eq(inventoryCategory.organizationId, organizationId),
        notDeleted(inventoryCategory.deletedAt)
      )
    )
    .returning();
  if (!deleted) return null;
  await tx
    .update(inventoryItem)
    .set({ categoryId: null, category: null, updatedAt: new Date() })
    .where(and(eq(inventoryItem.organizationId, organizationId), eq(inventoryItem.categoryId, categoryId)));
  await tx
    .update(inventoryCategory)
    .set({ parentId: null, updatedAt: new Date() })
    .where(and(eq(inventoryCategory.organizationId, organizationId), eq(inventoryCategory.parentId, categoryId)));
  return deleted;
}

/** A parent must be another live, top-level category in the same org. */
export async function assertValidParent(
  exec: DbOrTx,
  organizationId: string,
  parentId: string | null | undefined,
  selfId?: string
) {
  if (!parentId) return;
  if (parentId === selfId) fail("A category can't be its own parent");
  const parent = await exec.query.inventoryCategory.findFirst({
    where: and(
      eq(inventoryCategory.id, parentId),
      eq(inventoryCategory.organizationId, organizationId),
      notDeleted(inventoryCategory.deletedAt)
    ),
  });
  if (!parent) fail("Parent category not found", 404);
  if (parent.parentId) fail("Categories can only be one level deep. Pick a top-level parent.");
}

export interface CategoryInput {
  name: string;
  color?: string | null;
  description?: string | null;
  parentId?: string | null;
}

/** Create a category (409 on a duplicate name; a deleted one with that name is restored). */
export async function createCategory(organizationId: string, input: CategoryInput) {
  const name = input.name.trim();
  if (!name) fail("Category name is required");
  await assertValidParent(db, organizationId, input.parentId);
  const existing = await db.query.inventoryCategory.findFirst({
    where: and(eq(inventoryCategory.organizationId, organizationId), eq(inventoryCategory.name, name)),
  });
  if (existing && !existing.deletedAt) fail(`A category called "${existing.name}" already exists`, 409);
  if (existing) {
    // Names are unique per org, deleted ones included: bring the old one back.
    const [restored] = await db
      .update(inventoryCategory)
      .set({ ...input, name, deletedAt: null, updatedAt: new Date() })
      .where(eq(inventoryCategory.id, existing.id))
      .returning();
    return restored;
  }
  const [created] = await db.insert(inventoryCategory).values({ organizationId, ...input, name }).returning();
  return created;
}

/** Update a category; a rename is copied onto its items. Returns null if not found. */
export async function updateCategory(organizationId: string, id: string, input: Partial<CategoryInput>) {
  const fields = { ...input };
  if (fields.name !== undefined) {
    fields.name = fields.name.trim();
    if (!fields.name) fail("Category name is required");
    const clash = await db.query.inventoryCategory.findFirst({
      where: and(eq(inventoryCategory.organizationId, organizationId), eq(inventoryCategory.name, fields.name)),
    });
    if (clash && clash.id !== id) fail(`A category called "${clash.name}" already exists`, 409);
  }
  if (fields.parentId) {
    await assertValidParent(db, organizationId, fields.parentId, id);
    const child = await db.query.inventoryCategory.findFirst({
      where: and(
        eq(inventoryCategory.parentId, id),
        eq(inventoryCategory.organizationId, organizationId),
        notDeleted(inventoryCategory.deletedAt)
      ),
      columns: { id: true },
    });
    if (child) fail("This category has sub-categories, so it can't go under another category");
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(inventoryCategory)
      .set({ ...fields, updatedAt: new Date() })
      .where(
        and(
          eq(inventoryCategory.id, id),
          eq(inventoryCategory.organizationId, organizationId),
          notDeleted(inventoryCategory.deletedAt)
        )
      )
      .returning();
    // Items carry a copy of the category name, so a rename updates them too.
    if (row && fields.name) await syncCategoryName(tx, organizationId, id, row.name);
    return row ?? null;
  });
}
