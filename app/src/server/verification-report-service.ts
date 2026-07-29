import "server-only";
import { z } from "zod";
import { requirePermission } from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

/**
 * Wat de werkvloer meldt als een vel niet past: verkeerde entervorm, verkeerde
 * taal, verkeerde hangmap. Dat stond alleen in de browser van degene die het
 * meldde — waardoor management nooit zag dát er iets structureel misging, en
 * dezelfde fout elke week terugkwam.
 */

const reportSchema = z.object({
  orderReference: z.string().max(80).default(""),
  sku: z.string().min(1).max(64),
  storageNumber: z.number().int().positive().max(1_000_000),
  model: z.string().min(1).max(200),
  targetLayout: z.string().min(1).max(80),
  variant: z.string().max(20).default(""),
  outcome: z.enum(["passed", "blocked_unused", "scrapped"]),
  failureReason: z.enum([
    "wrong_storage",
    "wrong_sku",
    "wrong_layout",
    "wrong_variant",
    "position_mismatch",
    "other",
  ]).optional(),
  idempotencyKey: z.string().min(8).max(200),
  actorId: databaseUuidSchema,
});

export type RecordVerificationInput = z.input<typeof reportSchema>;

type Row = {
  id: string;
  checked_at: Date;
  order_reference: string;
  hanging_file_number: number;
  model_name: string;
  variant: string;
  outcome: "passed" | "blocked_unused" | "scrapped";
  failure_reason: string | null;
  sku: string;
  layout_code: string;
  actor_name: string;
};

function toReport(row: Row) {
  return {
    id: row.id,
    occurredAt: row.checked_at.toISOString(),
    orderReference: row.order_reference,
    sku: row.sku,
    storageNumber: row.hanging_file_number,
    model: row.model_name,
    targetLayout: row.layout_code.replace(/_/g, " "),
    variant: row.variant,
    outcome: row.outcome,
    ...(row.failure_reason ? { failureReason: row.failure_reason } : {}),
    actor: row.actor_name,
  };
}

export async function listVerificationReports(limit = 1000) {
  const sql = database();
  const rows = await sql<Row[]>`
    select r.id, r.checked_at, r.order_reference, r.hanging_file_number,
           r.model_name, r.variant, r.outcome, r.failure_reason,
           coalesce(s.sku, '') as sku,
           coalesce(l.code, '') as layout_code,
           u.display_name as actor_name
    from sticker_verification_reports r
    left join sticker_skus s on s.id = r.sku_id
    left join keyboard_layouts l on l.id = r.target_layout_id
    join users u on u.id = r.checked_by
    order by r.checked_at desc
    limit ${limit}
  `;
  return rows.map(toReport);
}

export async function recordVerificationReport(rawInput: RecordVerificationInput) {
  const input = reportSchema.parse(rawInput);
  await requirePermission(input.actorId, "conversion.execute");
  const sql = database();

  return sql.begin(async (transaction) => {
    const [sku] = await transaction<{ id: string }[]>`
      select id from sticker_skus where sku = ${input.sku.toUpperCase()} limit 1
    `;
    if (!sku) {
      throw new Error(`Artikelnummer ${input.sku} staat niet in de catalogus.`);
    }
    // De layoutcode in de database gebruikt liggende streepjes.
    const layoutCode = input.targetLayout.trim().toUpperCase().replace(/[\s/]+/g, "_");
    const [layout] = await transaction<{ id: string }[]>`
      select id from keyboard_layouts where code = ${layoutCode} limit 1
    `;
    if (!layout) {
      throw new Error(`Layout ${input.targetLayout} is onbekend.`);
    }

    const [inserted] = await transaction<{ id: string }[]>`
      insert into sticker_verification_reports (
        order_reference, sku_id, hanging_file_number, model_name,
        target_layout_id, variant, outcome, failure_reason, checked_by
      )
      values (
        ${input.orderReference}, ${sku.id}, ${input.storageNumber}, ${input.model},
        ${layout.id}, ${input.variant}, ${input.outcome},
        ${input.failureReason ?? null}, ${input.actorId}
      )
      returning id
    `;

    const [row] = await transaction<Row[]>`
      select r.id, r.checked_at, r.order_reference, r.hanging_file_number,
             r.model_name, r.variant, r.outcome, r.failure_reason,
             coalesce(s.sku, '') as sku,
             coalesce(l.code, '') as layout_code,
             u.display_name as actor_name
      from sticker_verification_reports r
      left join sticker_skus s on s.id = r.sku_id
      left join keyboard_layouts l on l.id = r.target_layout_id
      join users u on u.id = r.checked_by
      where r.id = ${inserted.id}
    `;
    return { report: toReport(row) };
  });
}
