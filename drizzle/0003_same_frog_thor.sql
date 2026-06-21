CREATE TYPE "public"."invoice_type" AS ENUM('standard', 'deposit', 'retainer');--> statement-breakpoint
ALTER TYPE "public"."invoice_status" ADD VALUE 'pending_approval';--> statement-breakpoint
ALTER TYPE "public"."invoice_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "onboarding_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "invoice_type" "invoice_type" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "deposit_percent" integer;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "dunning_level" integer DEFAULT 0 NOT NULL;