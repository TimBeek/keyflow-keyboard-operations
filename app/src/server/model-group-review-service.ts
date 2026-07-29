import "server-only";
import { z } from "zod";
import { inventoryCatalog } from "@/data/inventory-catalog";
import {
  createModelGroupDecision,
  createModelGroupProposals,
  ModelGroupReviewError,
} from "@/domain/model-grouping";
import {
  AuthorizationError,
  requirePermission,
} from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

const evidenceSchema = z.object({
  exactVariantConfirmed: z.boolean(),
  manufacturerPartNumberConfirmed: z.boolean(),
  photoConfirmed: z.boolean(),
  dryFitPassed: z.boolean(),
});

export const reviewModelGroupSchema = z.object({
  proposalId: z.string().min(1).max(200),
  status: z.enum(["approved", "rejected"]),
  manufacturerPartNumber: z.string().max(100).default(""),
  photoReference: z.string().max(200).default(""),
  notes: z.string().max(500).default(""),
  excludedModels: z.array(z.string().max(200)).max(200).default([]),
  evidence: evidenceSchema,
  idempotencyKey: z.string().min(8).max(200),
  actorId: databaseUuidSchema,
});

export type ReviewModelGroupInput = z.input<typeof reviewModelGroupSchema>;

const proposalsById = new Map(
  createModelGroupProposals(inventoryCatalog).map((proposal) => [
    proposal.id,
    proposal,
  ]),
);

export async function reviewModelGroup(rawInput: ReviewModelGroupInput) {
  const input = reviewModelGroupSchema.parse(rawInput);
  const proposal = proposalsById.get(input.proposalId);
  if (!proposal) {
    throw new ModelGroupPersistenceError(
      "MODEL_GROUP_PROPOSAL_NOT_FOUND",
      "Dit modelgroepvoorstel bestaat niet meer in de actuele catalogus.",
    );
  }

  createModelGroupDecision(
    proposal,
    {
      status: input.status,
      manufacturerPartNumber: input.manufacturerPartNumber,
      photoReference: input.photoReference,
      notes: input.notes,
      evidence: input.evidence,
      excludedModels: input.excludedModels,
    },
    {
      id: input.idempotencyKey,
      decidedAt: new Date().toISOString(),
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
      proposal_id: string;
      suggestion_key: string;
      decision: "approved" | "rejected";
      reviewed_at: string;
      reviewer: string;
    }[]>`
      select
        review.id,
        review.proposal_id,
        proposal.suggestion_key,
        review.decision,
        review.reviewed_at::text,
        actor.display_name as reviewer
      from model_group_reviews review
      inner join model_group_proposals proposal on proposal.id = review.proposal_id
      inner join users actor on actor.id = review.reviewed_by
      where review.idempotency_key = ${input.idempotencyKey}
      limit 1
    `;

    if (existing) {
      return {
        reviewId: existing.id,
        proposalRecordId: existing.proposal_id,
        proposalId: existing.suggestion_key,
        status: existing.decision,
        reviewedAt: existing.reviewed_at,
        reviewer: existing.reviewer,
        duplicate: true,
      };
    }

    const [references] = await transaction<{
      sku_id: string | null;
      layout_id: string | null;
      reviewer: string;
    }[]>`
      select
        (
          select id
          from sticker_skus
          where upper(sku) = upper(${proposal.sku})
          limit 1
        ) as sku_id,
        (
          select id
          from keyboard_layouts
          where upper(code) = replace(upper(${proposal.layout}), ' ', '_')
            or upper(name) = upper(${proposal.layout})
          limit 1
        ) as layout_id,
        (
          select display_name
          from users
          where id = ${input.actorId}::uuid
            and active = true
          limit 1
        ) as reviewer
    `;

    const riskFlags = proposal.conflictingModels.map(
      (model) => `${model} is aan meerdere SKU/layout-combinaties gekoppeld.`,
    );
    const [proposalRecord] = await transaction<{ id: string }[]>`
      insert into model_group_proposals (
        suggestion_key,
        proposed_name,
        manufacturer,
        sku_id,
        layout_id,
        variant_code,
        candidate_models,
        source_evidence,
        risk_flags,
        confidence,
        source,
        status
      )
      values (
        ${proposal.id},
        ${proposal.proposedName},
        ${proposal.manufacturer},
        ${references.sku_id}::uuid,
        ${references.layout_id}::uuid,
        ${proposal.variant},
        ${JSON.stringify(proposal.models)}::jsonb,
        ${JSON.stringify(proposal.evidence)}::jsonb,
        ${JSON.stringify(riskFlags)}::jsonb,
        ${proposal.confidence},
        'catalog_assistant',
        ${input.status}::model_group_proposal_status
      )
      on conflict (suggestion_key) do update set
        proposed_name = excluded.proposed_name,
        manufacturer = excluded.manufacturer,
        sku_id = excluded.sku_id,
        layout_id = excluded.layout_id,
        variant_code = excluded.variant_code,
        candidate_models = excluded.candidate_models,
        source_evidence = excluded.source_evidence,
        risk_flags = excluded.risk_flags,
        confidence = excluded.confidence,
        status = excluded.status,
        updated_at = now()
      returning id
    `;

    const [review] = await transaction<{ id: string; reviewed_at: string }[]>`
      insert into model_group_reviews (
        proposal_id,
        idempotency_key,
        decision,
        manufacturer_part_number,
        photo_reference,
        evidence,
        excluded_models,
        notes,
        reviewed_by
      )
      values (
        ${proposalRecord.id}::uuid,
        ${input.idempotencyKey},
        ${input.status}::model_group_review_decision,
        ${input.manufacturerPartNumber.trim() || null},
        ${input.photoReference.trim() || null},
        ${JSON.stringify(input.evidence)}::jsonb,
        ${JSON.stringify(input.excludedModels)}::jsonb,
        ${input.notes.trim() || null},
        ${input.actorId}::uuid
      )
      returning id, reviewed_at::text
    `;

    return {
      reviewId: review.id,
      proposalRecordId: proposalRecord.id,
      proposalId: proposal.id,
      status: input.status,
      reviewedAt: review.reviewed_at,
      reviewer: references.reviewer,
      duplicate: false,
    };
  });
}

export function modelGroupReviewErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { error: "INVALID_INPUT", details: error.flatten() },
    };
  }
  if (error instanceof ModelGroupReviewError) {
    return {
      status: 409,
      body: { error: "MODEL_GROUP_EVIDENCE_INCOMPLETE", message: error.message },
    };
  }
  if (error instanceof ModelGroupPersistenceError) {
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

export class ModelGroupPersistenceError extends Error {
  constructor(
    public readonly code: "MODEL_GROUP_PROPOSAL_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "ModelGroupPersistenceError";
  }
}
