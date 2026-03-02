/**
 * One-time migration script: convert decimal amounts to integer cents.
 * Run with: npx tsx lib/db/migrate-to-cents.ts
 *
 * This script:
 * 1. Reads all journal_line rows
 * 2. Converts debit_amount and credit_amount from decimal strings to integer cents
 * 3. Updates each row in place
 *
 * IMPORTANT: Back up your database before running this script.
 */
import { db } from "./index";
import { journalLine } from "./schema";
import { eq } from "drizzle-orm";
import { decimalToCents } from "../money";

async function migrate() {
  console.log("Starting decimal → integer cents migration...");

  const lines = await db.select().from(journalLine);
  console.log(`Found ${lines.length} journal lines to migrate.`);

  let updated = 0;
  for (const line of lines) {
    // Schema already uses integers — this script is only needed if migrating from decimal strings
    const debitCents = typeof line.debitAmount === "string" ? decimalToCents(line.debitAmount) : line.debitAmount;
    const creditCents = typeof line.creditAmount === "string" ? decimalToCents(line.creditAmount) : line.creditAmount;
    const exchangeRateInt = typeof line.exchangeRate === "string" ? Math.round(parseFloat(line.exchangeRate) * 1000000) : line.exchangeRate;

    await db
      .update(journalLine)
      .set({
        debitAmount: debitCents,
        creditAmount: creditCents,
        exchangeRate: exchangeRateInt,
      })
      .where(eq(journalLine.id, line.id));

    updated++;
    if (updated % 100 === 0) {
      console.log(`  Migrated ${updated}/${lines.length} lines...`);
    }
  }

  console.log(`Migration complete. Updated ${updated} lines.`);
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
