CREATE TYPE "public"."exchange_rate_source" AS ENUM('manual', 'api');--> statement-breakpoint
CREATE TYPE "public"."reminder_document_type" AS ENUM('invoice', 'bill');--> statement-breakpoint
CREATE TYPE "public"."reminder_recipient_type" AS ENUM('contact_email', 'contact_persons', 'custom');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."reminder_trigger_type" AS ENUM('before_due', 'on_due', 'after_due');--> statement-breakpoint
CREATE TYPE "public"."accrual_frequency" AS ENUM('monthly');--> statement-breakpoint
CREATE TYPE "public"."accrual_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."revenue_method" AS ENUM('straight_line', 'milestone', 'on_completion');--> statement-breakpoint
CREATE TYPE "public"."revenue_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."loan_status" AS ENUM('active', 'paid_off', 'defaulted');--> statement-breakpoint
ALTER TYPE "public"."bill_status" ADD VALUE 'pending_approval' BEFORE 'received';--> statement-breakpoint
CREATE TABLE "exchange_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"base_currency" text NOT NULL,
	"target_currency" text NOT NULL,
	"rate" integer NOT NULL,
	"date" date NOT NULL,
	"source" "exchange_rate_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"smtp_host" text NOT NULL,
	"smtp_port" integer DEFAULT 587 NOT NULL,
	"smtp_username" text NOT NULL,
	"smtp_password" text NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"reply_to" text,
	"use_tls" boolean DEFAULT true NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reminder_rule_id" uuid,
	"document_type" text NOT NULL,
	"document_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"status" "reminder_status" NOT NULL,
	"error_message" text,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger_type" "reminder_trigger_type" NOT NULL,
	"trigger_days" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"subject_template" text NOT NULL,
	"body_template" text NOT NULL,
	"document_type" "reminder_document_type" NOT NULL,
	"recipient_type" "reminder_recipient_type" NOT NULL,
	"custom_emails" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "accrual_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"period_date" date NOT NULL,
	"amount" integer NOT NULL,
	"journal_entry_id" uuid,
	"posted" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accrual_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_entry_id" uuid,
	"total_amount" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"frequency" "accrual_frequency" DEFAULT 'monthly' NOT NULL,
	"periods" integer NOT NULL,
	"account_id" uuid NOT NULL,
	"reverse_account_id" uuid NOT NULL,
	"description" text NOT NULL,
	"status" "accrual_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"period_date" date NOT NULL,
	"amount" integer NOT NULL,
	"journal_entry_id" uuid,
	"recognized" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"invoice_line_id" uuid,
	"total_amount" integer NOT NULL,
	"recognized_amount" integer DEFAULT 0 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"method" "revenue_method" DEFAULT 'straight_line' NOT NULL,
	"status" "revenue_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bank_account_id" uuid,
	"principal_amount" integer NOT NULL,
	"interest_rate" integer NOT NULL,
	"term_months" integer NOT NULL,
	"start_date" date NOT NULL,
	"monthly_payment" integer NOT NULL,
	"status" "loan_status" DEFAULT 'active' NOT NULL,
	"principal_account_id" uuid,
	"interest_account_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "loan_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" uuid NOT NULL,
	"period_number" integer NOT NULL,
	"date" date NOT NULL,
	"principal_amount" integer NOT NULL,
	"interest_amount" integer NOT NULL,
	"total_payment" integer NOT NULL,
	"remaining_balance" integer NOT NULL,
	"journal_entry_id" uuid,
	"posted" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "bill_approval_threshold" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "interest_rate" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "interest_method" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "interest_grace_days" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "rejected_at" timestamp;--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_config" ADD CONSTRAINT "email_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_reminder_rule_id_reminder_rule_id_fk" FOREIGN KEY ("reminder_rule_id") REFERENCES "public"."reminder_rule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_rule" ADD CONSTRAINT "reminder_rule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accrual_entry" ADD CONSTRAINT "accrual_entry_schedule_id_accrual_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."accrual_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accrual_entry" ADD CONSTRAINT "accrual_entry_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accrual_schedule" ADD CONSTRAINT "accrual_schedule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accrual_schedule" ADD CONSTRAINT "accrual_schedule_source_entry_id_journal_entry_id_fk" FOREIGN KEY ("source_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accrual_schedule" ADD CONSTRAINT "accrual_schedule_account_id_chart_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accrual_schedule" ADD CONSTRAINT "accrual_schedule_reverse_account_id_chart_account_id_fk" FOREIGN KEY ("reverse_account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accrual_schedule" ADD CONSTRAINT "accrual_schedule_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_entry" ADD CONSTRAINT "revenue_entry_schedule_id_revenue_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."revenue_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_entry" ADD CONSTRAINT "revenue_entry_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_schedule" ADD CONSTRAINT "revenue_schedule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_schedule" ADD CONSTRAINT "revenue_schedule_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_schedule" ADD CONSTRAINT "revenue_schedule_invoice_line_id_invoice_line_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_schedule" ADD CONSTRAINT "revenue_schedule_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_principal_account_id_chart_account_id_fk" FOREIGN KEY ("principal_account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_interest_account_id_chart_account_id_fk" FOREIGN KEY ("interest_account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_schedule" ADD CONSTRAINT "loan_schedule_loan_id_loan_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_schedule" ADD CONSTRAINT "loan_schedule_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rate_org_currencies_date_idx" ON "exchange_rate" USING btree ("organization_id","base_currency","target_currency","date");--> statement-breakpoint
CREATE UNIQUE INDEX "email_config_org_idx" ON "email_config" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;