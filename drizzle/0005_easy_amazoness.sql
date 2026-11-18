ALTER TYPE "public"."expense_status" ADD VALUE 'founder_funded';--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "expense_claim_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_expense_claim_id_expense_claim_id_fk" FOREIGN KEY ("expense_claim_id") REFERENCES "public"."expense_claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_transaction_expense_claim_id_key" ON "bank_transaction" USING btree ("expense_claim_id");