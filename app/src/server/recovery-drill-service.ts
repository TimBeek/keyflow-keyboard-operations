import "server-only";
import { z } from "zod";
import {
  createRecoveryDrill,
  RecoveryDrillError,
  recoveryDrillInputSchema,
  type RecoveryDrillRecord,
} from "@/domain/production-readiness";
import {
  AuthorizationError,
  requirePermission,
} from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

export const recordRecoveryDrillSchema = recoveryDrillInputSchema.extend({
  idempotencyKey: z.string().min(8).max(200),
  actorId: databaseUuidSchema,
});

export type RecordRecoveryDrillRequest = z.input<
  typeof recordRecoveryDrillSchema
>;

export async function recordRecoveryDrill(rawInput: RecordRecoveryDrillRequest) {
  const input = recordRecoveryDrillSchema.parse(rawInput);
  const validated = createRecoveryDrill(input, {
    id: input.idempotencyKey,
    recordedAt: new Date().toISOString(),
    recordedBy: input.actorId,
  });

  await requirePermission(input.actorId, "policies.manage");
  const sql = database();

  return sql.begin(async (transaction) => {
    await transaction`
      select pg_advisory_xact_lock(
        hashtextextended(${input.idempotencyKey}, 0)
      )
    `;

    const [existing] = await transaction<RecoveryDrillRow[]>`
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
        actor.display_name as recorded_by
      from recovery_drills drill
      inner join users actor on actor.id = drill.performed_by
      where drill.idempotency_key = ${input.idempotencyKey}
      limit 1
    `;
    if (existing) {
      return { record: mapRecoveryDrill(existing), duplicate: true };
    }

    const [created] = await transaction<RecoveryDrillRow[]>`
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
        ${input.idempotencyKey},
        ${validated.backupReference},
        ${validated.targetEnvironment},
        ${validated.startedAt}::timestamptz,
        ${validated.completedAt}::timestamptz,
        ${validated.rpoMinutes},
        ${validated.rtoMinutes},
        ${transaction.json(validated.checks)},
        ${validated.result}::recovery_drill_result,
        ${validated.notes || null},
        ${input.actorId}::uuid
      )
      returning
        id,
        backup_reference,
        target_environment,
        started_at::text,
        completed_at::text,
        rpo_minutes,
        rto_minutes,
        checks,
        result::text,
        coalesce(notes, '') as notes,
        created_at::text,
        (
          select display_name
          from users
          where id = ${input.actorId}::uuid
        ) as recorded_by
    `;

    await transaction`
      insert into audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        after_data
      )
      values (
        ${input.actorId}::uuid,
        'operations.recovery_drill_recorded',
        'recovery_drill',
        ${created.id},
        ${transaction.json({
          backupReference: validated.backupReference,
          targetEnvironment: validated.targetEnvironment,
          result: validated.result,
          rpoMinutes: validated.rpoMinutes,
          rtoMinutes: validated.rtoMinutes,
        })}
      )
    `;

    return { record: mapRecoveryDrill(created), duplicate: false };
  });
}

export async function listRecoveryDrills(actorId: string) {
  const parsedActorId = databaseUuidSchema.parse(actorId);
  await requirePermission(parsedActorId, "reports.view");
  const sql = database();
  const rows = await sql<RecoveryDrillRow[]>`
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
      actor.display_name as recorded_by
    from recovery_drills drill
    inner join users actor on actor.id = drill.performed_by
    order by drill.completed_at desc
    limit 50
  `;
  return rows.map(mapRecoveryDrill);
}

export function recoveryDrillErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { error: "INVALID_INPUT", details: error.flatten() },
    };
  }
  if (error instanceof RecoveryDrillError) {
    return {
      status: 409,
      body: { error: error.code, message: error.message },
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

type RecoveryDrillRow = {
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
};

function mapRecoveryDrill(row: RecoveryDrillRow): RecoveryDrillRecord {
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
