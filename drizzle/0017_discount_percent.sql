ALTER TABLE "invoice_line" ADD COLUMN "discount_percent" integer NOT NULL DEFAULT 0;
ALTER TABLE "quote_line" ADD COLUMN "discount_percent" integer NOT NULL DEFAULT 0;
ALTER TABLE "credit_note_line" ADD COLUMN "discount_percent" integer NOT NULL DEFAULT 0;
ALTER TABLE "bill_line" ADD COLUMN "discount_percent" integer NOT NULL DEFAULT 0;
ALTER TABLE "recurring_template_line" ADD COLUMN "discount_percent" integer NOT NULL DEFAULT 0;
