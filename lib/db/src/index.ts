import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL;

// Replit's internal Postgres uses sslmode=disable and is reachable only inside
// Replit's private network.  Every external host (Render, Supabase, Neon,
// Railway, etc.) requires SSL.  We detect which case we're in from the URL so
// the same code works in both environments without any env-var changes.
const needsSsl = !connectionString.includes("sslmode=disable");

export const pool = new Pool({
  connectionString,
  ...(needsSsl && { ssl: { rejectUnauthorized: false } }),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
