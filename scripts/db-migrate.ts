/**
 * Apply committed Drizzle migrations to the database in DATABASE_URL.
 *
 * Safe to run on every deploy / merge:
 * - On a database that predates migrations (schema created via `drizzle-kit
 *   push`, no migration history), it ADOPTS it: the 0000 baseline is recorded
 *   as applied without running it, then each later migration is run one
 *   statement at a time, skipping statements whose change is already there
 *   (the database may have been pushed from newer code), and recorded.
 * - On a database with migration history, it just applies pending migrations.
 *
 * No secrets live in the repo: DATABASE_URL is read from the environment
 * (injected by CI/host). Uses only runtime deps (pg + drizzle-orm).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");
// A table that exists in any provisioned database — used to detect a DB that
// was created before migrations were adopted.
const SENTINEL_TABLE = "organization";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url, max: 1 });

  try {
    if (await needsAdoption(pool)) {
      await adoptPushedSchema(pool);
    }
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

/** True when the schema exists but Drizzle has no migration history (a pushed database). */
async function needsAdoption(pool: pg.Pool): Promise<boolean> {
  const schemaExists = await pool.query(
    `select to_regclass($1) as reg`,
    [`public.${SENTINEL_TABLE}`]
  );
  if (!schemaExists.rows[0]?.reg) {
    // Fresh database — let migrate() create everything from 0000.
    return false;
  }

  await pool.query(`create schema if not exists "drizzle"`);
  await pool.query(
    `create table if not exists "drizzle"."__drizzle_migrations" (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at bigint
     )`
  );

  const { rows } = await pool.query(
    `select count(*)::int as count from "drizzle"."__drizzle_migrations"`
  );
  // Migration history already present — nothing to adopt.
  return (rows[0]?.count ?? 0) === 0;
}

// "Already there" errors: the pushed schema already has this change.
// duplicate table/index, column, object (constraint, type, enum value),
// schema, function; and for drops: undefined table, column, object. (An enum
// value already renamed gives 22023, accepted for RENAME VALUE only.)
const ALREADY_APPLIED_CODES = new Set([
  "42P07", "42701", "42710", "42P06", "42723", "42P01", "42703", "42704",
]);

/**
 * Adopt a pushed database: the 0000 baseline is taken as applied (the tables
 * exist), then 0001+ run statement by statement, skipping the ones whose
 * change is already in the schema. Only when every file got through is the
 * history recorded (in drizzle's own format), so a failed run can simply be
 * run again after fixing the cause.
 */
async function adoptPushedSchema(pool: pg.Pool) {
  const [baseline, ...rest] = readJournal();
  if (!baseline) return;
  for (const entry of rest) {
    const statements = readMigration(entry)
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    let skipped = 0;
    for (const statement of statements) {
      try {
        await pool.query(statement);
      } catch (err) {
        const code = (err as { code?: string }).code;
        const renamedEnumValue =
          code === "22023" && /RENAME VALUE/i.test(statement);
        if (!renamedEnumValue && (!code || !ALREADY_APPLIED_CODES.has(code))) {
          throw new Error(
            `${entry.tag}: ${(err as Error).message}\n  in: ${statement.slice(0, 200)}`
          );
        }
        skipped++;
      }
    }
    console.log(
      `Checked ${entry.tag}` + (skipped ? ` (${skipped} change(s) already present)` : "")
    );
  }
  for (const entry of [baseline, ...rest]) await recordApplied(pool, entry);
  console.log(
    `Adopted existing schema: recorded ${rest.length + 1} migrations as applied.`
  );
}

type JournalEntry = { tag: string; when: number };

function readJournal(): JournalEntry[] {
  const journal = JSON.parse(
    fs.readFileSync(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")
  ) as { entries: JournalEntry[] };
  return journal.entries;
}

function readMigration(entry: JournalEntry) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf8");
}

/** Record a migration the way drizzle's migrator does (hash of the file). */
async function recordApplied(pool: pg.Pool, entry: JournalEntry) {
  const hash = crypto.createHash("sha256").update(readMigration(entry)).digest("hex");
  await pool.query(
    `insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values ($1, $2)`,
    [hash, entry.when]
  );
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
