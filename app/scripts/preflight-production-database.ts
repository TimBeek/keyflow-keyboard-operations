import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { loadProductionSource } from "./lib/production-source";

async function main() {
const databaseUrl = process.env.DATABASE_URL;
const actorId = process.env.KEYFLOW_IMPORT_ACTOR_ID;
if (!databaseUrl) throw new Error("DATABASE_URL ontbreekt.");
if (!actorId) throw new Error("KEYFLOW_IMPORT_ACTOR_ID ontbreekt.");

const plan = await loadProductionSource();
const sql = postgres(databaseUrl, {
  max: 1,
  ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
});

try {
  const [database] = await sql<{
    database_name: string;
    server_version: string;
    timezone: string;
  }[]>`
    select
      current_database() as database_name,
      current_setting('server_version') as server_version,
      current_setting('TimeZone') as timezone
  `;
  if (!database) throw new Error("Databaseverbinding leverde geen status op.");

  const migrationDirectory = path.resolve("db/migrations");
  const files = (await readdir(migrationDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
  const appliedMigrations = await sql<{ name: string; sha256: string }[]>`
    select name, sha256 from schema_migrations
  `;
  const appliedByName = new Map(
    appliedMigrations.map((migration) => [migration.name, migration.sha256]),
  );

  for (const file of files) {
    const expectedHash = createHash("sha256")
      .update(await readFile(path.join(migrationDirectory, file), "utf8"))
      .digest("hex");
    const appliedHash = appliedByName.get(file);
    if (!appliedHash) throw new Error(`Migratie ${file} is niet uitgevoerd.`);
    if (appliedHash !== expectedHash) {
      throw new Error(`Checksum van uitgevoerde migratie ${file} wijkt af.`);
    }
  }

  const [authorizedActor] = await sql<{ display_name: string; email: string }[]>`
    select actor.display_name, actor.email
    from users actor
    inner join user_roles user_role on user_role.user_id = actor.id
    inner join role_permissions role_permission
      on role_permission.role_code = user_role.role_code
    where actor.id = ${actorId}::uuid
      and actor.active = true
      and role_permission.permission_code = 'imports.manage'
    limit 1
  `;
  if (!authorizedActor) {
    throw new Error("Importgebruiker is niet actief of mist imports.manage.");
  }

  const [existing] = await sql<{
    snapshots: number;
    skus: number;
    balances: number;
    transactions: number;
  }[]>`
    select
      (select count(*)::int from inventory_source_snapshots) as snapshots,
      (select count(*)::int from sticker_skus) as skus,
      (select count(*)::int from inventory_balances) as balances,
      (select count(*)::int from inventory_transactions) as transactions
  `;
  const [sameSource] = await sql<{ id: string; status: string }[]>`
    select id, status
    from inventory_source_snapshots
    where source_sha256 = ${plan.metadata.sha256}
  `;

  const emptyInventory = existing
    && existing.snapshots === 0
    && existing.skus === 0
    && existing.balances === 0
    && existing.transactions === 0;
  const alreadyApplied = sameSource?.status === "applied";
  if (!emptyInventory && !alreadyApplied) {
    throw new Error(
      "Database bevat bestaande voorraad die niet bij deze bron hoort; bootstrap is geblokkeerd.",
    );
  }

  console.log("Productiedatabase-preflight geslaagd.");
  console.table({
    database: database.database_name,
    PostgreSQL: database.server_version,
    timezone: database.timezone,
    migrations: `${files.length}/${files.length}`,
    importActor: `${authorizedActor.display_name} <${authorizedActor.email}>`,
    inventoryState: alreadyApplied ? "bron al toegepast" : "leeg en klaar voor bootstrap",
    sourceSha256: plan.metadata.sha256,
  });
} finally {
  await sql.end();
}
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
