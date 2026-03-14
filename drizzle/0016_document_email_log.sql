CREATE TABLE IF NOT EXISTS "document_email_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "document_type" text NOT NULL,
  "document_id" uuid NOT NULL,
  "recipient_email" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "attach_pdf" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL,
  "error_message" text,
  "sent_by" uuid REFERENCES "user"("id"),
  "sent_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "document_email_log_org_idx" ON "document_email_log" ("organization_id");
CREATE INDEX IF NOT EXISTS "document_email_log_doc_idx" ON "document_email_log" ("document_type", "document_id");
