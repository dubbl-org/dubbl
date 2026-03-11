CREATE TYPE "public"."tax_period_status" AS ENUM('open', 'filed', 'amended');--> statement-breakpoint
CREATE TYPE "public"."tax_period_type" AS ENUM('monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."landed_cost_allocation_method" AS ENUM('by_value', 'by_quantity', 'by_weight', 'manual');--> statement-breakpoint
CREATE TYPE "public"."landed_cost_status" AS ENUM('draft', 'allocated');--> statement-breakpoint
CREATE TYPE "public"."requisition_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'converted');--> statement-breakpoint
CREATE TYPE "public"."serial_status" AS ENUM('available', 'sold', 'reserved', 'damaged');--> statement-breakpoint
CREATE TYPE "public"."tracking_method" AS ENUM('none', 'serial', 'lot', 'batch');--> statement-breakpoint
CREATE TYPE "public"."tax_form_status" AS ENUM('draft', 'generated', 'sent', 'filed', 'corrected');--> statement-breakpoint
CREATE TYPE "public"."tax_form_type" AS ENUM('1099_nec', '1099_misc', 'w2');--> statement-breakpoint
CREATE TYPE "public"."bulk_import_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "tax_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"type" "tax_period_type" NOT NULL,
	"status" "tax_period_status" DEFAULT 'open' NOT NULL,
	"filed_at" timestamp,
	"filed_by" uuid,
	"filed_reference" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_return_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tax_period_id" uuid NOT NULL,
	"box_number" text NOT NULL,
	"label" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"is_calculated" boolean DEFAULT true NOT NULL,
	"source_description" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landed_cost_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bill_id" uuid,
	"purchase_order_id" uuid,
	"allocation_method" "landed_cost_allocation_method" DEFAULT 'by_value' NOT NULL,
	"status" "landed_cost_status" DEFAULT 'draft' NOT NULL,
	"total_cost_amount" integer DEFAULT 0 NOT NULL,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"journal_entry_id" uuid,
	"allocated_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "landed_cost_component" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"account_id" uuid
);
--> statement-breakpoint
CREATE TABLE "landed_cost_line_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"purchase_order_line_id" uuid,
	"allocated_amount" integer DEFAULT 0 NOT NULL,
	"allocation_basis" integer
);
--> statement-breakpoint
CREATE TABLE "purchase_requisition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid,
	"requisition_number" text NOT NULL,
	"request_date" date NOT NULL,
	"required_date" date,
	"status" "requisition_status" DEFAULT 'draft' NOT NULL,
	"requested_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"reference" text,
	"notes" text,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"tax_total" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"converted_po_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "purchase_requisition_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requisition_id" uuid NOT NULL,
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
CREATE TABLE "lot_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"lot_number" text,
	"batch_number" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"available_quantity" integer DEFAULT 0 NOT NULL,
	"warehouse_id" uuid,
	"manufacturing_date" date,
	"expiry_date" date,
	"purchase_movement_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "movement_lot_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movement_id" uuid NOT NULL,
	"lot_batch_id" uuid NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movement_serial_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movement_id" uuid NOT NULL,
	"serial_number_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serial_number" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"serial_number" text NOT NULL,
	"status" serial_status DEFAULT 'available' NOT NULL,
	"warehouse_id" uuid,
	"purchase_movement_id" uuid,
	"sale_movement_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tax_form" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient_id" uuid NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_tax_id" text,
	"form_type" "tax_form_type" NOT NULL,
	"tax_year" integer NOT NULL,
	"form_data" jsonb,
	"pdf_file_key" text,
	"status" "tax_form_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_form_generation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tax_year" integer NOT NULL,
	"form_type" "tax_form_type" NOT NULL,
	"status" "tax_form_status" DEFAULT 'draft' NOT NULL,
	"generated_at" timestamp,
	"filed_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bulk_import_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" "bulk_import_status" DEFAULT 'pending' NOT NULL,
	"file_name" text NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"error_details" jsonb,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "mileage_rate" integer DEFAULT 67;--> statement-breakpoint
ALTER TABLE "credit_note_line" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "bill_line" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "debit_note_line" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "expense_item" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "expense_item" ADD COLUMN "is_mileage" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_item" ADD COLUMN "distance_miles" integer;--> statement-breakpoint
ALTER TABLE "expense_item" ADD COLUMN "mileage_rate" integer;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "tracking_method" "tracking_method" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_template_line" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "tax_period" ADD CONSTRAINT "tax_period_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_period" ADD CONSTRAINT "tax_period_filed_by_users_id_fk" FOREIGN KEY ("filed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_return_line" ADD CONSTRAINT "tax_return_line_tax_period_id_tax_period_id_fk" FOREIGN KEY ("tax_period_id") REFERENCES "public"."tax_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_allocation" ADD CONSTRAINT "landed_cost_allocation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_allocation" ADD CONSTRAINT "landed_cost_allocation_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_allocation" ADD CONSTRAINT "landed_cost_allocation_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_allocation" ADD CONSTRAINT "landed_cost_allocation_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_allocation" ADD CONSTRAINT "landed_cost_allocation_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_component" ADD CONSTRAINT "landed_cost_component_allocation_id_landed_cost_allocation_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."landed_cost_allocation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_component" ADD CONSTRAINT "landed_cost_component_account_id_chart_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_line_allocation" ADD CONSTRAINT "landed_cost_line_allocation_allocation_id_landed_cost_allocation_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."landed_cost_allocation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_line_allocation" ADD CONSTRAINT "landed_cost_line_allocation_component_id_landed_cost_component_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."landed_cost_component"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_line_allocation" ADD CONSTRAINT "landed_cost_line_allocation_purchase_order_line_id_purchase_order_line_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition" ADD CONSTRAINT "purchase_requisition_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition" ADD CONSTRAINT "purchase_requisition_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition" ADD CONSTRAINT "purchase_requisition_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition" ADD CONSTRAINT "purchase_requisition_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_line" ADD CONSTRAINT "purchase_requisition_line_requisition_id_purchase_requisition_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."purchase_requisition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_line" ADD CONSTRAINT "purchase_requisition_line_account_id_chart_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_line" ADD CONSTRAINT "purchase_requisition_line_tax_rate_id_tax_rate_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_batch" ADD CONSTRAINT "lot_batch_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_batch" ADD CONSTRAINT "lot_batch_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_batch" ADD CONSTRAINT "lot_batch_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_batch" ADD CONSTRAINT "lot_batch_purchase_movement_id_inventory_movement_id_fk" FOREIGN KEY ("purchase_movement_id") REFERENCES "public"."inventory_movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_lot_assignment" ADD CONSTRAINT "movement_lot_assignment_movement_id_inventory_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_lot_assignment" ADD CONSTRAINT "movement_lot_assignment_lot_batch_id_lot_batch_id_fk" FOREIGN KEY ("lot_batch_id") REFERENCES "public"."lot_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_serial_assignment" ADD CONSTRAINT "movement_serial_assignment_movement_id_inventory_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_serial_assignment" ADD CONSTRAINT "movement_serial_assignment_serial_number_id_serial_number_id_fk" FOREIGN KEY ("serial_number_id") REFERENCES "public"."serial_number"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_number" ADD CONSTRAINT "serial_number_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_number" ADD CONSTRAINT "serial_number_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_number" ADD CONSTRAINT "serial_number_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_number" ADD CONSTRAINT "serial_number_purchase_movement_id_inventory_movement_id_fk" FOREIGN KEY ("purchase_movement_id") REFERENCES "public"."inventory_movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_number" ADD CONSTRAINT "serial_number_sale_movement_id_inventory_movement_id_fk" FOREIGN KEY ("sale_movement_id") REFERENCES "public"."inventory_movement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_form" ADD CONSTRAINT "tax_form_generation_id_tax_form_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."tax_form_generation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_form_generation" ADD CONSTRAINT "tax_form_generation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_form_generation" ADD CONSTRAINT "tax_form_generation_created_by_member_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_import_job" ADD CONSTRAINT "bulk_import_job_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_import_job" ADD CONSTRAINT "bulk_import_job_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "serial_number_org_item_serial_idx" ON "serial_number" USING btree ("organization_id","inventory_item_id","serial_number");--> statement-breakpoint
ALTER TABLE "credit_note_line" ADD CONSTRAINT "credit_note_line_cost_center_id_cost_center_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_cost_center_id_cost_center_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_cost_center_id_cost_center_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_cost_center_id_cost_center_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note_line" ADD CONSTRAINT "debit_note_line_cost_center_id_cost_center_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_cost_center_id_cost_center_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_item" ADD CONSTRAINT "expense_item_cost_center_id_cost_center_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_template_line" ADD CONSTRAINT "recurring_template_line_cost_center_id_cost_center_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_center"("id") ON DELETE no action ON UPDATE no action;