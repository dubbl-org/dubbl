-- Plans become per-organization: Free, Standard, Premium. Existing Pro
-- subscriptions carry over as Standard (rename keeps every row's value).
ALTER TYPE "public"."plan" RENAME VALUE 'pro' TO 'standard';--> statement-breakpoint
ALTER TYPE "public"."plan" ADD VALUE IF NOT EXISTS 'premium';
--> statement-breakpoint
ALTER TYPE "public"."plan" ADD VALUE IF NOT EXISTS 'ultimate';
