ALTER TABLE "payroll_settings" ALTER COLUMN "futa_wage_base_cents" SET DEFAULT 700000;--> statement-breakpoint
-- The old default was $700 (70000 cents); the FUTA wage base is $7,000.
UPDATE "payroll_settings" SET "futa_wage_base_cents" = 700000 WHERE "futa_wage_base_cents" = 70000;
