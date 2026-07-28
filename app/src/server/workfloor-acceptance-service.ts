import "server-only";
import { z } from "zod";
import {
  createWorkfloorTrialRecord,
  WorkfloorTrialError,
  workfloorTrialInputSchema,
  type WorkfloorTrialRecord,
} from "@/domain/workfloor-acceptance";
import {
  AuthorizationError,
  requirePermission,
} from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

export const recordWorkfloorTrialSchema = workfloorTrialInputSchema.extend({
  idempotencyKey: z.string().min(8).max(200),
  actorId: databaseUuidSchema,
});

export type RecordWorkfloorTrialRequest = z.input<
  typeof recordWorkfloorTrialSchema
>;

export async function recordWorkfloorTrial(
  rawInput: RecordWorkfloorTrialRequest,
) {
  const input = recordWorkfloorTrialSchema.parse(rawInput);
  const validated = createWorkfloorTrialRecord(input, {
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

    const [existing] = await transaction<WorkfloorTrialRow[]>`
      select
        trial.id,
        trial.trial_reference,
        trial.location,
        trial.device_type,
        trial.device_name,
        trial.scanner_name,
        trial.participants,
        trial.orders_tested,
        trial.started_at::text,
        trial.completed_at::text,
        trial.average_handling_seconds,
        trial.methods,
        trial.error_scenario_tested,
        trial.checks,
        trial.result::text,
        trial.evidence_reference,
        coalesce(trial.notes, '') as notes,
        trial.created_at::text,
        actor.display_name as recorded_by
      from workfloor_acceptance_trials trial
      inner join users actor on actor.id = trial.recorded_by
      where trial.idempotency_key = ${input.idempotencyKey}
      limit 1
    `;
    if (existing) {
      return { record: mapWorkfloorTrial(existing), duplicate: true };
    }

    const [created] = await transaction<WorkfloorTrialRow[]>`
      insert into workfloor_acceptance_trials (
        idempotency_key,
        trial_reference,
        location,
        device_type,
        device_name,
        scanner_name,
        participants,
        orders_tested,
        started_at,
        completed_at,
        average_handling_seconds,
        methods,
        error_scenario_tested,
        checks,
        result,
        evidence_reference,
        notes,
        recorded_by
      )
      values (
        ${input.idempotencyKey},
        ${validated.trialReference},
        ${validated.location},
        ${validated.deviceType},
        ${validated.deviceName},
        ${validated.scannerName},
        ${validated.participants},
        ${validated.ordersTested},
        ${validated.startedAt}::timestamptz,
        ${validated.completedAt}::timestamptz,
        ${validated.averageHandlingSeconds},
        ${transaction.json(validated.methods)},
        ${validated.errorScenarioTested},
        ${transaction.json(validated.checks)},
        ${validated.result}::workfloor_trial_result,
        ${validated.evidenceReference},
        ${validated.notes || null},
        ${input.actorId}::uuid
      )
      returning
        id,
        trial_reference,
        location,
        device_type,
        device_name,
        scanner_name,
        participants,
        orders_tested,
        started_at::text,
        completed_at::text,
        average_handling_seconds,
        methods,
        error_scenario_tested,
        checks,
        result::text,
        evidence_reference,
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
        'operations.workfloor_trial_recorded',
        'workfloor_acceptance_trial',
        ${created.id},
        ${transaction.json({
          trialReference: validated.trialReference,
          location: validated.location,
          ordersTested: validated.ordersTested,
          result: validated.result,
          evidenceReference: validated.evidenceReference,
        })}
      )
    `;

    return { record: mapWorkfloorTrial(created), duplicate: false };
  });
}

export async function listWorkfloorTrials(actorId: string) {
  const parsedActorId = databaseUuidSchema.parse(actorId);
  await requirePermission(parsedActorId, "reports.view");
  const sql = database();
  const rows = await sql<WorkfloorTrialRow[]>`
    select
      trial.id,
      trial.trial_reference,
      trial.location,
      trial.device_type,
      trial.device_name,
      trial.scanner_name,
      trial.participants,
      trial.orders_tested,
      trial.started_at::text,
      trial.completed_at::text,
      trial.average_handling_seconds,
      trial.methods,
      trial.error_scenario_tested,
      trial.checks,
      trial.result::text,
      trial.evidence_reference,
      coalesce(trial.notes, '') as notes,
      trial.created_at::text,
      actor.display_name as recorded_by
    from workfloor_acceptance_trials trial
    inner join users actor on actor.id = trial.recorded_by
    order by trial.created_at desc
    limit 250
  `;
  return rows.map(mapWorkfloorTrial);
}

export function workfloorTrialErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { error: "INVALID_INPUT", details: error.flatten() },
    };
  }
  if (error instanceof WorkfloorTrialError) {
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

type WorkfloorTrialRow = {
  id: string;
  trial_reference: string;
  location: string;
  device_type: WorkfloorTrialRecord["deviceType"];
  device_name: string;
  scanner_name: string;
  participants: number;
  orders_tested: number;
  started_at: string;
  completed_at: string | null;
  average_handling_seconds: number | null;
  methods: WorkfloorTrialRecord["methods"];
  error_scenario_tested: boolean;
  checks: WorkfloorTrialRecord["checks"];
  result: WorkfloorTrialRecord["result"];
  evidence_reference: string;
  notes: string;
  created_at: string;
  recorded_by: string;
};

function mapWorkfloorTrial(row: WorkfloorTrialRow): WorkfloorTrialRecord {
  return {
    id: row.id,
    trialReference: row.trial_reference,
    location: row.location,
    deviceType: row.device_type,
    deviceName: row.device_name,
    scannerName: row.scanner_name,
    participants: row.participants,
    ordersTested: row.orders_tested,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    averageHandlingSeconds: row.average_handling_seconds,
    methods: row.methods,
    errorScenarioTested: row.error_scenario_tested,
    checks: row.checks,
    result: row.result,
    evidenceReference: row.evidence_reference,
    notes: row.notes,
    recordedAt: row.created_at,
    recordedBy: row.recorded_by,
  };
}
