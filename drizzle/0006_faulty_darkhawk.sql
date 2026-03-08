CREATE TABLE "budget_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_line_id" uuid NOT NULL,
	"label" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget" ADD COLUMN "period_type" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_period" ADD CONSTRAINT "budget_period_budget_line_id_budget_line_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."budget_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Migrate existing monthly data into budget_period rows
INSERT INTO "budget_period" ("budget_line_id", "label", "start_date", "end_date", "amount", "sort_order")
SELECT bl.id, 'Jan ' || EXTRACT(YEAR FROM b.created_at)::text,
  b.start_date,
  TO_CHAR((DATE(b.start_date) + INTERVAL '1 month' - INTERVAL '1 day'), 'YYYY-MM-DD'),
  bl.jan, 0
FROM budget_line bl JOIN budget b ON bl.budget_id = b.id WHERE bl.jan != 0;
--> statement-breakpoint
INSERT INTO "budget_period" ("budget_line_id", "label", "start_date", "end_date", "amount", "sort_order")
SELECT bl.id, 'Feb ' || EXTRACT(YEAR FROM b.created_at)::text,
  TO_CHAR((DATE(b.start_date) + INTERVAL '1 month'), 'YYYY-MM-DD'),
  TO_CHAR((DATE(b.start_date) + INTERVAL '2 months' - INTERVAL '1 day'), 'YYYY-MM-DD'),
  bl.feb, 1
FROM budget_line bl JOIN budget b ON bl.budget_id = b.id WHERE bl.feb != 0;
--> statement-breakpoint
INSERT INTO "budget_period" ("budget_line_id", "label", "start_date", "end_date", "amount", "sort_order")
SELECT bl.id, 'Mar ' || EXTRACT(YEAR FROM b.created_at)::text,
  TO_CHAR((DATE(b.start_date) + INTERVAL '2 months'), 'YYYY-MM-DD'),
  TO_CHAR((DATE(b.start_date) + INTERVAL '3 months' - INTERVAL '1 day'), 'YYYY-MM-DD'),
  bl.mar, 2
FROM budget_line bl JOIN budget b ON bl.budget_id = b.id WHERE bl.mar != 0;
--> statement-breakpoint
INSERT INTO "budget_period" ("budget_line_id", "label", "start_date", "end_date", "amount", "sort_order")
SELECT bl.id, 'Apr ' || EXTRACT(YEAR FROM b.created_at)::text,
  TO_CHAR((DATE(b.start_date) + INTERVAL '3 months'), 'YYYY-MM-DD'),
  TO_CHAR((DATE(b.start_date) + INTERVAL '4 months' - INTERVAL '1 day'), 'YYYY-MM-DD'),
  bl.apr, 3
FROM budget_line bl JOIN budget b ON bl.budget_id = b.id WHERE bl.apr != 0;
--> statement-breakpoint
INSERT INTO "budget_period" ("budget_line_id", "label", "start_date", "end_date", "amount", "sort_order")
SELECT bl.id, 'May ' || EXTRACT(YEAR FROM b.created_at)::text,
  TO_CHAR((DATE(b.start_date) + INTERVAL '4 months'), 'YYYY-MM-DD'),
  TO_CHAR((DATE(b.start_date) + INTERVAL '5 months' - INTERVAL '1 day'), 'YYYY-MM-DD'),
  bl.may, 4
FROM budget_line bl JOIN budget b ON bl.budget_id = b.id WHERE bl.may != 0;
--> statement-breakpoint
INSERT INTO "budget_period" ("budget_line_id", "label", "start_date", "end_date", "amount", "sort_order")
SELECT bl.id, 'Jun ' || EXTRACT(YEAR FROM b.created_at)::text,
  TO_CHAR((DATE(b.start_date) + INTERVAL '5 months'), 'YYYY-MM-DD'),
  TO_CHAR((DATE(b.start_date) + INTERVAL '6 months' - INTERVAL '1 day'), 'YYYY-MM-DD'),
  bl.jun, 5
FROM budget_line bl JOIN budget b ON bl.budget_id = b.id WHERE bl.jun != 0;
--> statement-breakpoint
INSERT INTO "budget_period" ("budget_line_id", "label", "start_date", "end_date", "amount", "sort_order")
SELECT bl.id, 'Jul ' || EXTRACT(YEAR FROM b.created_at)::text,
  TO_CHAR((DATE(b.start_date) + INTERVAL '6 months'), 'YYYY-MM-DD'),
  TO_CHAR((DATE(b.start_date) + INTERVAL '7 months' - INTERVAL '1 day'), 'YYYY-MM-DD'),
  bl.jul, 6
FROM budget_line bl JOIN budget b ON bl.budget_id = b.id WHERE bl.jul != 0;
--> statement-breakpoint
INSERT INTO "budget_period" ("budget_line_id", "label", "start_date", "end_date", "amount", "sort_order")
SELECT bl.id, 'Aug ' || EXTRACT(YEAR FROM b.created_at)::text,
  TO_CHAR((DATE(b.start_date) + INTERVAL '7 months'), 'YYYY-MM-DD'),
  TO_CHAR((DATE(b.start_date) + INTERVAL '8 months' - INTERVAL '1 day'), 'YYYY-MM-DD'),
  bl.aug, 7
FROM budget_line bl JOIN budget b ON bl.budget_id = b.id WHERE bl.aug != 0;
--> statement-breakpoint
INSERT INTO "budget_period" ("budget_line_id", "label", "start_date", "end_date", "amount", "sort_order")
SELECT bl.id, 'Sep ' || EXTRACT(YEAR FROM b.created_at)::text,
  TO_CHAR((DATE(b.start_date) + INTERVAL '8 months'), 'YYYY-MM-DD'),
  TO_CHAR((DATE(b.start_date) + INTERVAL '9 months' - INTERVAL '1 day'), 'YYYY-MM-DD'),
  bl.sep, 8
FROM budget_line bl JOIN budget b ON bl.budget_id = b.id WHERE bl.sep != 0;
--> statement-breakpoint
INSERT INTO "budget_period" ("budget_line_id", "label", "start_date", "end_date", "amount", "sort_order")
SELECT bl.id, 'Oct ' || EXTRACT(YEAR FROM b.created_at)::text,
  TO_CHAR((DATE(b.start_date) + INTERVAL '9 months'), 'YYYY-MM-DD'),
  TO_CHAR((DATE(b.start_date) + INTERVAL '10 months' - INTERVAL '1 day'), 'YYYY-MM-DD'),
  bl.oct, 9
FROM budget_line bl JOIN budget b ON bl.budget_id = b.id WHERE bl.oct != 0;
--> statement-breakpoint
INSERT INTO "budget_period" ("budget_line_id", "label", "start_date", "end_date", "amount", "sort_order")
SELECT bl.id, 'Nov ' || EXTRACT(YEAR FROM b.created_at)::text,
  TO_CHAR((DATE(b.start_date) + INTERVAL '10 months'), 'YYYY-MM-DD'),
  TO_CHAR((DATE(b.start_date) + INTERVAL '11 months' - INTERVAL '1 day'), 'YYYY-MM-DD'),
  bl.nov, 10
FROM budget_line bl JOIN budget b ON bl.budget_id = b.id WHERE bl.nov != 0;
--> statement-breakpoint
INSERT INTO "budget_period" ("budget_line_id", "label", "start_date", "end_date", "amount", "sort_order")
SELECT bl.id, 'Dec ' || EXTRACT(YEAR FROM b.created_at)::text,
  TO_CHAR((DATE(b.start_date) + INTERVAL '11 months'), 'YYYY-MM-DD'),
  TO_CHAR((DATE(b.start_date) + INTERVAL '12 months' - INTERVAL '1 day'), 'YYYY-MM-DD'),
  bl.dec, 11
FROM budget_line bl JOIN budget b ON bl.budget_id = b.id WHERE bl.dec != 0;
--> statement-breakpoint

ALTER TABLE "budget_line" DROP COLUMN "jan";--> statement-breakpoint
ALTER TABLE "budget_line" DROP COLUMN "feb";--> statement-breakpoint
ALTER TABLE "budget_line" DROP COLUMN "mar";--> statement-breakpoint
ALTER TABLE "budget_line" DROP COLUMN "apr";--> statement-breakpoint
ALTER TABLE "budget_line" DROP COLUMN "may";--> statement-breakpoint
ALTER TABLE "budget_line" DROP COLUMN "jun";--> statement-breakpoint
ALTER TABLE "budget_line" DROP COLUMN "jul";--> statement-breakpoint
ALTER TABLE "budget_line" DROP COLUMN "aug";--> statement-breakpoint
ALTER TABLE "budget_line" DROP COLUMN "sep";--> statement-breakpoint
ALTER TABLE "budget_line" DROP COLUMN "oct";--> statement-breakpoint
ALTER TABLE "budget_line" DROP COLUMN "nov";--> statement-breakpoint
ALTER TABLE "budget_line" DROP COLUMN "dec";
