import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  loadProductionSource,
  productionPlanSummary,
} from "./lib/production-source";

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL ontbreekt.");
  const maxRecoveryAgeDays = Number(
    process.env.KEYFLOW_RECOVERY_MAX_AGE_DAYS ?? "90",
  );
  if (!Number.isInteger(maxRecoveryAgeDays) || maxRecoveryAgeDays < 1) {
    throw new Error("KEYFLOW_RECOVERY_MAX_AGE_DAYS moet een positief geheel getal zijn.");
  }

  const plan = await loadProductionSource();
  const expected = productionPlanSummary(plan);
  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  });
  const failures: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) failures.push(message);
  };

  try {
    /**
     * Niet één vast migratienummer: er komen migraties bij, en dan zou deze
     * controle afgaan op iets wat juist goed gaat. Wat moet kloppen is dat er
     * niets openstaat.
     */
    const onDisk = (await readdir(migrationsDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const applied = new Set(
      (await sql<{ name: string }[]>`select name from schema_migrations`)
        .map(({ name }) => name),
    );
    const pending = onDisk.filter((name) => !applied.has(name));
    check(
      pending.length === 0,
      `Nog niet toegepaste migraties: ${pending.join(", ")}. Voer \`npm run db:migrate\` uit.`,
    );

    /**
     * De nulmeting blijft staan zoals hij is geïmporteerd; latere tellingen
     * gaan als bijstelling door het transactielog. De hash van het bronbestand
     * van vandaag hoort er dus niet mee te matchen — dat zou juist betekenen
     * dat er opnieuw een import overheen is gegaan.
     */
    const [snapshot] = await sql<{
      row_count: number;
      total_quantity: number;
      status: string;
    }[]>`
      select row_count, total_quantity, status
      from inventory_source_snapshots
      where status = 'applied'
      order by applied_at desc nulls last, created_at desc
      limit 1
    `;
    check(Boolean(snapshot), "Er is geen toegepaste inventarisbronsnapshot; de nulmeting ontbreekt.");
    check(
      snapshot === undefined || snapshot.row_count === expected.sourceRows,
      "De nulmeting telt een ander aantal hangmappen dan de bronlijst.",
    );

    /**
     * De controle die er echt toe doet: staat in de app hetzelfde als in de
     * kast? Elke hangmap met een artikelnummer wordt vergeleken met de laatste
     * telling. Wijkt er iets af, dan is er geboekt zonder dat de telling is
     * bijgewerkt — of andersom.
     */
    const balances = await sql<{ sku: string; on_hand: number }[]>`
      select s.sku, b.on_hand
      from inventory_balances b
      inner join sticker_skus s on s.id = b.sku_id
    `;
    const onHandBySku = new Map(balances.map((row) => [row.sku, row.on_hand]));
    const drifted = plan.operationalRows.filter(
      (row) => onHandBySku.get(row.sku) !== row.stock,
    );
    check(
      drifted.length === 0,
      `Voorraad wijkt af van de laatste telling bij hangmap `
      + `${drifted.map(({ storageNumber }) => storageNumber).join(", ")}. `
      + "Voer `npm run stock:sync` uit om het verschil vast te leggen.",
    );

    const [inventory] = await sql<{
      balances: number;
      on_hand: number;
      ledger_quantity: number;
    }[]>`
      select
        (select count(*)::int from inventory_balances) as balances,
        (select coalesce(sum(on_hand), 0)::int from inventory_balances) as on_hand,
        (
          select coalesce(sum(quantity_delta), 0)::int
          from inventory_transactions
        ) as ledger_quantity
    `;
    check(
      inventory?.balances === expected.operationalRows,
      "Het aantal operationele SKU-balansen wijkt af.",
    );
    check(
      inventory?.on_hand === inventory?.ledger_quantity,
      "Voorraadbalansen en transactielog sluiten niet op elkaar aan.",
    );

    const [latestDrill] = await sql<{
      result: "passed" | "failed";
      completed_at: Date;
      age_days: number;
      all_checks: boolean;
    }[]>`
      select
        result::text,
        completed_at,
        extract(epoch from (now() - completed_at))::float / 86400 as age_days,
        checks @> '{"migrations": true, "sourceSnapshot": true, "inventoryBalances": true, "transactionLedger": true, "accessControl": true}'::jsonb as all_checks
      from recovery_drills
      order by completed_at desc
      limit 1
    `;
    check(Boolean(latestDrill), "Er is nog geen herstelproef geregistreerd.");
    check(latestDrill?.result === "passed", "De laatste herstelproef is niet geslaagd.");
    check(Boolean(latestDrill?.all_checks), "De laatste herstelproef mist integriteitscontroles.");
    check(
      (latestDrill?.age_days ?? Number.POSITIVE_INFINITY) <= maxRecoveryAgeDays,
      `De laatste herstelproef is ouder dan ${maxRecoveryAgeDays} dagen.`,
    );

    if (failures.length > 0) {
      throw new Error(`Operationele readinesscontrole mislukt:\n- ${failures.join("\n- ")}`);
    }

    console.log("Operationele readinesscontrole geslaagd.");
    console.table({
      migrations: `${onDisk.length} toegepast, 0 open`,
      sourceRows: snapshot?.row_count,
      inventoryBalances: inventory?.balances,
      inventoryOnHand: inventory?.on_hand,
      latestRecoveryResult: latestDrill?.result,
      latestRecoveryAt: latestDrill?.completed_at.toISOString(),
      maxRecoveryAgeDays,
    });
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
