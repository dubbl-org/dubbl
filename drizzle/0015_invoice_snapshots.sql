ALTER TABLE "invoice" ADD COLUMN "sender_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "recipient_snapshot" jsonb;
