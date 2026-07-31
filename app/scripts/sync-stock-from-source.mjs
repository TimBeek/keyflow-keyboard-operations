import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/**
 * De geteld voorraad uit de bronlijst gelijktrekken met de database.
 *
 * Bewust géén overschrijven: elk verschil wordt een `adjustment`-boeking met de
 * telling als reden. Daardoor blijft in de geschiedenis staan dát er is
 * bijgesteld en met hoeveel — precies wat je bij een volgende telling wilt
 * kunnen terugzoeken. Zonder --apply wordt er niets gewijzigd.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(here, "../db/seed/inventory-source.json");
const apply = process.argv.includes("--apply");

const databaseUrl = process.env.DATABASE_URL;
const actorId = process.env.KEYFLOW_IMPORT_ACTOR_ID;
if (!databaseUrl) throw new Error("DATABASE_URL ontbreekt.");
if (!actorId) throw new Error("KEYFLOW_IMPORT_ACTOR_ID ontbreekt.");

const source = JSON.parse(await readFile(seedPath, "utf8"));
const sql = postgres(databaseUrl, {
  max: 1,
  ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
});

try {
  const [authorized] = await sql`
    select actor.id
    from users actor
    inner join user_roles user_role on user_role.user_id = actor.id
    inner join role_permissions role_permission
      on role_permission.role_code = user_role.role_code
    where actor.id = ${actorId}::uuid
      and actor.active = true
      and role_permission.permission_code = 'imports.manage'
    limit 1
  `;
  if (!authorized) {
    throw new Error("De importgebruiker bestaat niet of mag geen import doen.");
  }

  /**
   * Koppelen op hangmapnummer, niet op artikelnummer. Twee hangmappen kunnen
   * hetzelfde nummer dragen, en een enkele map heeft er helemaal geen — dan valt
   * er op nummer niets te koppelen terwijl de map wel bestaat en geteld wordt.
   */
  const balances = await sql`
    select s.sku, s.hanging_file_number, b.location_id, b.on_hand
    from inventory_balances b
    inner join sticker_skus s on s.id = b.sku_id
    where s.hanging_file_number is not null
  `;
  const byFolder = new Map(balances.map((row) => [row.hanging_file_number, row]));

  const differences = [];
  const missing = [];
  for (const row of source.rows) {
    const balance = byFolder.get(row.storageNumber);
    if (!balance) {
      missing.push(row);
      continue;
    }
    if (balance.on_hand !== row.stock) {
      differences.push({
        storageNumber: row.storageNumber,
        model: row.model,
        sku: balance.sku,
        locationId: balance.location_id,
        from: balance.on_hand,
        to: row.stock,
        delta: row.stock - balance.on_hand,
      });
    }
  }

  const geteld = source.rows.length;
  console.log(`Bronlijst: ${geteld} hangmappen.`);
  console.log(`Gelijk: ${geteld - differences.length - missing.length}.`);
  if (missing.length > 0) {
    console.log(`Nog niet in de database: hangmap ${missing.map((r) => r.storageNumber).join(", ")}.`);
  }
  if (differences.length === 0) {
    console.log("Geen verschillen. Er valt niets bij te stellen.");
  } else {
    console.table(differences.map(({ locationId, ...rest }) => rest));
    const netto = differences.reduce((sum, row) => sum + row.delta, 0);
    console.log(`Netto verschil: ${netto > 0 ? "+" : ""}${netto} vellen over ${differences.length} hangmappen.`);
  }

  if (!apply) {
    console.log("Droge controle. Er is niets gewijzigd. Gebruik --apply om bij te stellen.");
  } else if (differences.length > 0) {
    const stamp = source.metadata.sha256.slice(0, 12);
    await sql.begin(async (transaction) => {
      for (const difference of differences) {
        await transaction`
          insert into inventory_transactions (
            sku_id, location_id, type, quantity_delta, reason_code, notes,
            reference_type, idempotency_key, performed_by
          )
          select s.id, ${difference.locationId}::uuid, 'adjustment', ${difference.delta},
                 'stock_count', ${`Telling ${source.metadata.fileName}: hangmap ${difference.storageNumber} van ${difference.from} naar ${difference.to}.`},
                 'inventory_source', ${`stock-sync-${stamp}-${difference.sku}`}, ${actorId}::uuid
          from sticker_skus s
          where s.sku = ${difference.sku}
          on conflict (idempotency_key) do nothing
        `;
        await transaction`
          update inventory_balances b
          set on_hand = ${difference.to}, version = b.version + 1, updated_at = now()
          from sticker_skus s
          where s.id = b.sku_id
            and s.sku = ${difference.sku}
            and b.location_id = ${difference.locationId}::uuid
        `;
      }
    });
    console.log(`Bijgesteld: ${differences.length} hangmappen, elk met een adjustment-boeking in de geschiedenis.`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
