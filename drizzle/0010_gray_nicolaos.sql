CREATE TYPE "public"."accrual_method" AS ENUM('per_pay_period', 'monthly', 'annually', 'front_loaded');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."bonus_type" AS ENUM('performance', 'signing', 'referral', 'holiday', 'spot', 'retention', 'other');--> statement-breakpoint
CREATE TYPE "public"."compensation_review_status" AS ENUM('draft', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."contractor_payment_status" AS ENUM('pending', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."deduction_category" AS ENUM('pre_tax', 'post_tax');--> statement-breakpoint
CREATE TYPE "public"."deduction_timing" AS ENUM('recurring', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."filing_status" AS ENUM('single', 'married_joint', 'married_separate', 'head_of_household');--> statement-breakpoint
CREATE TYPE "public"."leave_request_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('vacation', 'sick', 'personal', 'parental', 'bereavement', 'unpaid', 'other');--> statement-breakpoint
CREATE TYPE "public"."payslip_status" AS ENUM('generated', 'sent', 'viewed');--> statement-breakpoint
CREATE TYPE "public"."run_type" AS ENUM('regular', 'off_cycle', 'termination', 'bonus_only', 'correction');--> statement-breakpoint
CREATE TYPE "public"."shift_type" AS ENUM('regular', 'overtime', 'night', 'weekend', 'holiday');--> statement-breakpoint
CREATE TYPE "public"."tax_jurisdiction_level" AS ENUM('federal', 'state', 'local');--> statement-breakpoint
CREATE TYPE "public"."timesheet_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."payroll_run_status" ADD VALUE 'pending_approval';--> statement-breakpoint
CREATE TABLE "approval_chain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "approval_chain_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"approver_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"step_id" uuid,
	"approver_id" uuid NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"comment" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compensation_band" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"level" text,
	"min_salary" integer NOT NULL,
	"mid_salary" integer NOT NULL,
	"max_salary" integer NOT NULL,
	"currency" text DEFAULT 'USD',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "compensation_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"effective_date" date NOT NULL,
	"status" "compensation_review_status" DEFAULT 'draft' NOT NULL,
	"total_budget" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "compensation_review_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"current_salary" integer NOT NULL,
	"proposed_salary" integer NOT NULL,
	"adjustment_percent" real,
	"reason" text,
	"approved" boolean
);
--> statement-breakpoint
CREATE TABLE "contractor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"company" text,
	"tax_id" text,
	"hourly_rate" integer,
	"currency" text DEFAULT 'USD',
	"bank_account_number" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "contractor_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contractor_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'USD',
	"description" text,
	"invoice_number" text,
	"period_start" date,
	"period_end" date,
	"status" "contractor_payment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"journal_entry_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deduction_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" "deduction_category" DEFAULT 'post_tax' NOT NULL,
	"default_amount" integer,
	"default_percent" real,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "employee_deduction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"deduction_type_id" uuid NOT NULL,
	"timing" "deduction_timing" DEFAULT 'recurring' NOT NULL,
	"amount" integer,
	"percent" real,
	"start_date" date,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "employee_leave_balance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"balance" real DEFAULT 0 NOT NULL,
	"used_hours" real DEFAULT 0 NOT NULL,
	"year" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date
);
--> statement-breakpoint
CREATE TABLE "employee_tax_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"filing_status" "filing_status" DEFAULT 'single' NOT NULL,
	"federal_allowances" integer DEFAULT 0 NOT NULL,
	"state_allowances" integer DEFAULT 0 NOT NULL,
	"additional_withholding" integer DEFAULT 0,
	"exempt" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employee_tax_config_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "leave_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"leave_type" "leave_type" NOT NULL,
	"accrual_method" "accrual_method" DEFAULT 'per_pay_period' NOT NULL,
	"accrual_rate" real DEFAULT 0 NOT NULL,
	"max_balance" real,
	"carry_over_max" real,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "leave_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"hours" real NOT NULL,
	"reason" text,
	"status" "leave_request_status" DEFAULT 'pending' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_bonus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"bonus_type" "bonus_type" NOT NULL,
	"amount" integer NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_item_deduction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_item_id" uuid NOT NULL,
	"deduction_type_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"category" "deduction_category" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_item_overtime" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_item_id" uuid NOT NULL,
	"regular_hours" real NOT NULL,
	"overtime_hours" real NOT NULL,
	"overtime_multiplier" real DEFAULT 1.5 NOT NULL,
	"regular_amount" integer NOT NULL,
	"overtime_amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"default_tax_rate" integer DEFAULT 2000 NOT NULL,
	"overtime_threshold_hours" real DEFAULT 40 NOT NULL,
	"overtime_multiplier" real DEFAULT 1.5 NOT NULL,
	"default_currency" text DEFAULT 'USD' NOT NULL,
	"salary_expense_account_code" text DEFAULT '5100',
	"tax_payable_account_code" text DEFAULT '2200',
	"bank_account_code" text DEFAULT '1100',
	"auto_approval_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_settings_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "payslip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"payroll_item_id" uuid NOT NULL,
	"status" "payslip_status" DEFAULT 'generated' NOT NULL,
	"gross_amount" integer NOT NULL,
	"net_amount" integer NOT NULL,
	"tax_amount" integer NOT NULL,
	"deductions_breakdown" jsonb,
	"ytd_gross" integer DEFAULT 0 NOT NULL,
	"ytd_net" integer DEFAULT 0 NOT NULL,
	"ytd_tax" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"viewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "shift_definition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"shift_type" "shift_type" DEFAULT 'regular' NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"premium_percent" real DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tax_bracket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"jurisdiction_level" "tax_jurisdiction_level" DEFAULT 'federal' NOT NULL,
	"jurisdiction" text,
	"min_income" integer NOT NULL,
	"max_income" integer,
	"rate" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "timesheet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" timesheet_status DEFAULT 'draft' NOT NULL,
	"total_hours" real DEFAULT 0 NOT NULL,
	"submitted_at" timestamp,
	"approved_by" uuid,
	"approved_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "timesheet_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timesheet_id" uuid NOT NULL,
	"date" date NOT NULL,
	"hours" real NOT NULL,
	"shift_type" "shift_type" DEFAULT 'regular' NOT NULL,
	"description" text,
	"project_id" uuid
);
--> statement-breakpoint
ALTER TABLE "payroll_employee" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "payroll_employee" ADD COLUMN "termination_date" date;--> statement-breakpoint
ALTER TABLE "payroll_employee" ADD COLUMN "termination_reason" text;--> statement-breakpoint
ALTER TABLE "payroll_employee" ADD COLUMN "pto_balance_hours" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_employee" ADD COLUMN "currency" text DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "payroll_employee" ADD COLUMN "compensation_band_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_item" ADD COLUMN "overtime_hours" real;--> statement-breakpoint
ALTER TABLE "payroll_item" ADD COLUMN "overtime_amount" integer;--> statement-breakpoint
ALTER TABLE "payroll_item" ADD COLUMN "bonus_amount" integer;--> statement-breakpoint
ALTER TABLE "payroll_item" ADD COLUMN "pre_tax_deductions" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "payroll_item" ADD COLUMN "post_tax_deductions" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "payroll_item" ADD COLUMN "timesheet_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_item" ADD COLUMN "currency" text DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "payroll_item" ADD COLUMN "fx_rate" real DEFAULT 1;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD COLUMN "run_type" "run_type" DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD COLUMN "parent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD COLUMN "approval_status" "approval_status";--> statement-breakpoint
ALTER TABLE "payroll_run" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "approval_chain" ADD CONSTRAINT "approval_chain_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_chain_step" ADD CONSTRAINT "approval_chain_step_chain_id_approval_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."approval_chain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_chain_step" ADD CONSTRAINT "approval_chain_step_approver_id_member_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_record" ADD CONSTRAINT "approval_record_payroll_run_id_payroll_run_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_record" ADD CONSTRAINT "approval_record_step_id_approval_chain_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."approval_chain_step"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_record" ADD CONSTRAINT "approval_record_approver_id_member_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_band" ADD CONSTRAINT "compensation_band_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_review" ADD CONSTRAINT "compensation_review_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_review_entry" ADD CONSTRAINT "compensation_review_entry_review_id_compensation_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."compensation_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_review_entry" ADD CONSTRAINT "compensation_review_entry_employee_id_payroll_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor" ADD CONSTRAINT "contractor_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_payment" ADD CONSTRAINT "contractor_payment_contractor_id_contractor_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_payment" ADD CONSTRAINT "contractor_payment_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deduction_type" ADD CONSTRAINT "deduction_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_deduction" ADD CONSTRAINT "employee_deduction_employee_id_payroll_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_deduction" ADD CONSTRAINT "employee_deduction_deduction_type_id_deduction_type_id_fk" FOREIGN KEY ("deduction_type_id") REFERENCES "public"."deduction_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_leave_balance" ADD CONSTRAINT "employee_leave_balance_employee_id_payroll_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_leave_balance" ADD CONSTRAINT "employee_leave_balance_policy_id_leave_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."leave_policy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_schedule" ADD CONSTRAINT "employee_schedule_employee_id_payroll_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_schedule" ADD CONSTRAINT "employee_schedule_shift_id_shift_definition_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift_definition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_tax_config" ADD CONSTRAINT "employee_tax_config_employee_id_payroll_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_policy" ADD CONSTRAINT "leave_policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_employee_id_payroll_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_policy_id_leave_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."leave_policy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_approved_by_member_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_bonus" ADD CONSTRAINT "payroll_bonus_payroll_run_id_payroll_run_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_bonus" ADD CONSTRAINT "payroll_bonus_employee_id_payroll_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_item_deduction" ADD CONSTRAINT "payroll_item_deduction_payroll_item_id_payroll_item_id_fk" FOREIGN KEY ("payroll_item_id") REFERENCES "public"."payroll_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_item_deduction" ADD CONSTRAINT "payroll_item_deduction_deduction_type_id_deduction_type_id_fk" FOREIGN KEY ("deduction_type_id") REFERENCES "public"."deduction_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_item_overtime" ADD CONSTRAINT "payroll_item_overtime_payroll_item_id_payroll_item_id_fk" FOREIGN KEY ("payroll_item_id") REFERENCES "public"."payroll_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_payroll_run_id_payroll_run_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_employee_id_payroll_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_payroll_item_id_payroll_item_id_fk" FOREIGN KEY ("payroll_item_id") REFERENCES "public"."payroll_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_definition" ADD CONSTRAINT "shift_definition_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_bracket" ADD CONSTRAINT "tax_bracket_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet" ADD CONSTRAINT "timesheet_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet" ADD CONSTRAINT "timesheet_employee_id_payroll_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet" ADD CONSTRAINT "timesheet_approved_by_member_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entry" ADD CONSTRAINT "timesheet_entry_timesheet_id_timesheet_id_fk" FOREIGN KEY ("timesheet_id") REFERENCES "public"."timesheet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entry" ADD CONSTRAINT "timesheet_entry_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_approved_by_member_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;