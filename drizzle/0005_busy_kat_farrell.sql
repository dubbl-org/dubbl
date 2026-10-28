ALTER TABLE "organization" ADD COLUMN "document_locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;