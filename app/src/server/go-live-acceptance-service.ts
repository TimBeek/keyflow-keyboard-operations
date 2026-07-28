import "server-only";
import { z } from "zod";
import {
  createGoLiveAcceptanceRecord,
  GoLiveAcceptanceError,
  goLiveAcceptanceInputSchema,
  type GoLiveAcceptanceRecord,
} from "@/domain/go-live-acceptance";
import {
  AuthorizationError,
  requirePermission,
} from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

export const recordGoLiveAcceptanceSchema = goLiveAcceptanceInputSchema.extend({
  idempotencyKey: z.string().min(8).max(200),
  actorId: databaseUuidSchema,
});

export type RecordGoLiveAcceptanceRequest = z.input<
  typeof recordGoLiveAcceptanceSchema
>;

export async function recordGoLiveAcceptance(
  rawInput: RecordGoLiveAcceptanceRequest,
) {
  const input = recordGoLiveAcceptanceSchema.parse(rawInput);
  const validated = createGoLiveAcceptanceRecord(input, {
    id: input.idempotencyKey,
    recordedAt: new Date().toISOString(),
    reviewedBy: input.actorId,
  });

  await requirePermission(input.actorId, "policies.manage");
  const sql = database();

  return sql.begin(async (transaction) => {
    await transaction`
      select pg_advisory_xact_lock(
        hashtextextended(${input.idempotencyKey}, 0)
      )
    `;

    const [existing] = await transaction<GoLiveAcceptanceRow[]>`
      select
        acceptance.id,
        acceptance.gate::text,
        acceptance.owner_name,
        acceptance.evidence_reference,
        acceptance.evidence_date::text,
        acceptance.checks,
        acceptance.decision::text,
        coalesce(acceptance.notes, '') as notes,
        acceptance.created_at::text,
        actor.display_name as reviewed_by
      from go_live_acceptance_records acceptance
      inner join users actor on actor.id = acceptance.reviewed_by
      where acceptance.idempotency_key = ${input.idempotencyKey}
      limit 1
    `;
    if (existing) {
      return { record: mapGoLiveAcceptance(existing), duplicate: true };
    }

    const [created] = await transaction<GoLiveAcceptanceRow[]>`
      insert into go_live_acceptance_records (
        idempotency_key,
        gate,
        owner_name,
        evidence_reference,
        evidence_date,
        checks,
        decision,
        notes,
        reviewed_by
      )
      values (
        ${input.idempotencyKey},
        ${validated.gate}::go_live_acceptance_gate,
        ${validated.ownerName},
        ${validated.evidenceReference},
        ${validated.evidenceDate}::timestamptz,
        ${transaction.json(validated.checks)},
        ${validated.decision}::go_live_acceptance_decision,
        ${validated.notes || null},
        ${input.actorId}::uuid
      )
      returning
        id,
        gate::text,
        owner_name,
        evidence_reference,
        evidence_date::text,
        checks,
        decision::text,
        coalesce(notes, '') as notes,
        created_at::text,
        (
          select display_name
          from users
          where id = ${input.actorId}::uuid
        ) as reviewed_by
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
        'operations.go_live_acceptance_recorded',
        'go_live_acceptance',
        ${created.id},
        ${transaction.json({
          gate: validated.gate,
          ownerName: validated.ownerName,
          evidenceReference: validated.evidenceReference,
          decision: validated.decision,
        })}
      )
    `;

    return { record: mapGoLiveAcceptance(created), duplicate: false };
  });
}

export async function listGoLiveAcceptanceRecords(actorId: string) {
  const parsedActorId = databaseUuidSchema.parse(actorId);
  await requirePermission(parsedActorId, "reports.view");
  const sql = database();
  const rows = await sql<GoLiveAcceptanceRow[]>`
    select
      acceptance.id,
      acceptance.gate::text,
      acceptance.owner_name,
      acceptance.evidence_reference,
      acceptance.evidence_date::text,
      acceptance.checks,
      acceptance.decision::text,
      coalesce(acceptance.notes, '') as notes,
      acceptance.created_at::text,
      actor.display_name as reviewed_by
    from go_live_acceptance_records acceptance
    inner join users actor on actor.id = acceptance.reviewed_by
    order by acceptance.created_at desc
    limit 250
  `;
  return rows.map(mapGoLiveAcceptance);
}

export function goLiveAcceptanceErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { error: "INVALID_INPUT", details: error.flatten() },
    };
  }
  if (error instanceof GoLiveAcceptanceError) {
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

type GoLiveAcceptanceRow = {
  id: string;
  gate: GoLiveAcceptanceRecord["gate"];
  owner_name: string;
  evidence_reference: string;
  evidence_date: string | null;
  checks: GoLiveAcceptanceRecord["checks"];
  decision: GoLiveAcceptanceRecord["decision"];
  notes: string;
  created_at: string;
  reviewed_by: string;
};

function mapGoLiveAcceptance(
  row: GoLiveAcceptanceRow,
): GoLiveAcceptanceRecord {
  return {
    id: row.id,
    gate: row.gate,
    ownerName: row.owner_name,
    evidenceReference: row.evidence_reference,
    evidenceDate: row.evidence_date,
    checks: row.checks,
    decision: row.decision,
    notes: row.notes,
    recordedAt: row.created_at,
    reviewedBy: row.reviewed_by,
  };
}
