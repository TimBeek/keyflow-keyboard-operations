import postgres from "postgres";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const actorId = process.env.KEYFLOW_IMPORT_ACTOR_ID;
  if (!databaseUrl) throw new Error("DATABASE_URL ontbreekt.");
  if (!actorId) throw new Error("KEYFLOW_IMPORT_ACTOR_ID ontbreekt.");

  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  });
  const idempotencyKey =
    `ci-recovery-registration:${process.env.GITHUB_SHA ?? "local"}`;

  try {
    const [migration] = await sql<{ name: string }[]>`
      select name
      from schema_migrations
      where name = '0014_recovery_drills.sql'
    `;
    if (!migration) {
      throw new Error("Migratie 0014 ontbreekt. Voer eerst `npm run db:migrate` uit.");
    }

    const [authorizedActor] = await sql<{ id: string }[]>`
      select actor.id
      from users actor
      inner join user_roles user_role on user_role.user_id = actor.id
      inner join role_permissions role_permission
        on role_permission.role_code = user_role.role_code
      where actor.id = ${actorId}::uuid
        and actor.active = true
        and role_permission.permission_code = 'policies.manage'
      limit 1
    `;
    if (!authorizedActor) {
      throw new Error("De CI-actor mist policies.manage.");
    }

    await sql.begin(async (transaction) => {
      const rows = await transaction<{ id: string }[]>`
        insert into recovery_drills (
          idempotency_key,
          backup_reference,
          target_environment,
          started_at,
          completed_at,
          rpo_minutes,
          rto_minutes,
          checks,
          result,
          notes,
          performed_by
        )
        values (
          ${idempotencyKey},
          'ci-ephemeral-database-registration-smoke',
          'recovery',
          now() - interval '2 minutes',
          now(),
          0,
          2,
          ${transaction.json({
            migrations: true,
            sourceSnapshot: true,
            inventoryBalances: true,
            transactionLedger: true,
            accessControl: true,
          })},
          'passed',
          'Tijdelijke CI-database: valideert registratie en integriteitsquery, niet een providerrestore.',
          ${actorId}::uuid
        )
        on conflict (idempotency_key) do nothing
        returning id
      `;

      const [record] = await transaction<{
        id: string;
        result: "passed" | "failed";
        checks_complete: boolean;
      }[]>`
        select
          id,
          result::text,
          (
            checks @> '{"migrations": true, "sourceSnapshot": true, "inventoryBalances": true, "transactionLedger": true, "accessControl": true}'::jsonb
          ) as checks_complete
        from recovery_drills
        where idempotency_key = ${idempotencyKey}
      `;
      if (!record || record.result !== "passed" || !record.checks_complete) {
        throw new Error("Herstelproefregistratie is niet volledig teruggelezen.");
      }

      if (rows[0]) {
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
            'operations.recovery_drill_registration_smoke',
            'recovery_drill',
            ${record.id},
            '{"scope": "ephemeral-ci", "providerRestore": false}'::jsonb
          )
        `;
      }
    });

    console.log(
      "Herstelproefregistratie-smoketest geslaagd in de tijdelijke CI-database.",
    );
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
