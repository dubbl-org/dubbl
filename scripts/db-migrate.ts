/**
 * Apply committed Drizzle migrations to the database in DATABASE_URL.
 *
 * Safe to run on every deploy / merge:
 * - On a database that predates migrations (schema created via `drizzle-kit
 *   push`, no migration history), it ADOPTS the 0000 baseline — recording it
 *   as already-applied without re-running it — then applies 0001+ normally.
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
    await adoptBaselineIfNeeded(pool);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

/**
 * If the schema already exists but Drizzle has no migration history, record the
 * baseline (0000) migration as applied so `migrate()` skips it and only runs
 * newer migrations. Mirrors drizzle's own tracking format exactly.
 */
async function adoptBaselineIfNeeded(pool: pg.Pool) {
  const schemaExists = await pool.query(
    `select to_regclass($1) as reg`,
    [`public.${SENTINEL_TABLE}`]
  );
  if (!schemaExists.rows[0]?.reg) {
    // Fresh database — let migrate() create everything from 0000.
    return;
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
  if ((rows[0]?.count ?? 0) > 0) {
    // Migration history already present — nothing to adopt.
    return;
  }

  const journal = JSON.parse(
    fs.readFileSync(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")
  ) as { entries: { tag: string; when: number }[] };

  const baseline = journal.entries[0];
  if (!baseline) return;

  const sql = fs.readFileSync(
    path.join(MIGRATIONS_DIR, `${baseline.tag}.sql`),
    "utf8"
  );
  const hash = crypto.createHash("sha256").update(sql).digest("hex");

  await pool.query(
    `insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values ($1, $2)`,
    [hash, baseline.when]
  );
  console.log(
    `Adopted existing schema: recorded baseline ${baseline.tag} as applied.`
  );
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
