import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import {
  loadProductionSource,
  productionPlanSummary,
} from "./lib/production-source";

async function main() {
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL ontbreekt.");

const plan = await loadProductionSource();
const expected = productionPlanSummary(plan);
const sql = postgres(databaseUrl, {
  max: 1,
  ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
});

const failures: string[] = [];
function check(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

try {
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
    check(appliedByName.get(file) === expectedHash, `Migratie ${file} ontbreekt of wijkt af.`);
  }

  const [snapshot] = await sql<{
    id: string;
    row_count: number;
    total_quantity: number;
    status: string;
    applied_at: Date | null;
  }[]>`
    select id, row_count, total_quantity, status, applied_at
    from inventory_source_snapshots
    where source_sha256 = ${plan.metadata.sha256}
  `;
  check(Boolean(snapshot), "De verwachte bronsnapshot ontbreekt.");
  if (!snapshot) throw new Error(failures.join(" "));

  check(snapshot.status === "applied", "Bronsnapshot heeft niet de status applied.");
  check(Boolean(snapshot.applied_at), "Bronsnapshot mist applied_at.");
  check(snapshot.row_count === expected.sourceRows, "Snapshot heeft een onjuist regelaantal.");
  check(
    snapshot.total_quantity === expected.sourceQuantity,
    "Snapshot heeft een onjuist brontotaal.",
  );

  const [sourceRows] = await sql<{
    row_count: number;
    source_quantity: number;
    ready_rows: number;
    blocked_rows: number;
    linked_ready_rows: number;
    linked_blocked_rows: number;
  }[]>`
    select
      count(*)::int as row_count,
      coalesce(sum(opening_quantity), 0)::int as source_quantity,
      count(*) filter (where data_quality = 'ready')::int as ready_rows,
      count(*) filter (where data_quality = 'blocked')::int as blocked_rows,
      count(*) filter (
        where data_quality = 'ready' and sku_id is not null
      )::int as linked_ready_rows,
      count(*) filter (
        where data_quality = 'blocked' and sku_id is not null
      )::int as linked_blocked_rows
    from inventory_source_rows
    where snapshot_id = ${snapshot.id}::uuid
  `;
  check(sourceRows?.row_count === expected.sourceRows, "Niet alle bronregels zijn vastgelegd.");
  check(
    sourceRows?.source_quantity === expected.sourceQuantity,
    "Vastgelegde bronhoeveelheid wijkt af.",
  );
  check(sourceRows?.ready_rows === expected.operationalRows, "Aantal ready-regels wijkt af.");
  check(sourceRows?.blocked_rows === expected.blockedRows, "Aantal blocked-regels wijkt af.");
  check(
    sourceRows?.linked_ready_rows === expected.operationalRows,
    "Niet alle ready-regels zijn aan een SKU gekoppeld.",
  );
  check(sourceRows?.linked_blocked_rows === 0, "Een blocked-regel is toch aan een SKU gekoppeld.");

  const [inventory] = await sql<{
    sku_count: number;
    balance_count: number;
    on_hand: number;
    hanging_file_mismatches: number;
  }[]>`
    select
      count(distinct source.sku_id)::int as sku_count,
      count(balance.sku_id)::int as balance_count,
      coalesce(sum(balance.on_hand), 0)::int as on_hand,
      count(*) filter (
        where sku.hanging_file_number <> source.hanging_file_number
      )::int as hanging_file_mismatches
    from inventory_source_rows source
    left join sticker_skus sku on sku.id = source.sku_id
    left join locations location on location.code = 'HANGMAPPENWAGEN'
    left join inventory_balances balance
      on balance.sku_id = source.sku_id
      and balance.location_id = location.id
    where source.snapshot_id = ${snapshot.id}::uuid
      and source.data_quality = 'ready'
  `;
  check(inventory?.sku_count === expected.operationalRows, "Operationeel SKU-aantal wijkt af.");
  check(
    inventory?.balance_count === expected.operationalRows,
    "Niet iedere operationele SKU heeft een hangmappenbalans.",
  );
  check(
    inventory?.on_hand === expected.operationalQuantity,
    "Operationele beginvoorraad wijkt af.",
  );
  check(
    inventory?.hanging_file_mismatches === 0,
    "Een SKU verwijst naar een ander hangmapnummer dan de bron.",
  );

  const [opening] = await sql<{ quantity: number; transaction_count: number }[]>`
    select
      coalesce(sum(quantity_delta), 0)::int as quantity,
      count(*)::int as transaction_count
    from inventory_transactions
    where reference_type = 'inventory_source_snapshot'
      and reference_id = ${snapshot.id}::uuid
      and type = 'opening'
  `;
  check(
    opening?.quantity === expected.operationalQuantity,
    "Som van openingstransacties wijkt af.",
  );
  check(
    opening?.transaction_count
      === plan.operationalRows.filter(({ stock }) => stock > 0).length,
    "Aantal openingstransacties wijkt af.",
  );

  if (failures.length > 0) {
    throw new Error(`Productiedatabaseverificatie mislukt:\n- ${failures.join("\n- ")}`);
  }

  console.log("Productiedatabaseverificatie geslaagd.");
  console.table({
    snapshot: snapshot.id,
    sourceSha256: plan.metadata.sha256,
    sourceRows: sourceRows?.row_count,
    sourceQuantity: sourceRows?.source_quantity,
    operationalSkus: inventory?.sku_count,
    operationalQuantity: inventory?.on_hand,
    blockedRows: sourceRows?.blocked_rows,
    openingTransactions: opening?.transaction_count,
  });
} finally {
  await sql.end();
}
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
