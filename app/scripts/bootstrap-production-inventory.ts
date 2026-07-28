import postgres from "postgres";
import {
  loadProductionSource,
  productionPlanSummary,
} from "./lib/production-source";
import { normalizeProductionModel } from "../src/domain/production-bootstrap";

async function main() {
const allowedArguments = new Set(["--apply"]);
const unknownArguments = process.argv.slice(2).filter((argument) => !allowedArguments.has(argument));
if (unknownArguments.length > 0) {
  throw new Error(`Onbekende argumenten: ${unknownArguments.join(", ")}.`);
}

const apply = process.argv.includes("--apply");
const plan = await loadProductionSource();
const summary = productionPlanSummary(plan);

console.log("Gevalideerd productiebootstrapplan:");
console.table(summary);
console.log(
  `Geblokkeerde hangmappen: ${plan.blockedRows.map(({ storageNumber }) => storageNumber).join(", ")}.`,
);

if (!apply) {
  console.log("Droge controle geslaagd. Er is niets in een database gewijzigd.");
  console.log("Gebruik `npm run db:bootstrap:apply` alleen op een vooraf gecontroleerde database.");
  return;
}

const databaseUrl = process.env.DATABASE_URL;
const actorId = process.env.KEYFLOW_IMPORT_ACTOR_ID;
if (!databaseUrl) throw new Error("DATABASE_URL ontbreekt.");
if (!actorId || !isUuid(actorId)) {
  throw new Error("KEYFLOW_IMPORT_ACTOR_ID ontbreekt of is geen geldige UUID.");
}

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
});

try {
  const [migration] = await sql<{ name: string }[]>`
    select name
    from schema_migrations
    where name = '0013_production_inventory_bootstrap.sql'
  `;
  if (!migration) {
    throw new Error("Migratie 0013 ontbreekt. Voer eerst `npm run db:migrate` uit.");
  }

  const [authorizedActor] = await sql<{ id: string }[]>`
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
  if (!authorizedActor) {
    throw new Error(
      "De importgebruiker is niet actief of heeft de permissie imports.manage niet.",
    );
  }

  const [existingSnapshot] = await sql<{ id: string; status: string }[]>`
    select id, status
    from inventory_source_snapshots
    where source_sha256 = ${plan.metadata.sha256}
  `;
  if (existingSnapshot?.status === "applied") {
    console.log(
      `Bron ${plan.metadata.sha256} is al toegepast als snapshot ${existingSnapshot.id}; `
      + "geen tweede import uitgevoerd.",
    );
    process.exitCode = 0;
  } else {
    if (existingSnapshot) {
      throw new Error(
        `Bron bestaat al met status ${existingSnapshot.status}; herstel deze eerst handmatig.`,
      );
    }

    const [liveData] = await sql<{
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
    if (
      !liveData
      || liveData.snapshots > 0
      || liveData.skus > 0
      || liveData.balances > 0
      || liveData.transactions > 0
    ) {
      throw new Error(
        "De initiële bootstrap is alleen toegestaan op een lege productievoorraad. "
        + "Er is bestaande voorraad- of importdata aangetroffen.",
      );
    }

    const snapshotId = await sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtext('keyflow-production-bootstrap'))`;

      const [snapshot] = await transaction<{ id: string }[]>`
        insert into inventory_source_snapshots (
          source_sha256,
          file_name,
          sheet_name,
          row_count,
          total_quantity,
          status,
          imported_by
        )
        values (
          ${plan.metadata.sha256},
          ${plan.metadata.fileName},
          ${plan.metadata.sheet},
          ${plan.metadata.rowCount},
          ${plan.metadata.totalQuantity},
          'prepared',
          ${actorId}::uuid
        )
        returning id
      `;
      if (!snapshot) throw new Error("Snapshot kon niet worden aangemaakt.");

      const [location] = await transaction<{ id: string }[]>`
        insert into locations (code, name, active)
        values ('HANGMAPPENWAGEN', 'Hangmappenwagen', true)
        on conflict (code) do update set
          name = excluded.name,
          active = true
        returning id
      `;
      if (!location) throw new Error("Hangmappenwagenlocatie kon niet worden aangemaakt.");

      const layoutRows = await transaction<{ id: string; code: string }[]>`
        select id, code
        from keyboard_layouts
        where code in ('QWERTY_US', 'AZERTY_FR', 'QWERTZ_DE')
      `;
      const layoutIds = new Map(layoutRows.map((layout) => [layout.code, layout.id]));
      if (layoutIds.size !== 3) {
        throw new Error("Niet alle drie vereiste keyboardlayouts zijn aanwezig.");
      }

      const modelIds = new Map<string, string>();
      for (const model of plan.models) {
        const [manufacturer] = await transaction<{ id: string }[]>`
          insert into manufacturers (name)
          values (${model.manufacturer})
          on conflict (name) do update set name = excluded.name
          returning id
        `;
        if (!manufacturer) throw new Error(`Fabrikant ${model.manufacturer} ontbreekt.`);

        const [databaseModel] = await transaction<{ id: string }[]>`
          insert into laptop_models (
            manufacturer_id,
            model_name,
            normalized_name,
            status
          )
          values (
            ${manufacturer.id}::uuid,
            ${model.modelName},
            ${model.normalizedName},
            'active'
          )
          on conflict (normalized_name) do update set
            manufacturer_id = excluded.manufacturer_id,
            model_name = excluded.model_name,
            status = 'active'
          returning id
        `;
        if (!databaseModel) throw new Error(`Model ${model.modelName} kon niet worden opgeslagen.`);
        modelIds.set(model.normalizedName, databaseModel.id);

        for (const alias of model.aliases) {
          await transaction`
            insert into model_aliases (
              model_id,
              alias,
              normalized_alias,
              source
            )
            values (
              ${databaseModel.id}::uuid,
              ${alias},
              ${normalizeProductionModel(alias)},
              ${`inventory-bootstrap:${plan.metadata.sha256}`}
            )
            on conflict (normalized_alias) do update set
              model_id = excluded.model_id,
              alias = excluded.alias,
              source = excluded.source
          `;
        }
      }

      for (const row of plan.rows) {
        if (row.dataQuality === "blocked") {
          await transaction`
            insert into inventory_source_rows (
              snapshot_id,
              source_row,
              catalog_key,
              hanging_file_number,
              model_name,
              layout_text,
              sku_text,
              opening_quantity,
              linked_models,
              notes,
              data_quality,
              data_quality_issues
            )
            values (
              ${snapshot.id}::uuid,
              ${row.sourceRow},
              ${row.catalogKey},
              ${row.storageNumber},
              ${row.model},
              ${row.layout},
              ${row.sku},
              ${row.stock},
              ${transaction.json(row.modelAliases)},
              ${row.notes || null},
              'blocked',
              ${transaction.json(row.dataQualityIssues)}
            )
          `;
          continue;
        }

        const layoutId = row.layoutCode ? layoutIds.get(row.layoutCode) : undefined;
        if (!layoutId) throw new Error(`Layout voor hangmap ${row.storageNumber} ontbreekt.`);

        const [stickerSku] = await transaction<{ id: string }[]>`
          insert into sticker_skus (
            sku,
            name,
            layout_id,
            method_code,
            hanging_file_number,
            status,
            notes
          )
          values (
            ${row.normalizedSku},
            ${`${row.model} · ${row.layout} · ${row.variant ?? "variant onbekend"}`},
            ${layoutId}::uuid,
            'noviply_sheet',
            ${row.storageNumber},
            'active',
            ${row.notes || null}
          )
          returning id
        `;
        if (!stickerSku) throw new Error(`SKU voor hangmap ${row.storageNumber} ontbreekt.`);

        for (const alias of row.modelAliases) {
          const modelId = modelIds.get(normalizeProductionModel(alias));
          if (!modelId) throw new Error(`Modelkoppeling voor ${alias} ontbreekt.`);
          await transaction`
            insert into sku_model_compatibility (
              sku_id,
              model_id,
              status,
              notes,
              source
            )
            values (
              ${stickerSku.id}::uuid,
              ${modelId}::uuid,
              'unverified',
              ${row.notes || null},
              ${`inventory-bootstrap:${plan.metadata.sha256}`}
            )
            on conflict (sku_id, model_id) do nothing
          `;
        }

        await transaction`
          insert into inventory_balances (
            sku_id,
            location_id,
            on_hand,
            reserved,
            version
          )
          values (
            ${stickerSku.id}::uuid,
            ${location.id}::uuid,
            ${row.stock},
            0,
            1
          )
        `;

        if (row.stock > 0) {
          await transaction`
            insert into inventory_transactions (
              sku_id,
              location_id,
              type,
              quantity_delta,
              reason_code,
              notes,
              reference_type,
              reference_id,
              idempotency_key,
              performed_by
            )
            values (
              ${stickerSku.id}::uuid,
              ${location.id}::uuid,
              'opening',
              ${row.stock},
              'production_source_bootstrap',
              ${`Beginvoorraad uit ${plan.metadata.fileName}, bronrij ${row.sourceRow}.`},
              'inventory_source_snapshot',
              ${snapshot.id}::uuid,
              ${`production-bootstrap:${plan.metadata.sha256}:${row.catalogKey}`},
              ${actorId}::uuid
            )
          `;
        }

        await transaction`
          insert into inventory_source_rows (
            snapshot_id,
            source_row,
            catalog_key,
            hanging_file_number,
            model_name,
            layout_text,
            sku_text,
            opening_quantity,
            linked_models,
            notes,
            data_quality,
            data_quality_issues,
            sku_id
          )
          values (
            ${snapshot.id}::uuid,
            ${row.sourceRow},
            ${row.catalogKey},
            ${row.storageNumber},
            ${row.model},
            ${row.layout},
            ${row.sku},
            ${row.stock},
            ${transaction.json(row.modelAliases)},
            ${row.notes || null},
            'ready',
            ${transaction.json(row.dataQualityIssues)},
            ${stickerSku.id}::uuid
          )
        `;
      }

      await transaction`
        insert into audit_logs (
          actor_id,
          action,
          entity_type,
          entity_id,
          after_data
        )
        values (
          ${actorId}::uuid,
          'inventory.production_bootstrap',
          'inventory_source_snapshot',
          ${snapshot.id},
          ${transaction.json(summary)}
        )
      `;

      await transaction`
        update inventory_source_snapshots
        set status = 'applied', applied_at = now()
        where id = ${snapshot.id}::uuid
      `;

      return snapshot.id;
    });

    console.log(`Productievoorraad transactioneel toegepast als snapshot ${snapshotId}.`);
    console.log("Voer nu `npm run db:verify` uit.");
  }
} finally {
  await sql.end();
}
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}
