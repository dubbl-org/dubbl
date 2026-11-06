ALTER TABLE "invoice_line" ADD COLUMN "project_billing_kind" text;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "project_milestone_id" uuid;--> statement-breakpoint
-- Backfill: tag lines created by project progress invoicing before these columns existed.
UPDATE "invoice_line" il SET "project_billing_kind" = 'fixed'
FROM "invoice" i, "project" p
WHERE il."invoice_id" = i."id" AND il."project_id" = p."id" AND il."project_billing_kind" IS NULL
  AND i."reference" = 'Project: ' || p."name" AND il."description" LIKE '% of fixed price';--> statement-breakpoint
UPDATE "invoice_line" il SET "project_billing_kind" = 'milestone', "project_milestone_id" = m."id"
FROM "project_milestone" m
WHERE il."project_id" = m."project_id" AND il."project_billing_kind" IS NULL
  AND il."description" = 'Milestone: ' || m."title";
