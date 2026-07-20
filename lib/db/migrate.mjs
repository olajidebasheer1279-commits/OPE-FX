/**
 * Production migration runner — plain ESM, no TypeScript compilation needed.
 * Run with: node lib/db/migrate.mjs
 *
 * Uses drizzle-orm's built-in migrator which records applied migrations in the
 * "__drizzle_migrations" table, so it is safe to run on every deploy.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error("[migrate] ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

console.log("[migrate] Connecting to database…");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const db = drizzle(client);

console.log("[migrate] Applying migrations from", path.join(__dirname, "drizzle"));
await migrate(db, { migrationsFolder: path.join(__dirname, "drizzle") });

await client.end();
console.log("[migrate] All migrations applied successfully.");
