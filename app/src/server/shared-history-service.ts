import "server-only";
import { database } from "./database";

/**
 * De leeskant van wat management deelt: tellingen, layoutgroepbesluiten,
 * compatibiliteitsbewijs en controlerapporten. De schrijfkant zat er al, maar
 * uitlezen kon alleen uit de eigen browser — waardoor een besluit van de één
 * onzichtbaar bleef voor de ander.
 */

function catalogKeyFor(hangingFileNumber: number) {
  return `hangmap-${String(hangingFileNumber).padStart(3, "0")}`;
}

export async function listStockCounts(limit = 1000) {
  const sql = database();
  const rows = await sql<{
    id: string;
    counted_at: Date;
    hanging_file_number: number;
    sku: string;
    name: string;
    expected_quantity: number;
    counted_quantity: number;
    difference: number;
    notes: string | null;
    actor_name: string;
  }[]>`
    select l.id, l.counted_at, l.hanging_file_number, l.expected_quantity,
           l.counted_quantity, l.difference, l.notes,
           coalesce(s.sku, l.source_sku_text, '') as sku,
           coalesce(s.name, '') as name,
           u.display_name as actor_name
    from stock_count_lines l
    left join sticker_skus s on s.id = l.sku_id
    join users u on u.id = l.counted_by
    order by l.counted_at desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.counted_at.toISOString(),
    catalogKey: catalogKeyFor(row.hanging_file_number),
    storageNumber: row.hanging_file_number,
    sku: row.sku,
    model: row.name.split("·")[0]?.trim() ?? "",
    expectedQuantity: row.expected_quantity,
    countedQuantity: row.counted_quantity,
    difference: row.difference,
    status: row.difference === 0
      ? ("matched" as const)
      : row.difference < 0 ? ("shortage" as const) : ("overage" as const),
    notes: row.notes ?? undefined,
    actor: row.actor_name,
  }));
}

export async function listModelGroupDecisions(limit = 2000) {
  const sql = database();
  const rows = await sql<{
    id: string;
    proposal_id: string;
    reviewed_at: Date;
    decision: "approved" | "rejected";
    manufacturer_part_number: string | null;
    photo_reference: string | null;
    evidence: Record<string, boolean>;
    notes: string | null;
    excluded_models: string[] | null;
    added_models: string[] | null;
    reviewer_name: string;
    suggestion_key: string;
  }[]>`
    select r.id, r.proposal_id, r.reviewed_at, r.decision, r.manufacturer_part_number,
           r.photo_reference, r.evidence, r.notes, r.excluded_models, r.added_models,
           u.display_name as reviewer_name,
           p.suggestion_key
    from model_group_reviews r
    join users u on u.id = r.reviewed_by
    join model_group_proposals p on p.id = r.proposal_id
    order by r.reviewed_at desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    // De schermen kennen het voorstel bij zijn eigen sleutel, niet bij het
    // database-id.
    proposalId: row.suggestion_key,
    decidedAt: row.reviewed_at.toISOString(),
    reviewer: row.reviewer_name,
    status: row.decision,
    manufacturerPartNumber: row.manufacturer_part_number ?? "",
    photoReference: row.photo_reference ?? "",
    notes: row.notes ?? "",
    excludedModels: row.excluded_models ?? [],
    addedModels: row.added_models ?? [],
    evidence: {
      exactVariantConfirmed: Boolean(row.evidence?.exactVariantConfirmed),
      manufacturerPartNumberConfirmed: Boolean(row.evidence?.manufacturerPartNumberConfirmed),
      photoConfirmed: Boolean(row.evidence?.photoConfirmed),
      dryFitPassed: Boolean(row.evidence?.dryFitPassed),
    },
  }));
}

export async function listCompatibilityEvidence(limit = 2000) {
  const sql = database();
  const rows = await sql<{
    id: string;
    reviewed_at: Date;
    reviewer_name: string;
    catalog_key: string;
    model_name: string;
    sku: string;
    layout_code: string;
    variant_code: string;
    status: "approved" | "rejected";
    manufacturer_part_number: string;
    photo_reference: string;
    keyboard_width_mm: string;
    keyboard_height_mm: string;
    checkpoints: Record<string, boolean>;
    notes: string | null;
  }[]>`
    select e.id, e.reviewed_at, e.catalog_key, e.variant_code, e.status,
           e.manufacturer_part_number, e.photo_reference,
           e.keyboard_width_mm, e.keyboard_height_mm, e.checkpoints, e.notes,
           coalesce(s.sku, '') as sku,
           coalesce(m.model_name, '') as model_name,
           coalesce(l.code, '') as layout_code,
           u.display_name as reviewer_name
    from compatibility_evidence e
    left join sticker_skus s on s.id = e.sku_id
    left join laptop_models m on m.id = e.model_id
    left join keyboard_layouts l on l.id = s.layout_id
    join users u on u.id = e.reviewed_by
    order by e.reviewed_at desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    recordedAt: row.reviewed_at.toISOString(),
    reviewer: row.reviewer_name,
    catalogKey: row.catalog_key,
    model: row.model_name,
    sku: row.sku,
    storageNumber: Number(row.catalog_key.replace("hangmap-", "")),
    layout: row.layout_code.replace(/_/g, " "),
    variant: row.variant_code,
    status: row.status,
    manufacturerPartNumber: row.manufacturer_part_number,
    photoReference: row.photo_reference,
    keyboardWidthMm: Number(row.keyboard_width_mm),
    keyboardHeightMm: Number(row.keyboard_height_mm),
    checkpoints: {
      enterShape: Boolean(row.checkpoints?.enterShape),
      shiftKeys: Boolean(row.checkpoints?.shiftKeys),
      arrowKeys: Boolean(row.checkpoints?.arrowKeys),
      functionRow: Boolean(row.checkpoints?.functionRow),
      pointingStickAndNumpad: Boolean(row.checkpoints?.pointingStickAndNumpad),
    },
    notes: row.notes ?? "",
  }));
}
