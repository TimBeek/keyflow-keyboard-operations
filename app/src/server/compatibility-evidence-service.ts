import "server-only";
import { z } from "zod";
import { inventoryCatalog } from "@/data/inventory-catalog";
import {
  CompatibilityEvidenceError,
  createCompatibilityEvidenceRecord,
} from "@/domain/compatibility-evidence";
import {
  AuthorizationError,
  requirePermission,
} from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

const checkpointSchema = z.object({
  enterShape: z.boolean(),
  shiftKeys: z.boolean(),
  arrowKeys: z.boolean(),
  functionRow: z.boolean(),
  pointingStickAndNumpad: z.boolean(),
});

export const compatibilityEvidenceSchema = z.object({
  catalogKey: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  status: z.enum(["approved", "rejected"]),
  manufacturerPartNumber: z.string().max(100),
  photoReference: z.string().max(200),
  keyboardWidthMm: z.number(),
  keyboardHeightMm: z.number(),
  checkpoints: checkpointSchema,
  notes: z.string().max(500).default(""),
  idempotencyKey: z.string().min(8).max(200),
  actorId: databaseUuidSchema,
});

export type CompatibilityEvidenceRequest = z.input<
  typeof compatibilityEvidenceSchema
>;

export async function recordCompatibilityEvidence(
  rawInput: CompatibilityEvidenceRequest,
) {
  const input = compatibilityEvidenceSchema.parse(rawInput);
  const record = createCompatibilityEvidenceRecord(
    inventoryCatalog,
    input,
    {
      id: input.idempotencyKey,
      recordedAt: new Date().toISOString(),
      reviewer: input.actorId,
    },
  );

  await requirePermission(input.actorId, "models.manage");
  const sql = database();

  return sql.begin(async (transaction) => {
    await transaction`
      select pg_advisory_xact_lock(
        hashtextextended(${input.idempotencyKey}, 0)
      )
    `;

    const [existing] = await transaction<{
      id: string;
      status: "approved" | "rejected";
      reviewed_at: string;
      reviewer: string;
    }[]>`
      select
        evidence.id,
        evidence.status::text,
        evidence.reviewed_at::text,
        actor.display_name as reviewer
      from compatibility_evidence evidence
      inner join users actor on actor.id = evidence.reviewed_by
      where evidence.idempotency_key = ${input.idempotencyKey}
      limit 1
    `;

    if (existing) {
      return {
        evidenceId: existing.id,
        status: existing.status,
        reviewedAt: existing.reviewed_at,
        reviewer: existing.reviewer,
        duplicate: true,
      };
    }

    const normalizedModel = normalizeModel(input.model);
    const [references] = await transaction<{
      sku_id: string | null;
      model_id: string | null;
      reviewer: string | null;
    }[]>`
      select
        (
          select id
          from sticker_skus
          where upper(sku) = upper(${record.sku})
          limit 1
        ) as sku_id,
        (
          select model.id
          from laptop_models model
          left join model_aliases alias on alias.model_id = model.id
          where model.normalized_name = ${normalizedModel}
            or alias.normalized_alias = ${normalizedModel}
          order by model.created_at
          limit 1
        ) as model_id,
        (
          select display_name
          from users
          where id = ${input.actorId}::uuid
            and active = true
          limit 1
        ) as reviewer
    `;

    if (!references.sku_id) {
      throw new CompatibilityEvidencePersistenceError(
        "COMPATIBILITY_SKU_NOT_FOUND",
        `SKU ${record.sku} bestaat nog niet in de centrale catalogus.`,
      );
    }
    if (!references.model_id) {
      throw new CompatibilityEvidencePersistenceError(
        "COMPATIBILITY_MODEL_NOT_FOUND",
        `Model ${record.model} bestaat nog niet in de centrale laptopdatabase.`,
      );
    }

    const [created] = await transaction<{ id: string; reviewed_at: string }[]>`
      insert into compatibility_evidence (
        idempotency_key,
        catalog_key,
        sku_id,
        model_id,
        status,
        variant_code,
        manufacturer_part_number,
        photo_reference,
        keyboard_width_mm,
        keyboard_height_mm,
        checkpoints,
        notes,
        reviewed_by
      )
      values (
        ${input.idempotencyKey},
        ${record.catalogKey},
        ${references.sku_id}::uuid,
        ${references.model_id}::uuid,
        ${record.status}::keyboard_reference_status,
        ${record.variant},
        ${record.manufacturerPartNumber},
        ${record.photoReference},
        ${record.keyboardWidthMm},
        ${record.keyboardHeightMm},
        ${JSON.stringify(record.checkpoints)}::jsonb,
        ${record.notes || null},
        ${input.actorId}::uuid
      )
      returning id, reviewed_at::text
    `;

    return {
      evidenceId: created.id,
      status: record.status,
      reviewedAt: created.reviewed_at,
      reviewer: references.reviewer,
      duplicate: false,
    };
  });
}

export function compatibilityEvidenceErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { error: "INVALID_INPUT", details: error.flatten() },
    };
  }
  if (error instanceof CompatibilityEvidenceError) {
    return {
      status: 409,
      body: {
        error: "COMPATIBILITY_EVIDENCE_INCOMPLETE",
        message: error.message,
      },
    };
  }
  if (error instanceof CompatibilityEvidencePersistenceError) {
    return {
      status: 404,
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

export class CompatibilityEvidencePersistenceError extends Error {
  constructor(
    public readonly code:
      | "COMPATIBILITY_SKU_NOT_FOUND"
      | "COMPATIBILITY_MODEL_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "CompatibilityEvidencePersistenceError";
  }
}

function normalizeModel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}
