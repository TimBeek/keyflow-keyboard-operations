import postgres from "postgres";
import { readFile } from "node:fs/promises";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL ontbreekt.");
  process.exit(1);
}

const migrationPath = path.resolve("db/migrations/0001_inventory_core.sql");
const migration = await readFile(migrationPath, "utf8");
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
});

try {
  await sql.unsafe(migration);
  console.log("Migratie 0001_inventory_core.sql is uitgevoerd.");
} finally {
  await sql.end();
}
