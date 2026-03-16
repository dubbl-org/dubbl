import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  query_timeout: 30_000,
});

// Prevent process crash on idle connection errors (e.g. Neon auto-suspend).
// node-postgres automatically removes the dead client and reconnects on next query.
pool.on("error", (err) => {
  console.error("Unexpected pool client error:", err.message);
});

export const db = drizzle(pool, { schema });
