ALTER TABLE "stripe_sync_log" ADD COLUMN "retry_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "stripe_integration" ADD COLUMN "last_error" text;
