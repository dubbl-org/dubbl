CREATE TYPE "public"."tax_rate_kind" AS ENUM('standard', 'blocked', 'partial_block', 'exempt', 'reverse_charge', 'no_vat', 'sales_tax_us');--> statement-breakpoint
CREATE TYPE "public"."customer_credit_source" AS ENUM('prepayment', 'overpayment', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."customer_credit_status" AS ENUM('open', 'applied', 'refunded', 'void');--> statement-breakpoint
CREATE TYPE "public"."sales_receipt_status" AS ENUM('draft', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."goods_receipt_status" AS ENUM('draft', 'received', 'billed', 'void');--> statement-breakpoint
CREATE TYPE "public"."cost_method" AS ENUM('average', 'fifo', 'standard');--> statement-breakpoint
CREATE TYPE "public"."project_billable_source" AS ENUM('bill_line', 'expense_item', 'journal_line');--> statement-breakpoint
CREATE TYPE "public"."depreciation_convention" AS ENUM('full_month', 'mid_month', 'half_year', 'mid_quarter', 'pro_rata_days', 'full_at_purchase');--> statement-breakpoint
CREATE TYPE "public"."consolidation_elimination_kind" AS ENUM('ar_ap', 'sales_cogs', 'investment_equity', 'custom');--> statement-breakpoint
CREATE TYPE "public"."consolidation_rate_source" AS ENUM('manual', 'derived');--> statement-breakpoint
CREATE TYPE "public"."consolidation_rate_type" AS ENUM('closing', 'average', 'historical');--> statement-breakpoint
ALTER TYPE "public"."asset_status" ADD VALUE 'in_progress';--> statement-breakpoint
ALTER TYPE "public"."depreciation_method" ADD VALUE 'units_of_production';--> statement-breakpoint
ALTER TYPE "public"."depreciation_method" ADD VALUE 'sum_of_years_digits';--> statement-breakpoint
CREATE TABLE "user_totp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"backup_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_totp_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "customer_credit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"date" date NOT NULL,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"original_amount" integer DEFAULT 0 NOT NULL,
	"amount_remaining" integer DEFAULT 0 NOT NULL,
	"source_type" "customer_credit_source" NOT NULL,
	"status" "customer_credit_status" DEFAULT 'open' NOT NULL,
	"journal_entry_id" uuid,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sales_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"receipt_number" text NOT NULL,
	"date" date NOT NULL,
	"status" "sales_receipt_status" DEFAULT 'draft' NOT NULL,
	"reference" text,
	"notes" text,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"tax_total" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"bank_account_id" uuid,
	"deposit_account_id" uuid,
	"journal_entry_id" uuid,
	"voided_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sales_receipt_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_receipt_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 100 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"account_id" uuid,
	"tax_rate_id" uuid,
	"discount_percent" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"cost_center_id" uuid,
	"project_id" uuid,
	"inventory_item_id" uuid,
	"warehouse_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_purchase_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"purchase_order_id" uuid,
	"contact_id" uuid NOT NULL,
	"receipt_number" text NOT NULL,
	"date" date NOT NULL,
	"status" "goods_receipt_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"purchase_order_line_id" uuid,
	"inventory_item_id" uuid,
	"warehouse_id" uuid,
	"description" text NOT NULL,
	"quantity_received" integer DEFAULT 0 NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL,
	"journal_entry_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procurement_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"price_tolerance_percent" integer DEFAULT 0 NOT NULL,
	"qty_tolerance_percent" integer DEFAULT 0 NOT NULL,
	"require_grn_before_bill" boolean DEFAULT false NOT NULL,
	"block_over_bill" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_settings_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_cost_layer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"warehouse_id" uuid,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"original_quantity" integer NOT NULL,
	"remaining_quantity" integer NOT NULL,
	"unit_cost" integer NOT NULL,
	"source_movement_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_layer_consumption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_movement_id" uuid NOT NULL,
	"cost_layer_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "price_list_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_list_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"min_quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_billable_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_type" "project_billable_source" NOT NULL,
	"source_line_id" uuid NOT NULL,
	"description" text NOT NULL,
	"cost_amount" integer DEFAULT 0 NOT NULL,
	"markup_basis_points" integer DEFAULT 0 NOT NULL,
	"billed_invoice_id" uuid,
	"billed_amount" integer DEFAULT 0 NOT NULL,
	"billed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"default_depreciation_method" "depreciation_method" DEFAULT 'straight_line' NOT NULL,
	"default_convention" "depreciation_convention" DEFAULT 'full_month' NOT NULL,
	"default_useful_life_months" integer,
	"default_residual_value" integer DEFAULT 0 NOT NULL,
	"default_depreciation_rate_bp" integer,
	"asset_account_id" uuid,
	"depreciation_account_id" uuid,
	"accumulated_dep_account_id" uuid,
	"cwip_account_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "asset_revaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixed_asset_id" uuid NOT NULL,
	"date" date NOT NULL,
	"previous_carrying_amount" integer NOT NULL,
	"revalued_amount" integer NOT NULL,
	"change_amount" integer NOT NULL,
	"surplus_amount" integer DEFAULT 0 NOT NULL,
	"impairment_amount" integer DEFAULT 0 NOT NULL,
	"is_impairment" boolean DEFAULT false NOT NULL,
	"notes" text,
	"journal_entry_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cwip_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixed_asset_id" uuid NOT NULL,
	"date" date NOT NULL,
	"description" text,
	"amount" integer NOT NULL,
	"journal_entry_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_item_employer_tax" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_item_id" uuid NOT NULL,
	"jurisdiction_level" "tax_jurisdiction_level" DEFAULT 'federal' NOT NULL,
	"jurisdiction" text,
	"tax_kind" text NOT NULL,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_item_tax_breakdown" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_item_id" uuid NOT NULL,
	"jurisdiction_level" "tax_jurisdiction_level" DEFAULT 'federal' NOT NULL,
	"jurisdiction" text,
	"tax_kind" text NOT NULL,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_tax_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"jurisdiction_level" "tax_jurisdiction_level" DEFAULT 'federal' NOT NULL,
	"jurisdiction" text,
	"tax_kind" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'USD',
	"bank_account_id" uuid,
	"reference" text,
	"notes" text,
	"status" "contractor_payment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"journal_entry_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tax_allowance_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"jurisdiction_level" "tax_jurisdiction_level" DEFAULT 'federal' NOT NULL,
	"jurisdiction" text,
	"tax_year" integer NOT NULL,
	"allowance_value_cents" integer DEFAULT 0 NOT NULL,
	"standard_deduction_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "consolidation_elimination_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"period_end_date" date NOT NULL,
	"rule_id" uuid NOT NULL,
	"currency_code" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"variance_amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consolidation_elimination_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "consolidation_elimination_kind" NOT NULL,
	"debit_account_match" text,
	"credit_account_match" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "consolidation_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"currency_code" text NOT NULL,
	"rate_type" "consolidation_rate_type" NOT NULL,
	"rate" integer NOT NULL,
	"period_end_date" date NOT NULL,
	"source" "consolidation_rate_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_template" ALTER COLUMN "contact_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "retained_earnings_account_id" uuid;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "vat_scheme" text DEFAULT 'accrual' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "tax_regime" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "duplicate_bill_strategy" text DEFAULT 'warn' NOT NULL;--> statement-breakpoint
ALTER TABLE "chart_account" ADD COLUMN "default_tax_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "chart_account" ADD COLUMN "tax_disallowed_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chart_account" ADD COLUMN "reporting_code" text;--> statement-breakpoint
ALTER TABLE "chart_account" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "auto_reverse_date" date;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "reversed_by_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "reverses_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "journal_line" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "period_lock" ADD COLUMN "advisor_lock_date" date;--> statement-breakpoint
ALTER TABLE "tax_rate" ADD COLUMN "kind" "tax_rate_kind" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_rate" ADD COLUMN "recoverable_percent" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "is_1099_vendor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "w9_tax_classification" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "tax_identifier" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "backup_withholding" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "linked_org_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "written_off_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "inventory_item_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "warehouse_id" uuid;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "billed_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bill_line" ADD COLUMN "inventory_item_id" uuid;--> statement-breakpoint
ALTER TABLE "bill_line" ADD COLUMN "warehouse_id" uuid;--> statement-breakpoint
ALTER TABLE "bill_line" ADD COLUMN "goods_receipt_line_id" uuid;--> statement-breakpoint
ALTER TABLE "bill_line" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD COLUMN "inventory_item_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD COLUMN "warehouse_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD COLUMN "quantity_received" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD COLUMN "quantity_billed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_rule" ADD COLUMN "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_rule" ADD COLUMN "match_all" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_rule" ADD COLUMN "split_allocations" jsonb;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "transfer_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "transfer_group_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "cost_method" "cost_method" DEFAULT 'average' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "average_cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "standard_cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "total_value" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "unit_of_measure" text;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD COLUMN "unit_cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD COLUMN "value" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD COLUMN "journal_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_take_line" ADD COLUMN "value_adjustment" integer;--> statement-breakpoint
ALTER TABLE "stock_take_line" ADD COLUMN "journal_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "project_member" ADD COLUMN "cost_rate" integer;--> statement-breakpoint
ALTER TABLE "depreciation_entry" ADD COLUMN "units_this_period" integer;--> statement-breakpoint
ALTER TABLE "depreciation_entry" ADD COLUMN "period_start" date;--> statement-breakpoint
ALTER TABLE "depreciation_entry" ADD COLUMN "period_end" date;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD COLUMN "in_service_date" date;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD COLUMN "convention" "depreciation_convention" DEFAULT 'full_month' NOT NULL;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD COLUMN "total_expected_units" integer;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD COLUMN "unit_of_measure" text;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD COLUMN "is_cwip" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD COLUMN "capitalized_date" date;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD COLUMN "cwip_account_id" uuid;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD COLUMN "revalued_amount" integer;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD COLUMN "revaluation_surplus_balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD COLUMN "revaluation_reserve_account_id" uuid;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD COLUMN "impairment_expense_account_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "ss_wage_base_cents" integer DEFAULT 16810000 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "ss_rate_bp" integer DEFAULT 620 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "medicare_rate_bp" integer DEFAULT 145 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "addl_medicare_threshold_cents" integer DEFAULT 20000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "addl_medicare_rate_bp" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "employer_fica_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "futa_rate_bp" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "futa_wage_base_cents" integer DEFAULT 70000 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "suta_rate_bp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "suta_wage_base_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "default_tax_year" integer;--> statement-breakpoint
ALTER TABLE "tax_bracket" ADD COLUMN "filing_status" "filing_status";--> statement-breakpoint
ALTER TABLE "tax_bracket" ADD COLUMN "tax_year" integer;--> statement-breakpoint
ALTER TABLE "tax_bracket" ADD COLUMN "base_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "tax_bracket" ADD COLUMN "standard_deduction_cents" integer;--> statement-breakpoint
ALTER TABLE "recurring_template" ADD COLUMN "auto_send" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_template" ADD COLUMN "create_as_approved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_template_line" ADD COLUMN "debit_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_template_line" ADD COLUMN "credit_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "consolidation_group" ADD COLUMN "presentation_currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "consolidation_group_member" ADD COLUMN "functional_currency" text;--> statement-breakpoint
ALTER TABLE "user_totp" ADD CONSTRAINT "user_totp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit" ADD CONSTRAINT "customer_credit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit" ADD CONSTRAINT "customer_credit_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit" ADD CONSTRAINT "customer_credit_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit" ADD CONSTRAINT "customer_credit_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_receipt" ADD CONSTRAINT "sales_receipt_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_receipt" ADD CONSTRAINT "sales_receipt_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_receipt" ADD CONSTRAINT "sales_receipt_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_receipt" ADD CONSTRAINT "sales_receipt_deposit_account_id_chart_account_id_fk" FOREIGN KEY ("deposit_account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_receipt" ADD CONSTRAINT "sales_receipt_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_receipt" ADD CONSTRAINT "sales_receipt_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_receipt_line" ADD CONSTRAINT "sales_receipt_line_sales_receipt_id_sales_receipt_id_fk" FOREIGN KEY ("sales_receipt_id") REFERENCES "public"."sales_receipt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_receipt_line" ADD CONSTRAINT "sales_receipt_line_account_id_chart_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_receipt_line" ADD CONSTRAINT "sales_receipt_line_tax_rate_id_tax_rate_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_receipt_line" ADD CONSTRAINT "sales_receipt_line_cost_center_id_cost_center_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_receipt_line" ADD CONSTRAINT "sales_receipt_line_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_receipt_line" ADD CONSTRAINT "sales_receipt_line_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_purchase_order" ADD CONSTRAINT "bill_purchase_order_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_purchase_order" ADD CONSTRAINT "bill_purchase_order_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_goods_receipt_id_goods_receipt_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_purchase_order_line_id_purchase_order_line_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_settings" ADD CONSTRAINT "procurement_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cost_layer" ADD CONSTRAINT "inventory_cost_layer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cost_layer" ADD CONSTRAINT "inventory_cost_layer_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cost_layer" ADD CONSTRAINT "inventory_cost_layer_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cost_layer" ADD CONSTRAINT "inventory_cost_layer_source_movement_id_inventory_movement_id_fk" FOREIGN KEY ("source_movement_id") REFERENCES "public"."inventory_movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_layer_consumption" ADD CONSTRAINT "inventory_layer_consumption_issue_movement_id_inventory_movement_id_fk" FOREIGN KEY ("issue_movement_id") REFERENCES "public"."inventory_movement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_layer_consumption" ADD CONSTRAINT "inventory_layer_consumption_cost_layer_id_inventory_cost_layer_id_fk" FOREIGN KEY ("cost_layer_id") REFERENCES "public"."inventory_cost_layer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list" ADD CONSTRAINT "price_list_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_item" ADD CONSTRAINT "price_list_item_price_list_id_price_list_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_item" ADD CONSTRAINT "price_list_item_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_billable_item" ADD CONSTRAINT "project_billable_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_billable_item" ADD CONSTRAINT "project_billable_item_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_billable_item" ADD CONSTRAINT "project_billable_item_billed_invoice_id_invoice_id_fk" FOREIGN KEY ("billed_invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_category" ADD CONSTRAINT "asset_category_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_category" ADD CONSTRAINT "asset_category_asset_account_id_chart_account_id_fk" FOREIGN KEY ("asset_account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_category" ADD CONSTRAINT "asset_category_depreciation_account_id_chart_account_id_fk" FOREIGN KEY ("depreciation_account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_category" ADD CONSTRAINT "asset_category_accumulated_dep_account_id_chart_account_id_fk" FOREIGN KEY ("accumulated_dep_account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_category" ADD CONSTRAINT "asset_category_cwip_account_id_chart_account_id_fk" FOREIGN KEY ("cwip_account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_revaluation" ADD CONSTRAINT "asset_revaluation_fixed_asset_id_fixed_asset_id_fk" FOREIGN KEY ("fixed_asset_id") REFERENCES "public"."fixed_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_revaluation" ADD CONSTRAINT "asset_revaluation_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cwip_cost" ADD CONSTRAINT "cwip_cost_fixed_asset_id_fixed_asset_id_fk" FOREIGN KEY ("fixed_asset_id") REFERENCES "public"."fixed_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cwip_cost" ADD CONSTRAINT "cwip_cost_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_item_employer_tax" ADD CONSTRAINT "payroll_item_employer_tax_payroll_item_id_payroll_item_id_fk" FOREIGN KEY ("payroll_item_id") REFERENCES "public"."payroll_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_item_tax_breakdown" ADD CONSTRAINT "payroll_item_tax_breakdown_payroll_item_id_payroll_item_id_fk" FOREIGN KEY ("payroll_item_id") REFERENCES "public"."payroll_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_tax_payment" ADD CONSTRAINT "payroll_tax_payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_tax_payment" ADD CONSTRAINT "payroll_tax_payment_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_tax_payment" ADD CONSTRAINT "payroll_tax_payment_created_by_member_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_allowance_config" ADD CONSTRAINT "tax_allowance_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_elimination_entry" ADD CONSTRAINT "consolidation_elimination_entry_group_id_consolidation_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."consolidation_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_elimination_entry" ADD CONSTRAINT "consolidation_elimination_entry_rule_id_consolidation_elimination_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."consolidation_elimination_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_elimination_rule" ADD CONSTRAINT "consolidation_elimination_rule_group_id_consolidation_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."consolidation_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_rate" ADD CONSTRAINT "consolidation_rate_group_id_consolidation_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."consolidation_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_purchase_order_bill_po_unique" ON "bill_purchase_order" USING btree ("bill_id","purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_cost_layer_fifo_idx" ON "inventory_cost_layer" USING btree ("organization_id","inventory_item_id","received_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_org_name_idx" ON "price_list" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_item_list_item_qty_idx" ON "price_list_item" USING btree ("price_list_id","inventory_item_id","min_quantity");--> statement-breakpoint
CREATE UNIQUE INDEX "project_billable_item_source_unique_idx" ON "project_billable_item" USING btree ("project_id","source_type","source_line_id");--> statement-breakpoint
ALTER TABLE "chart_account" ADD CONSTRAINT "chart_account_default_tax_rate_id_tax_rate_id_fk" FOREIGN KEY ("default_tax_rate_id") REFERENCES "public"."tax_rate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_linked_org_id_organization_id_fk" FOREIGN KEY ("linked_org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_take_line" ADD CONSTRAINT "stock_take_line_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_category_id_asset_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."asset_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_cwip_account_id_chart_account_id_fk" FOREIGN KEY ("cwip_account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_revaluation_reserve_account_id_chart_account_id_fk" FOREIGN KEY ("revaluation_reserve_account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_impairment_expense_account_id_chart_account_id_fk" FOREIGN KEY ("impairment_expense_account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;