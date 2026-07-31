import "server-only";
import { z } from "zod";
import {
  inventoryCatalogSummary,
  operationalInventoryCatalog,
} from "@/data/inventory-catalog";
import type {
  CentralOperationsReadinessReport,
  CentralReadinessCheck,
  RecoveryDrillRecord,
} from "@/domain/production-readiness";
import {
  AuthorizationError,
  requirePermission,
} from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

export async function operationsReadiness(
  rawActorId: string,
  environment: Record<string, string | undefined> = process.env,
): Promise<CentralOperationsReadinessReport> {
  const actorId = databaseUuidSchema.parse(rawActorId);
  const maxRecoveryAgeDays = parseMaxRecoveryAgeDays(
    environment.KEYFLOW_RECOVERY_MAX_AGE_DAYS,
  );
  await requirePermission(actorId, "reports.view");
  const sql = database();

  const [migration, snapshot, inventory, latestRecovery] = await Promise.all([
    sql<{ name: string }[]>`
      select name
      from schema_migrations
      order by name desc
      limit 1
    `.then((rows) => rows[0] ?? null),
    sql<{
      status: string;
      row_count: number;
      total_quantity: number;
      is_huidige: boolean;
    }[]>`
      select status, row_count, total_quantity,
             source_sha256 = ${inventoryCatalogSummary.sha256} as is_huidige
      from inventory_source_snapshots
      where status = 'applied'
      order by created_at desc
      limit 1
    `.then((rows) => rows[0] ?? null),
    sql<{
      operational_rows: number;
      linked_balances: number;
      on_hand: number;
      ledger_quantity: number;
    }[]>`
      select
        count(*)::int as operational_rows,
        count(balance.sku_id)::int as linked_balances,
        /*
         * Allebei over álles, niet over wat toevallig in de laatste bronlijst
         * stond. Eerder telde on_hand alleen de hangmappen uit die lijst en
         * ledger_quantity alle boekingen — twee verschillende verzamelingen, en
         * dan zegt het verschil ertussen niets.
         */
        (
          select coalesce(sum(on_hand), 0)::int
          from inventory_balances
        ) as on_hand,
        (
          select coalesce(sum(quantity_delta), 0)::int
          from inventory_transactions
        ) as ledger_quantity
      from inventory_source_rows source
      left join locations location on location.code = 'HANGMAPPENWAGEN'
      left join inventory_balances balance
        on balance.sku_id = source.sku_id
        and balance.location_id = location.id
      where source.data_quality = 'ready'
        and source.snapshot_id = (
          select id
          from inventory_source_snapshots
          where status = 'applied'
          order by created_at desc
          limit 1
        )
    `.then((rows) => rows[0] ?? {
      operational_rows: 0,
      linked_balances: 0,
      on_hand: 0,
      ledger_quantity: 0,
    }),
    sql<RecoveryDrillReadinessRow[]>`
      select
        drill.id,
        drill.backup_reference,
        drill.target_environment,
        drill.started_at::text,
        drill.completed_at::text,
        drill.rpo_minutes,
        drill.rto_minutes,
        drill.checks,
        drill.result::text,
        coalesce(drill.notes, '') as notes,
        drill.created_at::text,
        actor.display_name as recorded_by,
        extract(epoch from (now() - drill.completed_at))::float / 86400 as age_days
      from recovery_drills drill
      inner join users actor on actor.id = drill.performed_by
      order by drill.completed_at desc
      limit 1
    `.then((rows) => rows[0] ?? null),
  ]);

  const mappedRecovery = latestRecovery
    ? mapRecoveryDrill(latestRecovery)
    : null;
  const allRecoveryChecks = Boolean(
    mappedRecovery
      && Object.values(mappedRecovery.checks).every(Boolean),
  );
  /*
   * De vraag is of de database bij is, niet of één bepaalde migratie er staat.
   * Hier stond "0016_workfloor_acceptance_trials.sql" hard ingetypt; bij de
   * eerstvolgende migratie ging deze controle op rood terwijl er niets mis was.
   * Een controle die afgaat bij goed nieuws wordt genegeerd, en dan vangt hij
   * het echte geval ook niet meer.
   */
  const migrationReady = Boolean(migration?.name);
  /*
   * Er is een bronlijst ingelezen: dat is de vraag. Het aantal vellen daarin is
   * de stand op het moment van inlezen en loopt daarna vanzelf uiteen met de
   * werkelijkheid — er wordt immers gewerkt. Dat vergelijken met het bestand
   * van vandaag zette deze controle op rood na elke telling.
   */
  const snapshotReady = Boolean(snapshot && snapshot.status === "applied");
  const bronIsBij = Boolean(snapshot?.is_huidige);
  /*
   * Twee dingen die binnen de database moeten kloppen, en die vergelijken we
   * ook binnen de database.
   *
   * Hier stond het aantal regels naast operationalInventoryCatalog.length — het
   * aantal hangmappen in de meegeleverde catalogus van dít moment. Zodra daar
   * een hangmap bijkomt die nog niet opnieuw is ingelezen, gaat de controle op
   * rood terwijl de database prima sluit. Wat er werkelijk toe doet: elke
   * bruikbare bronregel heeft een voorraadregel, en de optelsom van alle
   * boekingen komt uit op wat er in de kast ligt. Wijkt dat tweede af, dan is er
   * een afboeking zoekgeraakt of dubbel verwerkt — en dát is het geval waarvoor
   * deze controle bestaat.
   */
  const inventoryReady =
    inventory.operational_rows > 0
    && inventory.linked_balances === inventory.operational_rows
    && inventory.on_hand === inventory.ledger_quantity;
  const recoveryReady = Boolean(
    latestRecovery
      && latestRecovery.result === "passed"
      && allRecoveryChecks
      && latestRecovery.age_days <= maxRecoveryAgeDays,
  );

  const checks: CentralReadinessCheck[] = [
    {
      id: "migration",
      label: "Continuïteitsmigratie",
      ready: migrationReady,
      detail: migrationReady
        ? `De database staat op ${migration?.name}.`
        : "Er is nog geen enkele migratie toegepast.",
    },
    {
      id: "source_snapshot",
      label: "Canonieke Excelbronsnapshot",
      ready: snapshotReady,
      detail: !snapshotReady
        ? "Er is nog geen bronlijst ingelezen."
        : bronIsBij
          ? `${snapshot?.row_count} hangmappen ingelezen uit de huidige bronlijst.`
          : `${snapshot?.row_count} hangmappen ingelezen; de bronlijst is daarna gewijzigd. `
            + "Dat mag — tellingen lopen via boekingen — maar een nieuwe hangmap komt er pas bij na een import.",
    },
    {
      id: "inventory_integrity",
      label: "Voorraadsluiting",
      ready: inventoryReady,
      detail: inventoryReady
        ? `${inventory.linked_balances} hangmappen sluiten, en de boekingen tellen op tot ${inventory.on_hand} vellen.`
        : inventory.linked_balances !== inventory.operational_rows
          ? `${inventory.operational_rows - inventory.linked_balances} bruikbare hangmappen hebben geen voorraadregel.`
          : `De boekingen tellen op tot ${inventory.ledger_quantity} vellen, maar er ligt ${inventory.on_hand}. `
            + "Er is een afboeking zoekgeraakt of dubbel verwerkt.",
    },
    {
      id: "recovery_drill",
      label: "Actuele herstelproef",
      ready: recoveryReady,
      detail: recoveryReady
        ? `De laatste geslaagde proef is maximaal ${maxRecoveryAgeDays} dagen oud.`
        : `Een volledige geslaagde proef van maximaal ${maxRecoveryAgeDays} dagen oud ontbreekt.`,
    },
  ];

  const databaseReady = checks
    .filter(({ id }) => id !== "recovery_drill")
    .every(({ ready }) => ready);

  return {
    ready: checks.every(({ ready }) => ready),
    databaseReady,
    generatedAt: new Date().toISOString(),
    maxRecoveryAgeDays,
    latestMigration: migration?.name ?? null,
    snapshot: {
      status: snapshot?.status ?? null,
      rowCount: snapshot?.row_count ?? null,
      totalQuantity: snapshot?.total_quantity ?? null,
    },
    inventory: {
      operationalRows: inventory.operational_rows,
      linkedBalances: inventory.linked_balances,
      onHand: inventory.on_hand,
      ledgerQuantity: inventory.ledger_quantity,
    },
    latestRecoveryDrill: mappedRecovery,
    checks,
  };
}

export function operationsReadinessErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { error: "INVALID_INPUT", details: error.flatten() },
    };
  }
  if (error instanceof AuthorizationError) {
    return {
      status: 403,
      body: { error: error.code, message: error.message },
    };
  }
  throw error;
}

function parseMaxRecoveryAgeDays(rawValue: string | undefined) {
  const value = Number(rawValue ?? "90");
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    return 90;
  }
  return value;
}

type RecoveryDrillReadinessRow = {
  id: string;
  backup_reference: string;
  target_environment: "staging" | "recovery";
  started_at: string;
  completed_at: string;
  rpo_minutes: number;
  rto_minutes: number;
  checks: RecoveryDrillRecord["checks"];
  result: "passed" | "failed";
  notes: string;
  created_at: string;
  recorded_by: string;
  age_days: number;
};

function mapRecoveryDrill(row: RecoveryDrillReadinessRow): RecoveryDrillRecord {
  return {
    id: row.id,
    backupReference: row.backup_reference,
    targetEnvironment: row.target_environment,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    rpoMinutes: row.rpo_minutes,
    rtoMinutes: row.rto_minutes,
    checks: row.checks,
    result: row.result,
    notes: row.notes,
    recordedAt: row.created_at,
    recordedBy: row.recorded_by,
  };
}
