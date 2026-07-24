import pg from "pg";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to validate the development database.");
  process.exit(1);
}

const requiredTables = ["accounts", "alerts", "alert_history", "trades"];
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const result = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [requiredTables],
  );
  const present = new Set(result.rows.map((row) => row.table_name));
  const missing = requiredTables.filter((table) => !present.has(table));

  if (missing.length > 0) {
    console.error(`Missing required database tables: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`Database setup validated: ${requiredTables.join(", ")}`);
  }
} finally {
  await client.end();
}