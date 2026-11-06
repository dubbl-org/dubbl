ALTER TABLE "employee_tax_config" ADD COLUMN "additional_state_withholding" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_tax_config" ADD COLUMN "state_code" text;--> statement-breakpoint
ALTER TABLE "employee_tax_config" ADD COLUMN "local_code" text;