import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
});

// Retry connection on Neon cold-start failures
const originalConnect = pool.connect.bind(pool);
pool.connect = async function retryConnect() {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await originalConnect();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  return originalConnect();
} as typeof pool.connect;

export const db = drizzle(pool, { schema });
