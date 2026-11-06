ALTER TABLE "fixed_asset" ADD COLUMN "depreciation_rate_bp" integer;--> statement-breakpoint
-- Backfill: declining-balance assets created from a category take that category's yearly rate, which was stored but never applied.
UPDATE "fixed_asset" SET "depreciation_rate_bp" = "asset_category"."default_depreciation_rate_bp" FROM "asset_category" WHERE "fixed_asset"."category_id" = "asset_category"."id" AND "fixed_asset"."depreciation_method" = 'declining_balance' AND "fixed_asset"."depreciation_rate_bp" IS NULL AND "asset_category"."default_depreciation_rate_bp" IS NOT NULL;
