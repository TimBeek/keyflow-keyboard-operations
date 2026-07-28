import postgres from "postgres";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL ontbreekt.");
  process.exit(1);
}

const migrationDirectory = path.resolve("db/migrations");
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
});

try {
  await sql`
    create table if not exists schema_migrations (
      name text primary key,
      sha256 text not null,
      applied_at timestamptz not null default now()
    )
  `;

  const files = (await readdir(migrationDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  for (const file of files) {
    const migration = await readFile(path.join(migrationDirectory, file), "utf8");
    const sha256 = createHash("sha256").update(migration).digest("hex");
    const [applied] = await sql`
      select sha256 from schema_migrations where name = ${file}
    `;

    if (applied) {
      if (applied.sha256 !== sha256) {
        throw new Error(`Eerder uitgevoerde migratie ${file} is gewijzigd.`);
      }
      console.log(`Overgeslagen: ${file}`);
      continue;
    }

    await sql.begin(async (transaction) => {
      await transaction.unsafe(migration);
      await transaction`
        insert into schema_migrations (name, sha256)
        values (${file}, ${sha256})
      `;
    });
    console.log(`Uitgevoerd: ${file}`);
  }
} finally {
  await sql.end();
}
