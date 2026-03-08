CREATE TYPE "public"."credit_note_status" AS ENUM('draft', 'sent', 'applied', 'void');--> statement-breakpoint
CREATE TYPE "public"."debit_note_status" AS ENUM('draft', 'sent', 'applied', 'void');--> statement-breakpoint
CREATE TYPE "public"."bank_account_type" AS ENUM('checking', 'savings', 'credit_card', 'cash', 'loan', 'investment', 'other');--> statement-breakpoint
CREATE TYPE "public"."bank_import_format" AS ENUM('csv', 'tsv', 'qif', 'ofx', 'qfx', 'qbo', 'camt052', 'camt053', 'camt054', 'mt940', 'mt942', 'bai2');--> statement-breakpoint
CREATE TYPE "public"."bank_import_status" AS ENUM('completed', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."bank_rule_match" AS ENUM('contains', 'equals', 'starts_with', 'ends_with');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'cash', 'check', 'card', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('received', 'made');--> statement-breakpoint
CREATE TYPE "public"."recurring_frequency" AS ENUM('weekly', 'fortnightly', 'monthly', 'quarterly', 'semi_annual', 'annual');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('active', 'paused', 'completed');--> statement-breakpoint
CREATE TABLE "cost_center" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "period_lock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lock_date" date NOT NULL,
	"locked_by" uuid,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"job_title" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "credit_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"invoice_id" uuid,
	"credit_note_number" text NOT NULL,
	"issue_date" date NOT NULL,
	"status" "credit_note_status" DEFAULT 'draft' NOT NULL,
	"reference" text,
	"notes" text,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"tax_total" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"amount_applied" integer DEFAULT 0 NOT NULL,
	"amount_remaining" integer DEFAULT 0 NOT NULL,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"journal_entry_id" uuid,
	"sent_at" timestamp,
	"voided_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "credit_note_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_note_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 100 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"account_id" uuid,
	"tax_rate_id" uuid,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debit_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"bill_id" uuid,
	"debit_note_number" text NOT NULL,
	"issue_date" date NOT NULL,
	"status" "debit_note_status" DEFAULT 'draft' NOT NULL,
	"reference" text,
	"notes" text,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"tax_total" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"amount_applied" integer DEFAULT 0 NOT NULL,
	"amount_remaining" integer DEFAULT 0 NOT NULL,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"journal_entry_id" uuid,
	"sent_at" timestamp,
	"voided_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "debit_note_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debit_note_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 100 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"account_id" uuid,
	"tax_rate_id" uuid,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_import_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"date_format" text,
	"decimal_separator" text DEFAULT '.' NOT NULL,
	"thousand_separator" text DEFAULT ',' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"debit_is_negative" boolean DEFAULT true NOT NULL,
	"encoding" text DEFAULT 'utf-8' NOT NULL,
	"csv_delimiter" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"match_field" text DEFAULT 'description' NOT NULL,
	"match_type" "bank_rule_match" DEFAULT 'contains' NOT NULL,
	"match_value" text NOT NULL,
	"account_id" uuid,
	"contact_id" uuid,
	"tax_rate_id" uuid,
	"auto_reconcile" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank_statement_import" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"format" "bank_import_format" NOT NULL,
	"file_name" text NOT NULL,
	"content_hash" text NOT NULL,
	"detected_encoding" text DEFAULT 'utf-8' NOT NULL,
	"status" "bank_import_status" DEFAULT 'completed' NOT NULL,
	"account_identifier" text,
	"statement_currency" text,
	"statement_start_date" date,
	"statement_end_date" date,
	"opening_balance" integer,
	"closing_balance" integer,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_label" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_team_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "running_timer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp NOT NULL,
	"paused_at" timestamp,
	"accumulated_seconds" integer DEFAULT 0 NOT NULL,
	"description" text,
	"task_id" uuid,
	"is_billable" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"payment_number" text NOT NULL,
	"type" "payment_type" NOT NULL,
	"date" date NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"method" "payment_method" DEFAULT 'bank_transfer' NOT NULL,
	"reference" text,
	"notes" text,
	"bank_account_id" uuid,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"journal_entry_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "payment_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"document_id" uuid NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"contact_id" uuid NOT NULL,
	"frequency" "recurring_frequency" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"next_run_date" date NOT NULL,
	"last_run_date" date,
	"occurrences_generated" integer DEFAULT 0 NOT NULL,
	"max_occurrences" integer,
	"status" "recurring_status" DEFAULT 'active' NOT NULL,
	"reference" text,
	"notes" text,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "recurring_template_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 100 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"account_id" uuid,
	"tax_rate_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "api_key" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "api_key" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "api_key" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "api_key" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "attachment" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "attachment" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "attachment" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "attachment" ALTER COLUMN "entity_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "attachment" ALTER COLUMN "journal_entry_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "attachment" ALTER COLUMN "uploaded_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "chart_account" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "chart_account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "chart_account" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "chart_account" ALTER COLUMN "parent_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "currency" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "currency" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "fiscal_year" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "fiscal_year" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "fiscal_year" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "journal_entry" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "journal_entry" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "journal_entry" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "journal_entry" ALTER COLUMN "fiscal_year_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "journal_entry" ALTER COLUMN "source_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "journal_entry" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "journal_line" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "journal_line" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "journal_line" ALTER COLUMN "journal_entry_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "journal_line" ALTER COLUMN "account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "tax_component" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "tax_component" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "tax_component" ALTER COLUMN "tax_rate_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "tax_component" ALTER COLUMN "account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "tax_rate" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "tax_rate" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "tax_rate" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "contact" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "contact" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "contact" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "invoice" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "invoice" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "invoice" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "invoice" ALTER COLUMN "contact_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "invoice" ALTER COLUMN "journal_entry_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "invoice" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "invoice_line" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "invoice_line" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "invoice_line" ALTER COLUMN "invoice_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "invoice_line" ALTER COLUMN "account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "invoice_line" ALTER COLUMN "tax_rate_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "contact_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "converted_invoice_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "quote_line" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "quote_line" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "quote_line" ALTER COLUMN "quote_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "quote_line" ALTER COLUMN "account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "quote_line" ALTER COLUMN "tax_rate_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bill" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bill" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "bill" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bill" ALTER COLUMN "contact_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bill" ALTER COLUMN "journal_entry_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bill" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bill_line" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bill_line" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "bill_line" ALTER COLUMN "bill_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bill_line" ALTER COLUMN "account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bill_line" ALTER COLUMN "tax_rate_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "purchase_order" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "purchase_order" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "purchase_order" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "purchase_order" ALTER COLUMN "contact_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "purchase_order" ALTER COLUMN "converted_bill_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "purchase_order" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "purchase_order_line" ALTER COLUMN "purchase_order_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ALTER COLUMN "account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ALTER COLUMN "tax_rate_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bank_account" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bank_account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "bank_account" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bank_account" ALTER COLUMN "chart_account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bank_reconciliation" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bank_reconciliation" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "bank_reconciliation" ALTER COLUMN "bank_account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bank_transaction" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bank_transaction" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "bank_transaction" ALTER COLUMN "bank_account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bank_transaction" ALTER COLUMN "reconciliation_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "bank_transaction" ALTER COLUMN "journal_entry_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "budget" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "budget" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "budget" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "budget" ALTER COLUMN "fiscal_year_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "budget_line" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "budget_line" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "budget_line" ALTER COLUMN "budget_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "budget_line" ALTER COLUMN "account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "expense_claim" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "expense_claim" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "expense_claim" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "expense_claim" ALTER COLUMN "submitted_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "expense_claim" ALTER COLUMN "approved_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "expense_claim" ALTER COLUMN "journal_entry_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "expense_item" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "expense_item" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "expense_item" ALTER COLUMN "expense_claim_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "expense_item" ALTER COLUMN "account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "entity_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "inventory_item" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "inventory_item" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "inventory_item" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "inventory_item" ALTER COLUMN "cost_account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "inventory_item" ALTER COLUMN "revenue_account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "inventory_item" ALTER COLUMN "inventory_account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "contact_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project_member" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project_member" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "project_member" ALTER COLUMN "project_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project_member" ALTER COLUMN "member_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project_milestone" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project_milestone" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "project_milestone" ALTER COLUMN "project_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project_note" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project_note" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "project_note" ALTER COLUMN "project_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project_note" ALTER COLUMN "author_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project_task" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project_task" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "project_task" ALTER COLUMN "project_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "project_task" ALTER COLUMN "assignee_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "time_entry" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "time_entry" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "time_entry" ALTER COLUMN "project_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "time_entry" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "time_entry" ALTER COLUMN "task_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "time_entry" ALTER COLUMN "invoice_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "depreciation_entry" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "depreciation_entry" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "depreciation_entry" ALTER COLUMN "fixed_asset_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "depreciation_entry" ALTER COLUMN "journal_entry_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "fixed_asset" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "fixed_asset" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "fixed_asset" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "fixed_asset" ALTER COLUMN "asset_account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "fixed_asset" ALTER COLUMN "depreciation_account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "fixed_asset" ALTER COLUMN "accumulated_dep_account_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "payroll_employee" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "payroll_employee" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "payroll_employee" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "payroll_item" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "payroll_item" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "payroll_item" ALTER COLUMN "payroll_run_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "payroll_item" ALTER COLUMN "employee_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "payroll_run" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "payroll_run" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "payroll_run" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "payroll_run" ALTER COLUMN "journal_entry_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "journal_line" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "credit_limit" integer;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "is_tax_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "default_revenue_account_id" uuid;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "default_expense_account_id" uuid;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "default_tax_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_account" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "bank_account" ADD COLUMN "account_type" "bank_account_type" DEFAULT 'checking' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_account" ADD COLUMN "color" text DEFAULT '#0f766e' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "source_type" text DEFAULT 'statement_import' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "external_transaction_id" text;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "statement_line_ref" text;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "payee" text;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "counterparty" text;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "currency_code" text;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "posted_date" date;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "raw_payload" jsonb;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "dedupe_hash" text;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "tax_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "project_task" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "project_task" ADD COLUMN "created_by_id" uuid;--> statement-breakpoint
ALTER TABLE "project_task" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "project_task" ADD COLUMN "labels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cost_center" ADD CONSTRAINT "cost_center_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_lock" ADD CONSTRAINT "period_lock_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_lock" ADD CONSTRAINT "period_lock_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_person" ADD CONSTRAINT "contact_person_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_line" ADD CONSTRAINT "credit_note_line_credit_note_id_credit_note_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_line" ADD CONSTRAINT "credit_note_line_account_id_chart_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_line" ADD CONSTRAINT "credit_note_line_tax_rate_id_tax_rate_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note" ADD CONSTRAINT "debit_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note" ADD CONSTRAINT "debit_note_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note" ADD CONSTRAINT "debit_note_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note" ADD CONSTRAINT "debit_note_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note" ADD CONSTRAINT "debit_note_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note_line" ADD CONSTRAINT "debit_note_line_debit_note_id_debit_note_id_fk" FOREIGN KEY ("debit_note_id") REFERENCES "public"."debit_note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note_line" ADD CONSTRAINT "debit_note_line_account_id_chart_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note_line" ADD CONSTRAINT "debit_note_line_tax_rate_id_tax_rate_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_import_profile" ADD CONSTRAINT "bank_import_profile_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_rule" ADD CONSTRAINT "bank_rule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_rule" ADD CONSTRAINT "bank_rule_account_id_chart_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_rule" ADD CONSTRAINT "bank_rule_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_rule" ADD CONSTRAINT "bank_rule_tax_rate_id_tax_rate_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_import" ADD CONSTRAINT "bank_statement_import_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_import" ADD CONSTRAINT "bank_statement_import_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_label" ADD CONSTRAINT "project_label_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team" ADD CONSTRAINT "project_team_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_member" ADD CONSTRAINT "project_team_member_team_id_project_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."project_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_member" ADD CONSTRAINT "project_team_member_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "running_timer" ADD CONSTRAINT "running_timer_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "running_timer" ADD CONSTRAINT "running_timer_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "running_timer" ADD CONSTRAINT "running_timer_task_id_project_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checklist" ADD CONSTRAINT "task_checklist_task_id_project_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comment" ADD CONSTRAINT "task_comment_task_id_project_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comment" ADD CONSTRAINT "task_comment_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_template" ADD CONSTRAINT "recurring_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_template" ADD CONSTRAINT "recurring_template_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_template" ADD CONSTRAINT "recurring_template_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_template_line" ADD CONSTRAINT "recurring_template_line_template_id_recurring_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."recurring_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_template_line" ADD CONSTRAINT "recurring_template_line_account_id_chart_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_template_line" ADD CONSTRAINT "recurring_template_line_tax_rate_id_tax_rate_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_center_org_code_idx" ON "cost_center" USING btree ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "period_lock_org_idx" ON "period_lock" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_cost_center_id_cost_center_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_default_revenue_account_id_chart_account_id_fk" FOREIGN KEY ("default_revenue_account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_default_expense_account_id_chart_account_id_fk" FOREIGN KEY ("default_expense_account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_default_tax_rate_id_tax_rate_id_fk" FOREIGN KEY ("default_tax_rate_id") REFERENCES "public"."tax_rate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_import_id_bank_statement_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."bank_statement_import"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_account_id_chart_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_tax_rate_id_tax_rate_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_team_id_project_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."project_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;