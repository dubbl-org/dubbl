CREATE TYPE "public"."tax_jurisdiction_source" AS ENUM('manual', 'api');--> statement-breakpoint
CREATE TYPE "public"."advisor_role" AS ENUM('accountant', 'auditor', 'tax_advisor', 'bookkeeper');--> statement-breakpoint
CREATE TABLE "entity_tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6b7280' NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tax_jurisdiction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"country" text NOT NULL,
	"state" text,
	"county" text,
	"city" text,
	"postal_code" text,
	"combined_rate" integer NOT NULL,
	"state_rate" integer DEFAULT 0 NOT NULL,
	"county_rate" integer DEFAULT 0 NOT NULL,
	"city_rate" integer DEFAULT 0 NOT NULL,
	"special_rate" integer DEFAULT 0 NOT NULL,
	"source" "tax_jurisdiction_source" DEFAULT 'manual' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advisor_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advisor_user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "advisor_role" DEFAULT 'accountant' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"invite_email" text,
	"granted_by" uuid,
	"invited_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advisor_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advisor_access_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"details" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "peppol_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "peppol_scheme" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "tax_lookup_enabled" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "tax_lookup_provider" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "peppol_id" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "peppol_scheme" text;--> statement-breakpoint
ALTER TABLE "entity_tag" ADD CONSTRAINT "entity_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_jurisdiction" ADD CONSTRAINT "tax_jurisdiction_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisor_access" ADD CONSTRAINT "advisor_access_advisor_user_id_users_id_fk" FOREIGN KEY ("advisor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisor_access" ADD CONSTRAINT "advisor_access_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisor_access" ADD CONSTRAINT "advisor_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisor_audit_log" ADD CONSTRAINT "advisor_audit_log_advisor_access_id_advisor_access_id_fk" FOREIGN KEY ("advisor_access_id") REFERENCES "public"."advisor_access"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_tag_unique_idx" ON "entity_tag" USING btree ("tag_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_org_name_idx" ON "tag" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_jurisdiction_lookup_idx" ON "tax_jurisdiction" USING btree ("organization_id","country","state","postal_code");--> statement-breakpoint
CREATE UNIQUE INDEX "advisor_access_user_org_idx" ON "advisor_access" USING btree ("advisor_user_id","organization_id");