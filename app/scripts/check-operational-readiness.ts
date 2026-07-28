import postgres from "postgres";
import {
  loadProductionSource,
  productionPlanSummary,
} from "./lib/production-source";

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
    const [migration] = await sql<{ name: string }[]>`
      select name
      from schema_migrations
      order by applied_at desc, name desc
      limit 1
    `;
    check(
      migration?.name === "0014_recovery_drills.sql",
      "De nieuwste operationele migratie 0014 is niet toegepast.",
    );

    const [snapshot] = await sql<{
      row_count: number;
      total_quantity: number;
      status: string;
    }[]>`
      select row_count, total_quantity, status
      from inventory_source_snapshots
      where source_sha256 = ${plan.metadata.sha256}
      limit 1
    `;
    check(Boolean(snapshot), "De canonieke inventarisbronsnapshot ontbreekt.");
    check(snapshot?.status === "applied", "De bronsnapshot is niet volledig toegepast.");
    check(
      snapshot?.row_count === expected.sourceRows,
      "Het bronsnapshotaantal wijkt af.",
    );
    check(
      snapshot?.total_quantity === expected.sourceQuantity,
      "Het bronsnapshottotaal wijkt af.",
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
      migration: migration?.name,
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
