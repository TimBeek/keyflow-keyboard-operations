import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

/**
 * Een herstelproef die er ook echt één is.
 *
 * Het oude smoke-script schreef alleen op dát een herstel geslaagd was, zonder
 * er één te doen. Dat leest als een groene vink terwijl niemand ooit heeft
 * gezien of de gegevens terugkomen — en dat is precies het moment waarop je
 * erachter komt dat het niet kan.
 *
 * Deze proef doet drie dingen achter elkaar: de operationele tabellen naar een
 * bestand schrijven, dat bestand in een lege database terugzetten, en daarna
 * per tabel controleren of hetzelfde eruit komt als erin ging. De proefdatabase
 * wordt daarna weggegooid; de back-up blijft staan.
 *
 * Gebruik: npx tsx --env-file=.env.local scripts/recovery-drill.ts [--keep]
 */

/**
 * De tabellen worden opgezocht, niet opgesomd. Een lijst in dit bestand raakt
 * achter zodra er een migratie bijkomt, en dan valt precies die nieuwe tabel
 * buiten de back-up zonder dat iemand het merkt.
 *
 * `schema_migrations` blijft erbuiten: die vult zich in de proefdatabase
 * vanzelf doordat de migraties er opnieuw overheen gaan.
 */
async function orderedTables(sql: ReturnType<typeof connect>) {
  const names = (await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name <> 'schema_migrations'
    order by table_name
  `).map(({ table_name }) => table_name);

  // Een tabel kan pas gevuld worden als alles waar hij naar verwijst er staat.
  const dependencies = await sql<{ child: string; parent: string }[]>`
    select child.relname as child, parent.relname as parent
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_class parent on parent.oid = c.confrelid
    where c.contype = 'f' and child.relname <> parent.relname
  `;
  const needs = new Map(names.map((name) => [name, new Set<string>()]));
  for (const { child, parent } of dependencies) {
    if (needs.has(child) && names.includes(parent)) needs.get(child)!.add(parent);
  }

  const ordered: string[] = [];
  const placed = new Set<string>();
  while (ordered.length < names.length) {
    const next = names.filter(
      (name) => !placed.has(name) && [...needs.get(name)!].every((parent) => placed.has(parent)),
    );
    if (next.length === 0) {
      // Een kring van verwijzingen; de rest gaat er in alfabetische volgorde in.
      ordered.push(...names.filter((name) => !placed.has(name)));
      break;
    }
    for (const name of next) { ordered.push(name); placed.add(name); }
  }
  return ordered;
}

function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`${name} ontbreekt.`);
  return value;
}

const keep = process.argv.includes("--keep");
const databaseUrl = required(
  "DATABASE_URL",
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
);
const actorId = required("KEYFLOW_IMPORT_ACTOR_ID", process.env.KEYFLOW_IMPORT_ACTOR_ID);

const connect = (url: string) => postgres(url, { max: 1, ssl: "require" });
const drillDatabase = "keyflow_herstelproef";
const started = new Date();
const backupDirectory = path.resolve("backups");

/** Onafhankelijk van rijvolgorde: anders zou een andere sortering al verschil lijken. */
function fingerprint(rows: readonly Record<string, unknown>[]) {
  const lines = rows.map((row) => JSON.stringify(row, Object.keys(row).sort())).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

async function main() {
  const source = connect(databaseUrl);
  let restored: ReturnType<typeof connect> | null = null;

  try {
    console.log("1. Back-up maken van de operationele tabellen.");
    const tables = await orderedTables(source);
    const dump: Record<string, Record<string, unknown>[]> = {};
    const before: Record<string, { rows: number; fingerprint: string }> = {};
    for (const table of tables) {
      const rows = await source.unsafe(`select * from ${table}`);
      dump[table] = rows as unknown as Record<string, unknown>[];
      before[table] = { rows: rows.length, fingerprint: fingerprint(dump[table]) };
    }
    const totalRows = Object.values(before).reduce((sum, entry) => sum + entry.rows, 0);
    console.log(`   ${tables.length} tabellen, ${totalRows} rijen.`);

    await mkdir(backupDirectory, { recursive: true });
    const backupPath = path.join(
      backupDirectory,
      `keyflow-${started.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`,
    );
    await writeFile(backupPath, JSON.stringify({ takenAt: started.toISOString(), tables: dump }), "utf8");
    console.log(`   Weggeschreven naar ${backupPath}`);

    console.log("2. Terugzetten in een lege proefdatabase.");
    const drillUrl = databaseUrl.replace(/\/[^/?]+(\?|$)/, `/${drillDatabase}$1`);
    await source.unsafe(`drop database if exists ${drillDatabase}`);
    await source.unsafe(`create database ${drillDatabase}`);
    restored = connect(drillUrl);

    // Hetzelfde schema als productie, uit dezelfde migraties.
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await promisify(execFile)(process.execPath, ["scripts/migrate.mjs"], {
      env: { ...process.env, DATABASE_URL: drillUrl },
    });

    /**
     * Hierna wordt er geleegd. Als het omschrijven van de databasenaam in de
     * verbindingsregel ooit misgaat, wijst deze verbinding naar de echte
     * database en is alles weg. Dus eerst vragen waar we zitten, en pas
     * doorgaan als het antwoord de proefdatabase is.
     */
    const [{ current_database: connectedTo }] = await restored<{ current_database: string }[]>`
      select current_database()
    `;
    if (connectedTo !== drillDatabase) {
      throw new Error(
        `De proef zit op database "${connectedTo}" in plaats van "${drillDatabase}". Gestopt voordat er iets geleegd werd.`,
      );
    }

    // De migraties zetten zelf al referentiegegevens klaar. Die eerst weg, anders
    // vergelijk je straks de back-up plus wat er toevallig al stond.
    await restored.unsafe(`truncate ${tables.join(", ")} restart identity cascade`);

    for (const table of tables) {
      const rows = dump[table];
      if (rows.length === 0) continue;
      // Per honderd tegelijk: één grote insert loopt tegen de parametergrens aan.
      for (let index = 0; index < rows.length; index += 100) {
        const chunk = rows.slice(index, index + 100);
        await restored`insert into ${restored(table)} ${restored(chunk)}`;
      }
    }

    console.log("3. Vergelijken wat eruit komt met wat erin ging.");
    const differences: string[] = [];
    for (const table of tables) {
      const rows = await restored.unsafe(`select * from ${table}`);
      const after = { rows: rows.length, fingerprint: fingerprint(rows as unknown as Record<string, unknown>[]) };
      if (after.rows !== before[table].rows) {
        differences.push(`${table}: ${before[table].rows} rijen erin, ${after.rows} eruit`);
      } else if (after.fingerprint !== before[table].fingerprint) {
        differences.push(`${table}: evenveel rijen, maar de inhoud wijkt af`);
      }
    }

    if (differences.length > 0) {
      console.error("Herstelproef MISLUKT:");
      for (const difference of differences) console.error(`- ${difference}`);
    } else {
      console.log(`   Alle ${tables.length} tabellen komen identiek terug.`);
    }

    await restored.end({ timeout: 5 });
    restored = null;
    if (!keep) {
      await source.unsafe(`drop database ${drillDatabase}`);
      console.log("   Proefdatabase opgeruimd.");
    }

    const passed = differences.length === 0;
    await source`
      insert into recovery_drills (
        idempotency_key, backup_reference, target_environment, started_at, completed_at,
        rpo_minutes, rto_minutes, checks, result, notes, performed_by
      )
      values (
        ${`recovery-drill:${started.toISOString()}`},
        ${path.basename(backupPath)},
        'recovery',
        ${started},
        now(),
        0,
        ${Math.max(1, Math.round((Date.now() - started.getTime()) / 60_000))},
        ${source.json({
          migrations: true,
          sourceSnapshot: true,
          inventoryBalances: true,
          transactionLedger: true,
          accessControl: true,
        })},
        ${passed ? "passed" : "failed"},
        ${`Echte proef: ${totalRows} rijen uit ${tables.length} tabellen weggeschreven, `
          + `teruggezet in een lege database en rij voor rij vergeleken.`},
        ${actorId}::uuid
      )
    `;
    console.log(passed ? "Herstelproef geslaagd en vastgelegd." : "Herstelproef mislukt en als zodanig vastgelegd.");
    if (!passed) process.exitCode = 1;
  } finally {
    if (restored) await restored.end({ timeout: 5 });
    await source.end({ timeout: 5 });
  }

}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
