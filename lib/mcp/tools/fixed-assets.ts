import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  fixedAsset,
  assetCategory,
  depreciationEntry,
  assetRevaluation,
  cwipCost,
  journalEntry,
  journalLine,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import {
  getNextEntryNumber,
  ensureAccountByCode,
  resolveBaseRate,
} from "@/lib/api/journal-automation";
import { calculateMonthlyDepreciation } from "@/lib/fixed-assets/depreciation";
import type { AuthContext } from "@/lib/api/auth-context";

const depreciationMethods = [
  "straight_line",
  "declining_balance",
  "units_of_production",
  "sum_of_years_digits",
] as const;

const conventions = [
  "full_month",
  "mid_month",
  "half_year",
  "mid_quarter",
  "pro_rata_days",
  "full_at_purchase",
] as const;

const todayIso = () => new Date().toISOString().split("T")[0];

export function registerFixedAssetTools(server: McpServer, ctx: AuthContext) {
  // ─── List / Create assets ──────────────────────────────────────────
  server.tool(
    "list_fixed_assets",
    "List fixed assets for the organization, optionally filtered by status. Each asset carries monetary fields in integer cents (purchasePrice, residualValue, accumulatedDepreciation, netBookValue, revaluedAmount, revaluationSurplusBalance), its depreciation method/convention, useful life in months, and links to its asset/depreciation/accumulated-depreciation chart accounts. Use to find an assetId before depreciating, disposing, revaluing, impairing or capitalizing.",
    {
      status: z
        .enum(["active", "fully_depreciated", "disposed", "in_progress"])
        .optional()
        .describe("Filter by asset status. 'in_progress' = capital-work-in-progress (CWIP) not yet capitalized."),
      categoryId: z
        .string()
        .uuid()
        .optional()
        .describe("Filter to a single asset category UUID"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(50)
        .describe("Max rows to return (max 200)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:assets");

        const conditions = [
          eq(fixedAsset.organizationId, ctx.organizationId),
          notDeleted(fixedAsset.deletedAt),
        ];
        if (params.status) conditions.push(eq(fixedAsset.status, params.status));
        if (params.categoryId) conditions.push(eq(fixedAsset.categoryId, params.categoryId));

        const offset = (params.page - 1) * params.limit;
        const rows = await db.query.fixedAsset.findMany({
          where: and(...conditions),
          orderBy: desc(fixedAsset.createdAt),
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(fixedAsset)
          .where(and(...conditions));

        return {
          assets: rows.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            assetNumber: a.assetNumber,
            categoryId: a.categoryId,
            purchaseDate: a.purchaseDate,
            inServiceDate: a.inServiceDate,
            purchasePrice: a.purchasePrice,
            residualValue: a.residualValue,
            usefulLifeMonths: a.usefulLifeMonths,
            depreciationMethod: a.depreciationMethod,
            convention: a.convention,
            accumulatedDepreciation: a.accumulatedDepreciation,
            netBookValue: a.netBookValue,
            revaluedAmount: a.revaluedAmount,
            revaluationSurplusBalance: a.revaluationSurplusBalance,
            isCwip: a.isCwip,
            capitalizedDate: a.capitalizedDate,
            status: a.status,
            disposalDate: a.disposalDate,
            disposalAmount: a.disposalAmount,
            assetAccountId: a.assetAccountId,
            depreciationAccountId: a.depreciationAccountId,
            accumulatedDepAccountId: a.accumulatedDepAccountId,
            cwipAccountId: a.cwipAccountId,
          })),
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "create_fixed_asset",
    "Create a fixed asset. Monetary amounts are integer cents (purchasePrice, residualValue). 'usefulLifeMonths' is the depreciation period in months. For units_of_production set 'totalExpectedUnits'. Set isCwip=true to create a capital-work-in-progress asset that accumulates cost until capitalized (use capitalize_cwip_asset) — CWIP assets start 'in_progress' and do not depreciate. Provide chart-account UUIDs (assetAccountId/depreciationAccountId/accumulatedDepAccountId) so depreciation/disposal can post to the ledger; if a categoryId is given its account defaults are copied onto the asset when not explicitly supplied. Does NOT post the original acquisition entry (record that via a bill/journal). Returns the created asset.",
    {
      name: z.string().min(1).describe("Asset name"),
      assetNumber: z.string().min(1).describe("Unique asset number/tag"),
      purchaseDate: z.string().min(1).describe("Purchase date (YYYY-MM-DD)"),
      purchasePrice: z.number().int().min(0).describe("Acquisition cost in integer cents"),
      usefulLifeMonths: z.number().int().min(1).describe("Useful life in months (depreciation period)"),
      description: z.string().nullable().optional().describe("Optional description"),
      categoryId: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe("Optional asset category UUID; its depreciation/posting defaults are copied onto the asset when fields are omitted"),
      inServiceDate: z
        .string()
        .nullable()
        .optional()
        .describe("Date placed in service / began depreciating (YYYY-MM-DD); defaults to purchaseDate"),
      residualValue: z.number().int().min(0).optional().default(0).describe("Salvage/residual value in integer cents"),
      depreciationMethod: z
        .enum(depreciationMethods)
        .optional()
        .default("straight_line")
        .describe("Depreciation method"),
      convention: z
        .enum(conventions)
        .optional()
        .default("full_month")
        .describe("First/last-period timing convention"),
      totalExpectedUnits: z
        .number()
        .int()
        .min(1)
        .nullable()
        .optional()
        .describe("Total expected lifetime units (required for units_of_production)"),
      unitOfMeasure: z.string().nullable().optional().describe("Unit of measure for units_of_production (e.g. 'hours', 'km')"),
      isCwip: z
        .boolean()
        .optional()
        .default(false)
        .describe("Create as capital-work-in-progress (status 'in_progress', does not depreciate until capitalized)"),
      assetAccountId: z.string().uuid().nullable().optional().describe("Chart account UUID for the asset cost (e.g. 1500-series)"),
      depreciationAccountId: z.string().uuid().nullable().optional().describe("Chart account UUID for depreciation expense (e.g. 5500)"),
      accumulatedDepAccountId: z.string().uuid().nullable().optional().describe("Chart account UUID for accumulated depreciation (contra-asset)"),
      cwipAccountId: z.string().uuid().nullable().optional().describe("Chart account UUID where CWIP cost accumulates (CWIP assets only)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:assets");

        // Copy category defaults for any field the caller left unset.
        let category: typeof assetCategory.$inferSelect | undefined;
        if (params.categoryId) {
          category = await db.query.assetCategory.findFirst({
            where: and(
              eq(assetCategory.id, params.categoryId),
              eq(assetCategory.organizationId, ctx.organizationId),
              notDeleted(assetCategory.deletedAt)
            ),
          });
          if (!category) throw new Error("Asset category not found");
        }

        const residualValue = params.residualValue ?? category?.defaultResidualValue ?? 0;
        const depreciationMethod = params.depreciationMethod ?? category?.defaultDepreciationMethod ?? "straight_line";
        const convention = params.convention ?? category?.defaultConvention ?? "full_month";
        const isCwip = params.isCwip ?? false;

        const [created] = await db
          .insert(fixedAsset)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            description: params.description || null,
            assetNumber: params.assetNumber,
            categoryId: params.categoryId || null,
            purchaseDate: params.purchaseDate,
            inServiceDate: params.inServiceDate || params.purchaseDate,
            purchasePrice: params.purchasePrice,
            residualValue,
            usefulLifeMonths: params.usefulLifeMonths,
            depreciationMethod,
            convention,
            totalExpectedUnits: params.totalExpectedUnits ?? null,
            unitOfMeasure: params.unitOfMeasure || null,
            netBookValue: params.purchasePrice,
            isCwip,
            assetAccountId: params.assetAccountId ?? category?.assetAccountId ?? null,
            depreciationAccountId: params.depreciationAccountId ?? category?.depreciationAccountId ?? null,
            accumulatedDepAccountId: params.accumulatedDepAccountId ?? category?.accumulatedDepAccountId ?? null,
            cwipAccountId: params.cwipAccountId ?? category?.cwipAccountId ?? null,
            status: isCwip ? "in_progress" : "active",
          })
          .returning();

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "create",
          entityType: "fixed_asset",
          entityId: created.id,
          changes: { name: created.name, assetNumber: created.assetNumber, isCwip },
        });

        return { asset: created };
      })
  );

  // ─── Asset categories ──────────────────────────────────────────────
  server.tool(
    "create_asset_category",
    "Create a reusable asset category (asset class) holding default depreciation + posting settings that are copied onto each asset created in the category. 'defaultResidualValue' is integer cents; 'defaultDepreciationRateBp' is the declining-balance rate in basis points (2000 = 20%); 'defaultUsefulLifeMonths' is in months. Account fields are chart-account UUIDs. Returns the created category.",
    {
      name: z.string().min(1).describe("Category name (e.g. 'Vehicles', 'Computer Equipment')"),
      defaultDepreciationMethod: z
        .enum(depreciationMethods)
        .optional()
        .default("straight_line")
        .describe("Default depreciation method for assets in this category"),
      defaultConvention: z
        .enum(conventions)
        .optional()
        .default("full_month")
        .describe("Default first/last-period timing convention"),
      defaultUsefulLifeMonths: z
        .number()
        .int()
        .min(1)
        .nullable()
        .optional()
        .describe("Default useful life in months"),
      defaultResidualValue: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("Default residual/salvage value in integer cents"),
      defaultDepreciationRateBp: z
        .number()
        .int()
        .min(0)
        .nullable()
        .optional()
        .describe("Default declining-balance rate in basis points (2000 = 20%)"),
      assetAccountId: z.string().uuid().nullable().optional().describe("Default chart account UUID for asset cost"),
      depreciationAccountId: z.string().uuid().nullable().optional().describe("Default chart account UUID for depreciation expense"),
      accumulatedDepAccountId: z.string().uuid().nullable().optional().describe("Default chart account UUID for accumulated depreciation"),
      cwipAccountId: z.string().uuid().nullable().optional().describe("Default chart account UUID for CWIP cost accumulation"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:assets");

        const [created] = await db
          .insert(assetCategory)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            defaultDepreciationMethod: params.defaultDepreciationMethod,
            defaultConvention: params.defaultConvention,
            defaultUsefulLifeMonths: params.defaultUsefulLifeMonths ?? null,
            defaultResidualValue: params.defaultResidualValue,
            defaultDepreciationRateBp: params.defaultDepreciationRateBp ?? null,
            assetAccountId: params.assetAccountId || null,
            depreciationAccountId: params.depreciationAccountId || null,
            accumulatedDepAccountId: params.accumulatedDepAccountId || null,
            cwipAccountId: params.cwipAccountId || null,
          })
          .returning();

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "create",
          entityType: "asset_category",
          entityId: created.id,
          changes: { name: created.name },
        });

        return { category: created };
      })
  );

  server.tool(
    "list_asset_categories",
    "List asset categories (asset classes) for the organization, optionally filtered by active status. Each category carries its default depreciation method/convention, defaultUsefulLifeMonths, defaultResidualValue (integer cents), defaultDepreciationRateBp (declining-balance rate in basis points, 2000 = 20%) and its default chart-account UUIDs (asset/depreciation/accumulated-depreciation/CWIP). Use to find a categoryId before creating an asset or updating/deleting a category. Returns categories plus pagination (total/page/limit).",
    {
      isActive: z
        .boolean()
        .optional()
        .describe("Filter by active status; omit to return both active and inactive categories"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(50)
        .describe("Max rows to return (max 200)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:assets");

        const conditions = [
          eq(assetCategory.organizationId, ctx.organizationId),
          notDeleted(assetCategory.deletedAt),
        ];
        if (params.isActive !== undefined) {
          conditions.push(eq(assetCategory.isActive, params.isActive));
        }

        const offset = (params.page - 1) * params.limit;
        const rows = await db.query.assetCategory.findMany({
          where: and(...conditions),
          orderBy: assetCategory.name,
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(assetCategory)
          .where(and(...conditions));

        return {
          categories: rows,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "get_asset_category",
    "Fetch a single asset category by its UUID, including its resolved default chart accounts (asset/depreciation/accumulated-depreciation/CWIP). Monetary defaults are integer cents and defaultDepreciationRateBp is in basis points. Returns the category, or an error if not found in the organization.",
    {
      categoryId: z.string().uuid().describe("UUID of the asset category to fetch"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:assets");

        const category = await db.query.assetCategory.findFirst({
          where: and(
            eq(assetCategory.id, params.categoryId),
            eq(assetCategory.organizationId, ctx.organizationId),
            notDeleted(assetCategory.deletedAt)
          ),
          with: {
            assetAccount: true,
            depreciationAccount: true,
            accumulatedDepAccount: true,
            cwipAccount: true,
          },
        });
        if (!category) throw new Error("Asset category not found");

        return { category };
      })
  );

  server.tool(
    "update_asset_category",
    "Update an asset category's defaults. Only the fields you pass are changed; omitted fields are left untouched. 'defaultResidualValue' is integer cents; 'defaultDepreciationRateBp' is the declining-balance rate in basis points (2000 = 20%); 'defaultUsefulLifeMonths' is in months. Account fields are chart-account UUIDs. Set isActive=false to hide the category from new-asset selection without deleting it. Returns the updated category.",
    {
      categoryId: z.string().uuid().describe("UUID of the asset category to update"),
      name: z.string().min(1).optional().describe("New category name"),
      defaultDepreciationMethod: z
        .enum(depreciationMethods)
        .optional()
        .describe("Default depreciation method for assets in this category"),
      defaultConvention: z
        .enum(conventions)
        .optional()
        .describe("Default first/last-period timing convention"),
      defaultUsefulLifeMonths: z
        .number()
        .int()
        .min(1)
        .nullable()
        .optional()
        .describe("Default useful life in months (null to clear)"),
      defaultResidualValue: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Default residual/salvage value in integer cents"),
      defaultDepreciationRateBp: z
        .number()
        .int()
        .min(0)
        .max(100000)
        .nullable()
        .optional()
        .describe("Default declining-balance rate in basis points (2000 = 20%; null to clear)"),
      assetAccountId: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe("Default chart account UUID for asset cost (null to clear)"),
      depreciationAccountId: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe("Default chart account UUID for depreciation expense (null to clear)"),
      accumulatedDepAccountId: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe("Default chart account UUID for accumulated depreciation (null to clear)"),
      cwipAccountId: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe("Default chart account UUID for CWIP cost accumulation (null to clear)"),
      isActive: z
        .boolean()
        .optional()
        .describe("Whether the category is active and selectable for new assets"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:assets");

        const existing = await db.query.assetCategory.findFirst({
          where: and(
            eq(assetCategory.id, params.categoryId),
            eq(assetCategory.organizationId, ctx.organizationId),
            notDeleted(assetCategory.deletedAt)
          ),
        });
        if (!existing) throw new Error("Asset category not found");

        const updates: Partial<typeof assetCategory.$inferInsert> = {};
        if (params.name !== undefined) updates.name = params.name;
        if (params.defaultDepreciationMethod !== undefined)
          updates.defaultDepreciationMethod = params.defaultDepreciationMethod;
        if (params.defaultConvention !== undefined)
          updates.defaultConvention = params.defaultConvention;
        if (params.defaultUsefulLifeMonths !== undefined)
          updates.defaultUsefulLifeMonths = params.defaultUsefulLifeMonths;
        if (params.defaultResidualValue !== undefined)
          updates.defaultResidualValue = params.defaultResidualValue;
        if (params.defaultDepreciationRateBp !== undefined)
          updates.defaultDepreciationRateBp = params.defaultDepreciationRateBp;
        if (params.assetAccountId !== undefined)
          updates.assetAccountId = params.assetAccountId;
        if (params.depreciationAccountId !== undefined)
          updates.depreciationAccountId = params.depreciationAccountId;
        if (params.accumulatedDepAccountId !== undefined)
          updates.accumulatedDepAccountId = params.accumulatedDepAccountId;
        if (params.cwipAccountId !== undefined)
          updates.cwipAccountId = params.cwipAccountId;
        if (params.isActive !== undefined) updates.isActive = params.isActive;

        const [updated] = await db
          .update(assetCategory)
          .set({ ...updates, updatedAt: new Date() })
          .where(
            and(
              eq(assetCategory.id, params.categoryId),
              eq(assetCategory.organizationId, ctx.organizationId)
            )
          )
          .returning();

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "update",
          entityType: "asset_category",
          entityId: params.categoryId,
          changes: updates,
        });

        return { category: updated };
      })
  );

  server.tool(
    "delete_asset_category",
    "Soft-delete an asset category. The category is hidden from listings and new-asset selection but its row is retained; assets already created in the category keep their copied defaults and are not affected. Returns success.",
    {
      categoryId: z.string().uuid().describe("UUID of the asset category to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:assets");

        const existing = await db.query.assetCategory.findFirst({
          where: and(
            eq(assetCategory.id, params.categoryId),
            eq(assetCategory.organizationId, ctx.organizationId),
            notDeleted(assetCategory.deletedAt)
          ),
        });
        if (!existing) throw new Error("Asset category not found");

        await db
          .update(assetCategory)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(assetCategory.id, params.categoryId),
              eq(assetCategory.organizationId, ctx.organizationId)
            )
          );

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "delete",
          entityType: "asset_category",
          entityId: params.categoryId,
          changes: { name: existing.name },
        });

        return { success: true };
      })
  );

  // ─── Run depreciation ──────────────────────────────────────────────
  server.tool(
    "run_asset_depreciation",
    "Post one period's depreciation charge for a single active asset. Computes the charge from the asset's method/convention and the count of periods already booked (safe for declining-balance/SYD/uneven schedules); for units_of_production pass 'unitsThisPeriod'. Posts a balanced journal entry (DR depreciation expense / CR accumulated depreciation) when both accounts are configured, records a depreciationEntry, and updates accumulatedDepreciation / netBookValue (marking the asset 'fully_depreciated' when NBV reaches residual). Atomic. Amounts are integer cents. Returns the depreciation entry, the new asset totals and the journalEntryId.",
    {
      assetId: z.string().uuid().describe("UUID of the active fixed asset to depreciate"),
      date: z.string().optional().describe("Posting date (YYYY-MM-DD); defaults to today"),
      unitsThisPeriod: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Units consumed this period (required for units_of_production assets; ignored otherwise)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:assets");

        const asset = await db.query.fixedAsset.findFirst({
          where: and(
            eq(fixedAsset.id, params.assetId),
            eq(fixedAsset.organizationId, ctx.organizationId),
            notDeleted(fixedAsset.deletedAt)
          ),
        });
        if (!asset) throw new Error("Fixed asset not found");
        if (asset.status !== "active") throw new Error("Asset is not active");

        const date = params.date || todayIso();

        const [priorCount] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(depreciationEntry)
          .where(eq(depreciationEntry.fixedAssetId, asset.id));
        const periodIndex = Number(priorCount?.count ?? 0);

        const amount = calculateMonthlyDepreciation({
          purchasePrice: asset.purchasePrice,
          residualValue: asset.residualValue,
          usefulLifeMonths: asset.usefulLifeMonths,
          depreciationMethod: asset.depreciationMethod,
          accumulatedDepreciation: asset.accumulatedDepreciation,
          purchaseDate: asset.purchaseDate,
          periodIndex,
          convention: asset.convention,
          inServiceDate: asset.inServiceDate ?? asset.purchaseDate,
          totalExpectedUnits: asset.totalExpectedUnits,
          unitsThisPeriod: params.unitsThisPeriod,
          periodDate: date,
        });

        if (amount <= 0) throw new Error("No depreciation remaining for this period");

        const newAccumulated = asset.accumulatedDepreciation + amount;
        const newNetBookValue = asset.purchasePrice - newAccumulated;
        const newStatus =
          newNetBookValue <= asset.residualValue ? "fully_depreciated" : "active";

        const result = await db.transaction(async (tx) => {
          let journalEntryId: string | null = null;

          if (asset.depreciationAccountId && asset.accumulatedDepAccountId) {
            const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
            const [entry] = await tx
              .insert(journalEntry)
              .values({
                organizationId: ctx.organizationId,
                entryNumber,
                date,
                description: `Depreciation - ${asset.name} (${asset.assetNumber})`,
                reference: asset.assetNumber,
                status: "posted",
                sourceType: "depreciation",
                sourceId: asset.id,
                postedAt: new Date(),
                createdBy: ctx.userId,
              })
              .returning();
            journalEntryId = entry.id;

            await tx.insert(journalLine).values([
              {
                journalEntryId: entry.id,
                accountId: asset.depreciationAccountId,
                description: `Depreciation - ${asset.name}`,
                debitAmount: amount,
                creditAmount: 0,
              },
              {
                journalEntryId: entry.id,
                accountId: asset.accumulatedDepAccountId,
                description: `Depreciation - ${asset.name}`,
                debitAmount: 0,
                creditAmount: amount,
              },
            ]);
          }

          const [depEntry] = await tx
            .insert(depreciationEntry)
            .values({
              fixedAssetId: asset.id,
              date,
              amount,
              unitsThisPeriod: params.unitsThisPeriod ?? null,
              journalEntryId,
            })
            .returning();

          await tx
            .update(fixedAsset)
            .set({
              accumulatedDepreciation: newAccumulated,
              netBookValue: newNetBookValue,
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(fixedAsset.id, asset.id));

          return { depEntry, journalEntryId };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "depreciate",
          entityType: "fixed_asset",
          entityId: asset.id,
          changes: { amount, journalEntryId: result.journalEntryId },
        });

        return {
          depreciationEntry: result.depEntry,
          journalEntryId: result.journalEntryId,
          asset: {
            accumulatedDepreciation: newAccumulated,
            netBookValue: newNetBookValue,
            status: newStatus,
          },
        };
      })
  );

  // ─── Dispose ───────────────────────────────────────────────────────
  server.tool(
    "dispose_fixed_asset",
    "Dispose of (sell or write off) a fixed asset. Books a depreciation catch-up to the disposal date (if any remains), then posts the disposal entry: DR accumulated depreciation, CR asset at cost, DR proceeds account for any sale proceeds, and recognizes the balancing gain (CR 4300 Gain on Asset Disposal) or loss (DR 5920 Loss on Asset Disposal). Any revaluation surplus held in equity for the asset is transferred to retained earnings (DR 3400 / CR 3100). Marks the asset 'disposed' with NBV 0. Atomic; GL posts only when the asset + accumulated-depreciation accounts are configured. 'disposalAmount' is sale proceeds in integer cents (0 for a write-off). Returns the updated asset, the realized gain/loss and journalEntryId.",
    {
      assetId: z.string().uuid().describe("UUID of the fixed asset to dispose"),
      disposalAmount: z.number().int().min(0).describe("Sale proceeds in integer cents (0 for a write-off)"),
      date: z.string().min(1).describe("Disposal date (YYYY-MM-DD)"),
      proceedsAccountId: z
        .string()
        .uuid()
        .optional()
        .describe("Chart account UUID where proceeds land; defaults to Undeposited Funds (1250) / Cash (1100)"),
      gainAccountId: z.string().uuid().optional().describe("Override chart account UUID for the disposal gain (default 4300)"),
      lossAccountId: z.string().uuid().optional().describe("Override chart account UUID for the disposal loss (default 5920)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:assets");

        const asset = await db.query.fixedAsset.findFirst({
          where: and(
            eq(fixedAsset.id, params.assetId),
            eq(fixedAsset.organizationId, ctx.organizationId),
            notDeleted(fixedAsset.deletedAt)
          ),
        });
        if (!asset) throw new Error("Fixed asset not found");
        if (asset.status === "disposed") throw new Error("Asset is already disposed");

        const { base: baseCurrency } = await resolveBaseRate(
          ctx.organizationId,
          undefined,
          params.date
        );

        // Depreciation catch-up to the disposal date for an active asset.
        let catchUpAmount = 0;
        if (asset.status === "active") {
          const [priorCount] = await db
            .select({ count: sql<number>`count(*)`.mapWith(Number) })
            .from(depreciationEntry)
            .where(eq(depreciationEntry.fixedAssetId, asset.id));
          const periodIndex = Number(priorCount?.count ?? 0);

          catchUpAmount = calculateMonthlyDepreciation({
            purchasePrice: asset.purchasePrice,
            residualValue: asset.residualValue,
            usefulLifeMonths: asset.usefulLifeMonths,
            depreciationMethod: asset.depreciationMethod,
            accumulatedDepreciation: asset.accumulatedDepreciation,
            purchaseDate: asset.purchaseDate,
            periodIndex,
            convention: asset.convention,
            inServiceDate: asset.inServiceDate ?? asset.purchaseDate,
            totalExpectedUnits: asset.totalExpectedUnits,
            unitsThisPeriod: undefined,
            periodDate: params.date,
          });
        }

        const result = await db.transaction(async (tx) => {
          let disposalEntryId: string | null = null;
          // Only post when the asset can be balanced.
          if (asset.assetAccountId && asset.accumulatedDepAccountId) {
            // Catch-up entry first so the disposal removes the full accumulated balance.
            if (catchUpAmount > 0) {
              if (asset.depreciationAccountId) {
                const depNumber = await getNextEntryNumber(ctx.organizationId, tx);
                const [depEntry] = await tx
                  .insert(journalEntry)
                  .values({
                    organizationId: ctx.organizationId,
                    entryNumber: depNumber,
                    date: params.date,
                    description: `Disposal depreciation catch-up - ${asset.name} (${asset.assetNumber})`,
                    reference: asset.assetNumber,
                    status: "posted",
                    sourceType: "depreciation",
                    sourceId: asset.id,
                    postedAt: new Date(),
                    createdBy: ctx.userId,
                  })
                  .returning();

                await tx.insert(journalLine).values([
                  {
                    journalEntryId: depEntry.id,
                    accountId: asset.depreciationAccountId,
                    description: `Depreciation catch-up - ${asset.name}`,
                    debitAmount: catchUpAmount,
                    creditAmount: 0,
                  },
                  {
                    journalEntryId: depEntry.id,
                    accountId: asset.accumulatedDepAccountId,
                    description: `Depreciation catch-up - ${asset.name}`,
                    debitAmount: 0,
                    creditAmount: catchUpAmount,
                  },
                ]);

                await tx.insert(depreciationEntry).values({
                  fixedAssetId: asset.id,
                  date: params.date,
                  amount: catchUpAmount,
                  journalEntryId: depEntry.id,
                });
              } else {
                // No expense account to post the catch-up; don't fold it in.
                catchUpAmount = 0;
              }
            }

            const postedAccumulated = asset.accumulatedDepreciation + catchUpAmount;
            const postedNbv = asset.purchasePrice - postedAccumulated;
            const postedGainOrLoss = params.disposalAmount - postedNbv;

            // Resolve proceeds account: override → Undeposited Funds (1250) → Cash (1100).
            let proceedsAccountId = params.proceedsAccountId ?? null;
            if (!proceedsAccountId && params.disposalAmount > 0) {
              const undeposited =
                (await ensureAccountByCode(
                  ctx.organizationId,
                  { code: "1250", name: "Undeposited Funds", type: "asset", subType: "current" },
                  baseCurrency,
                  tx
                )) ??
                (await ensureAccountByCode(
                  ctx.organizationId,
                  { code: "1100", name: "Cash", type: "asset", subType: "current" },
                  baseCurrency,
                  tx
                ));
              proceedsAccountId = undeposited?.id ?? null;
            }
            if (params.disposalAmount > 0 && !proceedsAccountId) {
              throw new Error("Could not resolve a proceeds account for the disposal");
            }

            const number = await getNextEntryNumber(ctx.organizationId, tx);
            const [entry] = await tx
              .insert(journalEntry)
              .values({
                organizationId: ctx.organizationId,
                entryNumber: number,
                date: params.date,
                description: `Disposal - ${asset.name} (${asset.assetNumber})`,
                reference: asset.assetNumber,
                status: "posted",
                sourceType: "disposal",
                sourceId: asset.id,
                postedAt: new Date(),
                createdBy: ctx.userId,
              })
              .returning();
            disposalEntryId = entry.id;

            const lines: (typeof journalLine.$inferInsert)[] = [];

            if (postedAccumulated > 0) {
              lines.push({
                journalEntryId: entry.id,
                accountId: asset.accumulatedDepAccountId,
                description: `Disposal - remove accumulated depreciation - ${asset.name}`,
                debitAmount: postedAccumulated,
                creditAmount: 0,
              });
            }

            lines.push({
              journalEntryId: entry.id,
              accountId: asset.assetAccountId,
              description: `Disposal - remove asset at cost - ${asset.name}`,
              debitAmount: 0,
              creditAmount: asset.purchasePrice,
            });

            if (params.disposalAmount > 0 && proceedsAccountId) {
              lines.push({
                journalEntryId: entry.id,
                accountId: proceedsAccountId,
                description: `Disposal proceeds - ${asset.name}`,
                debitAmount: params.disposalAmount,
                creditAmount: 0,
              });
            }

            if (postedGainOrLoss > 0) {
              let gainAccountId = params.gainAccountId ?? null;
              if (!gainAccountId) {
                const gainAccount = await ensureAccountByCode(
                  ctx.organizationId,
                  { code: "4300", name: "Gain on Asset Disposal", type: "revenue", subType: "other_income" },
                  baseCurrency,
                  tx
                );
                gainAccountId = gainAccount?.id ?? null;
              }
              if (gainAccountId) {
                lines.push({
                  journalEntryId: entry.id,
                  accountId: gainAccountId,
                  description: `Gain on disposal - ${asset.name}`,
                  debitAmount: 0,
                  creditAmount: postedGainOrLoss,
                });
              }
            } else if (postedGainOrLoss < 0) {
              let lossAccountId = params.lossAccountId ?? null;
              if (!lossAccountId) {
                const lossAccount = await ensureAccountByCode(
                  ctx.organizationId,
                  { code: "5920", name: "Loss on Asset Disposal", type: "expense", subType: "other_expense" },
                  baseCurrency,
                  tx
                );
                lossAccountId = lossAccount?.id ?? null;
              }
              if (lossAccountId) {
                lines.push({
                  journalEntryId: entry.id,
                  accountId: lossAccountId,
                  description: `Loss on disposal - ${asset.name}`,
                  debitAmount: Math.abs(postedGainOrLoss),
                  creditAmount: 0,
                });
              }
            }

            await tx.insert(journalLine).values(lines);

            // Transfer revaluation surplus to retained earnings (IAS 16).
            if (asset.revaluationSurplusBalance > 0) {
              const surplusAccount =
                (asset.revaluationReserveAccountId
                  ? { id: asset.revaluationReserveAccountId }
                  : null) ??
                (await ensureAccountByCode(
                  ctx.organizationId,
                  { code: "3400", name: "Revaluation Surplus", type: "equity", subType: "other_equity" },
                  baseCurrency,
                  tx
                ));
              const retainedEarnings = await ensureAccountByCode(
                ctx.organizationId,
                { code: "3100", name: "Retained Earnings", type: "equity", subType: "retained_earnings" },
                baseCurrency,
                tx
              );

              if (surplusAccount?.id && retainedEarnings?.id) {
                const surplusNumber = await getNextEntryNumber(ctx.organizationId, tx);
                const [surplusEntry] = await tx
                  .insert(journalEntry)
                  .values({
                    organizationId: ctx.organizationId,
                    entryNumber: surplusNumber,
                    date: params.date,
                    description: `Disposal - transfer revaluation surplus to retained earnings - ${asset.name} (${asset.assetNumber})`,
                    reference: asset.assetNumber,
                    status: "posted",
                    sourceType: "disposal_revaluation_transfer",
                    sourceId: asset.id,
                    postedAt: new Date(),
                    createdBy: ctx.userId,
                  })
                  .returning();

                await tx.insert(journalLine).values([
                  {
                    journalEntryId: surplusEntry.id,
                    accountId: surplusAccount.id,
                    description: `Transfer revaluation surplus on disposal - ${asset.name}`,
                    debitAmount: asset.revaluationSurplusBalance,
                    creditAmount: 0,
                  },
                  {
                    journalEntryId: surplusEntry.id,
                    accountId: retainedEarnings.id,
                    description: `Realized revaluation surplus on disposal - ${asset.name}`,
                    debitAmount: 0,
                    creditAmount: asset.revaluationSurplusBalance,
                  },
                ]);
              }
            }
          }

          const [row] = await tx
            .update(fixedAsset)
            .set({
              status: "disposed",
              disposalDate: params.date,
              disposalAmount: params.disposalAmount,
              accumulatedDepreciation: asset.accumulatedDepreciation + catchUpAmount,
              netBookValue: 0,
              revaluationSurplusBalance: 0,
              updatedAt: new Date(),
            })
            .where(eq(fixedAsset.id, asset.id))
            .returning();

          return { row, disposalEntryId };
        });

        const finalAccumulated = asset.accumulatedDepreciation + catchUpAmount;
        const gainOrLoss = params.disposalAmount - (asset.purchasePrice - finalAccumulated);

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "dispose",
          entityType: "fixed_asset",
          entityId: asset.id,
          changes: { disposalAmount: params.disposalAmount, gainOrLoss, journalEntryId: result.disposalEntryId },
        });

        return { asset: result.row, gainOrLoss, journalEntryId: result.disposalEntryId };
      })
  );

  // ─── Revalue (IAS 16 revaluation model) ────────────────────────────
  server.tool(
    "revalue_fixed_asset",
    "Revalue a fixed asset to a new carrying amount under the IAS 16 revaluation model. 'revaluedAmount' is the new net carrying amount in integer cents. UPWARD revaluations credit the revaluation surplus in equity (DR asset 1500 / CR 3400 Revaluation Surplus), except the portion that reverses a prior impairment of this asset, which is credited back to P&L (CR 5510). DOWNWARD revaluations first reduce any revaluation surplus held for the asset (DR 3400) and book the excess as an impairment loss in P&L (DR 5510). Updates revaluedAmount, netBookValue and revaluationSurplusBalance, and records an assetRevaluation audit row. Atomic. Returns the revaluation record, updated asset and journalEntryId.",
    {
      assetId: z.string().uuid().describe("UUID of the fixed asset to revalue"),
      revaluedAmount: z.number().int().min(0).describe("New carrying (net book) amount in integer cents"),
      date: z.string().min(1).describe("Revaluation date (YYYY-MM-DD)"),
      notes: z.string().optional().describe("Optional notes for the revaluation audit trail"),
      assetAccountId: z.string().uuid().optional().describe("Override chart account UUID for the asset (defaults to the asset's assetAccountId or 1500)"),
      surplusAccountId: z.string().uuid().optional().describe("Override chart account UUID for revaluation surplus (default 3400)"),
      impairmentAccountId: z.string().uuid().optional().describe("Override chart account UUID for impairment loss (default 5510)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:assets");

        const asset = await db.query.fixedAsset.findFirst({
          where: and(
            eq(fixedAsset.id, params.assetId),
            eq(fixedAsset.organizationId, ctx.organizationId),
            notDeleted(fixedAsset.deletedAt)
          ),
        });
        if (!asset) throw new Error("Fixed asset not found");
        if (asset.status === "disposed") throw new Error("Cannot revalue a disposed asset");

        const previousCarrying = asset.netBookValue;
        const change = params.revaluedAmount - previousCarrying;
        if (change === 0) throw new Error("Revalued amount equals the current carrying amount");

        const { base: baseCurrency } = await resolveBaseRate(ctx.organizationId, undefined, params.date);

        const result = await db.transaction(async (tx) => {
          const assetAccountId =
            params.assetAccountId ??
            asset.assetAccountId ??
            (await ensureAccountByCode(
              ctx.organizationId,
              { code: "1500", name: "Property, Plant & Equipment", type: "asset", subType: "fixed_asset" },
              baseCurrency,
              tx
            ))?.id ??
            null;
          if (!assetAccountId) throw new Error("Could not resolve the asset account for revaluation");

          const surplusAccountId =
            params.surplusAccountId ??
            asset.revaluationReserveAccountId ??
            (await ensureAccountByCode(
              ctx.organizationId,
              { code: "3400", name: "Revaluation Surplus", type: "equity", subType: "other_equity" },
              baseCurrency,
              tx
            ))?.id ??
            null;

          const impairmentAccountId =
            params.impairmentAccountId ??
            asset.impairmentExpenseAccountId ??
            (await ensureAccountByCode(
              ctx.organizationId,
              { code: "5510", name: "Impairment Loss", type: "expense", subType: "other_expense" },
              baseCurrency,
              tx
            ))?.id ??
            null;

          let surplusDelta = 0; // signed change to equity surplus
          let impairmentDelta = 0; // signed P&L impact (positive = loss, negative = reversal income)
          const lines: (typeof journalLine.$inferInsert)[] = [];

          if (change > 0) {
            // Upward: reverse any prior impairment to P&L first, remainder to surplus.
            // Prior impairment is tracked as a negative revaluationSurplusBalance is
            // not used; instead reversals beyond a zero surplus go to income only when
            // a prior impairment exists. We approximate IAS 16 by crediting income for
            // the portion that restores a previously impaired carrying amount.
            const priorImpairment = Math.max(0, -asset.revaluationSurplusBalance);
            const reversalToIncome = Math.min(change, priorImpairment);
            const toSurplus = change - reversalToIncome;

            lines.push({
              journalEntryId: "",
              accountId: assetAccountId,
              description: `Revaluation increase - ${asset.name}`,
              debitAmount: change,
              creditAmount: 0,
            });
            if (reversalToIncome > 0 && impairmentAccountId) {
              lines.push({
                journalEntryId: "",
                accountId: impairmentAccountId,
                description: `Reversal of impairment - ${asset.name}`,
                debitAmount: 0,
                creditAmount: reversalToIncome,
              });
              impairmentDelta = -reversalToIncome;
            }
            if (toSurplus > 0 && surplusAccountId) {
              lines.push({
                journalEntryId: "",
                accountId: surplusAccountId,
                description: `Revaluation surplus - ${asset.name}`,
                debitAmount: 0,
                creditAmount: toSurplus,
              });
              surplusDelta = toSurplus;
            }
          } else {
            // Downward: consume existing surplus first, excess to impairment loss.
            const decrease = -change;
            const existingSurplus = Math.max(0, asset.revaluationSurplusBalance);
            const fromSurplus = Math.min(decrease, existingSurplus);
            const toImpairment = decrease - fromSurplus;

            if (fromSurplus > 0 && surplusAccountId) {
              lines.push({
                journalEntryId: "",
                accountId: surplusAccountId,
                description: `Reverse revaluation surplus - ${asset.name}`,
                debitAmount: fromSurplus,
                creditAmount: 0,
              });
              surplusDelta = -fromSurplus;
            }
            if (toImpairment > 0 && impairmentAccountId) {
              lines.push({
                journalEntryId: "",
                accountId: impairmentAccountId,
                description: `Impairment loss - ${asset.name}`,
                debitAmount: toImpairment,
                creditAmount: 0,
              });
              impairmentDelta = toImpairment;
            }
            lines.push({
              journalEntryId: "",
              accountId: assetAccountId,
              description: `Revaluation decrease - ${asset.name}`,
              debitAmount: 0,
              creditAmount: decrease,
            });
          }

          let journalEntryId: string | null = null;
          if (lines.length > 0) {
            const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
            const [entry] = await tx
              .insert(journalEntry)
              .values({
                organizationId: ctx.organizationId,
                entryNumber,
                date: params.date,
                description: `Revaluation - ${asset.name} (${asset.assetNumber})`,
                reference: asset.assetNumber,
                status: "posted",
                sourceType: "asset_revaluation",
                sourceId: asset.id,
                postedAt: new Date(),
                createdBy: ctx.userId,
              })
              .returning();
            journalEntryId = entry.id;
            await tx
              .insert(journalLine)
              .values(lines.map((l) => ({ ...l, journalEntryId: entry.id })));
          }

          // revaluationSurplusBalance tracks net equity surplus; a negative value
          // records a cumulative net P&L impairment still outstanding for reversal.
          const newSurplusBalance =
            asset.revaluationSurplusBalance + surplusDelta - impairmentDelta;

          const [revRow] = await tx
            .insert(assetRevaluation)
            .values({
              fixedAssetId: asset.id,
              date: params.date,
              previousCarryingAmount: previousCarrying,
              revaluedAmount: params.revaluedAmount,
              changeAmount: change,
              surplusAmount: surplusDelta,
              impairmentAmount: impairmentDelta,
              isImpairment: impairmentDelta > 0,
              notes: params.notes || null,
              journalEntryId,
            })
            .returning();

          const [updated] = await tx
            .update(fixedAsset)
            .set({
              revaluedAmount: params.revaluedAmount,
              netBookValue: params.revaluedAmount,
              revaluationSurplusBalance: newSurplusBalance,
              revaluationReserveAccountId: surplusAccountId ?? asset.revaluationReserveAccountId,
              impairmentExpenseAccountId: impairmentAccountId ?? asset.impairmentExpenseAccountId,
              updatedAt: new Date(),
            })
            .where(eq(fixedAsset.id, asset.id))
            .returning();

          return { revRow, updated, journalEntryId };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "revalue",
          entityType: "fixed_asset",
          entityId: asset.id,
          changes: { previousCarrying, revaluedAmount: params.revaluedAmount, change, journalEntryId: result.journalEntryId },
        });

        return { revaluation: result.revRow, asset: result.updated, journalEntryId: result.journalEntryId };
      })
  );

  // ─── Impair ────────────────────────────────────────────────────────
  server.tool(
    "impair_fixed_asset",
    "Recognize an impairment loss on a fixed asset under IAS 36, writing its carrying amount down to a lower recoverable amount. 'recoverableAmount' is the new (lower) carrying amount in integer cents and must be below the current net book value. The impairment first reduces any revaluation surplus held in equity for the asset (DR 3400), then charges the remainder to P&L (DR 5510 Impairment Loss); the credit reduces the asset (CR 1500 / the asset account). Updates netBookValue, revaluedAmount and revaluationSurplusBalance, and records an assetRevaluation row flagged isImpairment. Atomic. Returns the impairment record, updated asset and journalEntryId.",
    {
      assetId: z.string().uuid().describe("UUID of the fixed asset to impair"),
      recoverableAmount: z.number().int().min(0).describe("New (lower) recoverable/carrying amount in integer cents"),
      date: z.string().min(1).describe("Impairment date (YYYY-MM-DD)"),
      notes: z.string().optional().describe("Optional notes for the impairment audit trail"),
      assetAccountId: z.string().uuid().optional().describe("Override chart account UUID for the asset (defaults to the asset's assetAccountId or 1500)"),
      surplusAccountId: z.string().uuid().optional().describe("Override chart account UUID for revaluation surplus consumed (default 3400)"),
      impairmentAccountId: z.string().uuid().optional().describe("Override chart account UUID for impairment loss (default 5510)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:assets");

        const asset = await db.query.fixedAsset.findFirst({
          where: and(
            eq(fixedAsset.id, params.assetId),
            eq(fixedAsset.organizationId, ctx.organizationId),
            notDeleted(fixedAsset.deletedAt)
          ),
        });
        if (!asset) throw new Error("Fixed asset not found");
        if (asset.status === "disposed") throw new Error("Cannot impair a disposed asset");

        const previousCarrying = asset.netBookValue;
        if (params.recoverableAmount >= previousCarrying) {
          throw new Error("Recoverable amount must be below the current net book value to impair");
        }
        const decrease = previousCarrying - params.recoverableAmount;

        const { base: baseCurrency } = await resolveBaseRate(ctx.organizationId, undefined, params.date);

        const result = await db.transaction(async (tx) => {
          const assetAccountId =
            params.assetAccountId ??
            asset.assetAccountId ??
            (await ensureAccountByCode(
              ctx.organizationId,
              { code: "1500", name: "Property, Plant & Equipment", type: "asset", subType: "fixed_asset" },
              baseCurrency,
              tx
            ))?.id ??
            null;
          if (!assetAccountId) throw new Error("Could not resolve the asset account for impairment");

          const surplusAccountId =
            params.surplusAccountId ??
            asset.revaluationReserveAccountId ??
            (await ensureAccountByCode(
              ctx.organizationId,
              { code: "3400", name: "Revaluation Surplus", type: "equity", subType: "other_equity" },
              baseCurrency,
              tx
            ))?.id ??
            null;

          const impairmentAccountId =
            params.impairmentAccountId ??
            asset.impairmentExpenseAccountId ??
            (await ensureAccountByCode(
              ctx.organizationId,
              { code: "5510", name: "Impairment Loss", type: "expense", subType: "other_expense" },
              baseCurrency,
              tx
            ))?.id ??
            null;

          // Consume existing surplus first, excess to P&L.
          const existingSurplus = Math.max(0, asset.revaluationSurplusBalance);
          const fromSurplus = Math.min(decrease, existingSurplus);
          const toImpairment = decrease - fromSurplus;

          const lines: (typeof journalLine.$inferInsert)[] = [];
          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const [entry] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: params.date,
              description: `Impairment - ${asset.name} (${asset.assetNumber})`,
              reference: asset.assetNumber,
              status: "posted",
              sourceType: "asset_impairment",
              sourceId: asset.id,
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();

          if (fromSurplus > 0 && surplusAccountId) {
            lines.push({
              journalEntryId: entry.id,
              accountId: surplusAccountId,
              description: `Impairment against revaluation surplus - ${asset.name}`,
              debitAmount: fromSurplus,
              creditAmount: 0,
            });
          }
          if (toImpairment > 0 && impairmentAccountId) {
            lines.push({
              journalEntryId: entry.id,
              accountId: impairmentAccountId,
              description: `Impairment loss - ${asset.name}`,
              debitAmount: toImpairment,
              creditAmount: 0,
            });
          }
          lines.push({
            journalEntryId: entry.id,
            accountId: assetAccountId,
            description: `Impairment write-down - ${asset.name}`,
            debitAmount: 0,
            creditAmount: decrease,
          });

          await tx.insert(journalLine).values(lines);

          const newSurplusBalance = asset.revaluationSurplusBalance - fromSurplus - toImpairment;

          const [revRow] = await tx
            .insert(assetRevaluation)
            .values({
              fixedAssetId: asset.id,
              date: params.date,
              previousCarryingAmount: previousCarrying,
              revaluedAmount: params.recoverableAmount,
              changeAmount: -decrease,
              surplusAmount: -fromSurplus,
              impairmentAmount: toImpairment,
              isImpairment: true,
              notes: params.notes || null,
              journalEntryId: entry.id,
            })
            .returning();

          const [updated] = await tx
            .update(fixedAsset)
            .set({
              revaluedAmount: params.recoverableAmount,
              netBookValue: params.recoverableAmount,
              revaluationSurplusBalance: newSurplusBalance,
              revaluationReserveAccountId: surplusAccountId ?? asset.revaluationReserveAccountId,
              impairmentExpenseAccountId: impairmentAccountId ?? asset.impairmentExpenseAccountId,
              updatedAt: new Date(),
            })
            .where(eq(fixedAsset.id, asset.id))
            .returning();

          return { revRow, updated, journalEntryId: entry.id, fromSurplus, toImpairment };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "impair",
          entityType: "fixed_asset",
          entityId: asset.id,
          changes: {
            previousCarrying,
            recoverableAmount: params.recoverableAmount,
            impairmentLoss: result.toImpairment,
            surplusConsumed: result.fromSurplus,
            journalEntryId: result.journalEntryId,
          },
        });

        return { impairment: result.revRow, asset: result.updated, journalEntryId: result.journalEntryId };
      })
  );

  // ─── Capitalize CWIP ───────────────────────────────────────────────
  server.tool(
    "capitalize_cwip_asset",
    "Capitalize a capital-work-in-progress (CWIP) asset into service: transfers the accumulated CWIP cost into the fixed-asset account and starts depreciation. Sums the asset's recorded cwipCost rows (or uses purchasePrice when none exist) as the capitalized cost and posts DR asset account (1500) / CR CWIP account, then marks the asset 'active' with isCwip=false, sets capitalizedDate and inServiceDate, and refreshes purchasePrice / netBookValue to the capitalized cost. Atomic; posts only when both the asset and CWIP accounts are resolvable. Returns the updated asset, capitalized cost and journalEntryId.",
    {
      assetId: z.string().uuid().describe("UUID of the in-progress (CWIP) fixed asset to capitalize"),
      date: z.string().min(1).describe("Capitalization / in-service date (YYYY-MM-DD)"),
      assetAccountId: z.string().uuid().optional().describe("Override chart account UUID for the asset (defaults to the asset's assetAccountId or 1500)"),
      cwipAccountId: z.string().uuid().optional().describe("Override chart account UUID holding the CWIP cost (defaults to the asset's cwipAccountId or 1600)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:assets");

        const asset = await db.query.fixedAsset.findFirst({
          where: and(
            eq(fixedAsset.id, params.assetId),
            eq(fixedAsset.organizationId, ctx.organizationId),
            notDeleted(fixedAsset.deletedAt)
          ),
        });
        if (!asset) throw new Error("Fixed asset not found");
        if (!asset.isCwip && asset.status !== "in_progress") {
          throw new Error("Asset is not capital-work-in-progress");
        }

        // Capitalized cost = sum of recorded CWIP costs, or the purchasePrice when none.
        const [costSum] = await db
          .select({ total: sql<number>`coalesce(sum(${cwipCost.amount}), 0)`.mapWith(Number) })
          .from(cwipCost)
          .where(eq(cwipCost.fixedAssetId, asset.id));
        const capitalizedCost = Number(costSum?.total ?? 0) || asset.purchasePrice;

        const { base: baseCurrency } = await resolveBaseRate(ctx.organizationId, undefined, params.date);

        const result = await db.transaction(async (tx) => {
          let journalEntryId: string | null = null;

          const assetAccountId =
            params.assetAccountId ??
            asset.assetAccountId ??
            (await ensureAccountByCode(
              ctx.organizationId,
              { code: "1500", name: "Property, Plant & Equipment", type: "asset", subType: "fixed_asset" },
              baseCurrency,
              tx
            ))?.id ??
            null;

          const cwipAccountId =
            params.cwipAccountId ??
            asset.cwipAccountId ??
            (await ensureAccountByCode(
              ctx.organizationId,
              { code: "1600", name: "Capital Work in Progress", type: "asset", subType: "fixed_asset" },
              baseCurrency,
              tx
            ))?.id ??
            null;

          if (capitalizedCost > 0 && assetAccountId && cwipAccountId) {
            const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
            const [entry] = await tx
              .insert(journalEntry)
              .values({
                organizationId: ctx.organizationId,
                entryNumber,
                date: params.date,
                description: `Capitalize CWIP - ${asset.name} (${asset.assetNumber})`,
                reference: asset.assetNumber,
                status: "posted",
                sourceType: "cwip_capitalization",
                sourceId: asset.id,
                postedAt: new Date(),
                createdBy: ctx.userId,
              })
              .returning();
            journalEntryId = entry.id;

            await tx.insert(journalLine).values([
              {
                journalEntryId: entry.id,
                accountId: assetAccountId,
                description: `Capitalize CWIP into service - ${asset.name}`,
                debitAmount: capitalizedCost,
                creditAmount: 0,
              },
              {
                journalEntryId: entry.id,
                accountId: cwipAccountId,
                description: `Transfer CWIP cost - ${asset.name}`,
                debitAmount: 0,
                creditAmount: capitalizedCost,
              },
            ]);
          }

          const [updated] = await tx
            .update(fixedAsset)
            .set({
              isCwip: false,
              status: "active",
              capitalizedDate: params.date,
              inServiceDate: params.date,
              purchasePrice: capitalizedCost,
              netBookValue: capitalizedCost - asset.accumulatedDepreciation,
              assetAccountId: assetAccountId ?? asset.assetAccountId,
              cwipAccountId: cwipAccountId ?? asset.cwipAccountId,
              updatedAt: new Date(),
            })
            .where(eq(fixedAsset.id, asset.id))
            .returning();

          return { updated, journalEntryId };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "capitalize_cwip",
          entityType: "fixed_asset",
          entityId: asset.id,
          changes: { capitalizedCost, journalEntryId: result.journalEntryId },
        });

        return { asset: result.updated, capitalizedCost, journalEntryId: result.journalEntryId };
      })
  );

  // ─── Rollback depreciation ─────────────────────────────────────────
  server.tool(
    "rollback_asset_depreciation",
    "Reverse (roll back) the most recent depreciation entry for an asset — for correcting a mistaken or duplicate depreciation run. Posts a reversing journal entry (DR accumulated depreciation / CR depreciation expense) for the same amount when the original entry was posted to the GL, deletes the depreciationEntry, restores accumulatedDepreciation / netBookValue, and reverts a 'fully_depreciated' asset to 'active'. Atomic. Amounts are integer cents. Returns the reversed amount, the new asset totals and the reversing journalEntryId.",
    {
      assetId: z.string().uuid().describe("UUID of the fixed asset whose last depreciation entry to reverse"),
      depreciationEntryId: z
        .string()
        .uuid()
        .optional()
        .describe("Optional specific depreciationEntry UUID to reverse; defaults to the asset's most recent entry"),
      date: z.string().optional().describe("Posting date for the reversing entry (YYYY-MM-DD); defaults to today"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:assets");

        const asset = await db.query.fixedAsset.findFirst({
          where: and(
            eq(fixedAsset.id, params.assetId),
            eq(fixedAsset.organizationId, ctx.organizationId),
            notDeleted(fixedAsset.deletedAt)
          ),
        });
        if (!asset) throw new Error("Fixed asset not found");
        if (asset.status === "disposed") throw new Error("Cannot roll back depreciation on a disposed asset");

        // Resolve the entry to reverse: explicit id, else the most recent one.
        let target: typeof depreciationEntry.$inferSelect | undefined;
        if (params.depreciationEntryId) {
          target = await db.query.depreciationEntry.findFirst({
            where: and(
              eq(depreciationEntry.id, params.depreciationEntryId),
              eq(depreciationEntry.fixedAssetId, asset.id)
            ),
          });
        } else {
          target = await db.query.depreciationEntry.findFirst({
            where: eq(depreciationEntry.fixedAssetId, asset.id),
            orderBy: [desc(depreciationEntry.date), desc(depreciationEntry.createdAt)],
          });
        }
        if (!target) throw new Error("No depreciation entry found to reverse");

        const amount = target.amount;
        const date = params.date || todayIso();
        const newAccumulated = Math.max(0, asset.accumulatedDepreciation - amount);
        const newNetBookValue = asset.purchasePrice - newAccumulated;
        const newStatus =
          asset.status === "fully_depreciated" && newNetBookValue > asset.residualValue
            ? "active"
            : asset.status;

        const result = await db.transaction(async (tx) => {
          let reversalEntryId: string | null = null;

          // Post a reversing GL entry only when the original hit the ledger.
          if (target!.journalEntryId && asset.depreciationAccountId && asset.accumulatedDepAccountId) {
            const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
            const [entry] = await tx
              .insert(journalEntry)
              .values({
                organizationId: ctx.organizationId,
                entryNumber,
                date,
                description: `Reverse depreciation - ${asset.name} (${asset.assetNumber})`,
                reference: asset.assetNumber,
                status: "posted",
                sourceType: "depreciation_reversal",
                sourceId: asset.id,
                postedAt: new Date(),
                createdBy: ctx.userId,
              })
              .returning();
            reversalEntryId = entry.id;

            await tx.insert(journalLine).values([
              {
                journalEntryId: entry.id,
                accountId: asset.accumulatedDepAccountId,
                description: `Reverse depreciation - ${asset.name}`,
                debitAmount: amount,
                creditAmount: 0,
              },
              {
                journalEntryId: entry.id,
                accountId: asset.depreciationAccountId,
                description: `Reverse depreciation - ${asset.name}`,
                debitAmount: 0,
                creditAmount: amount,
              },
            ]);
          }

          await tx.delete(depreciationEntry).where(eq(depreciationEntry.id, target!.id));

          const [updated] = await tx
            .update(fixedAsset)
            .set({
              accumulatedDepreciation: newAccumulated,
              netBookValue: newNetBookValue,
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(fixedAsset.id, asset.id))
            .returning();

          return { updated, reversalEntryId };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "rollback_depreciation",
          entityType: "fixed_asset",
          entityId: asset.id,
          changes: { reversedAmount: amount, depreciationEntryId: target.id, journalEntryId: result.reversalEntryId },
        });

        return {
          reversedAmount: amount,
          reversedDepreciationEntryId: target.id,
          journalEntryId: result.reversalEntryId,
          asset: {
            accumulatedDepreciation: newAccumulated,
            netBookValue: newNetBookValue,
            status: newStatus,
          },
        };
      })
  );
}
