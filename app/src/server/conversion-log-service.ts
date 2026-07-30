import "server-only";
import { z } from "zod";
import { ConversionLogError } from "@/domain/conversion-log";
import { requirePermission } from "./authorization-service";
import type { TransactionSql } from "postgres";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

const logSchema = z.object({
  method: z.enum([
    "loose_stickers",
    "noviply_sheet",
    "printed_sticker",
    "direct_reprint",
  ]),
  status: z.enum(["completed", "awaiting_print"]).default("completed"),
  model: z.string().min(1).max(200),
  targetLayout: z.string().max(80).default(""),
  variant: z.string().max(20).default(""),
  sku: z.string().max(64).default(""),
  storageNumber: z.number().int().positive().max(1_000_000).nullable().default(null),
  orderReference: z.string().max(80).default(""),
  quantity: z.number().int().min(1).max(200).default(1),
  fellBackFrom: z.string().max(40).nullable().default(null),
  idempotencyKey: z.string().min(8).max(200),
  actorId: databaseUuidSchema,
});

export type LogConversionInput = z.input<typeof logSchema>;

type ConversionRow = {
  id: string;
  occurred_at: Date;
  method: string;
  status: "completed" | "awaiting_print";
  model: string;
  target_layout: string;
  variant: string;
  source_sku_text: string;
  hanging_file_number: number | null;
  order_reference: string;
  quantity: number;
  fell_back_from: string | null;
  performed_by_name: string;
};

function toEntry(row: ConversionRow) {
  return {
    id: row.id,
    occurredAt: row.occurred_at.toISOString(),
    method: row.method,
    status: row.status,
    model: row.model,
    targetLayout: row.target_layout,
    variant: row.variant,
    sku: row.source_sku_text,
    storageNumber: row.hanging_file_number,
    orderReference: row.order_reference,
    quantity: row.quantity,
    actor: row.performed_by_name,
    ...(row.fell_back_from ? { fellBackFrom: row.fell_back_from } : {}),
  };
}

const selectColumns = `
  c.id, c.occurred_at, c.method, c.status, c.model, c.target_layout, c.variant,
  c.source_sku_text, c.hanging_file_number, c.order_reference, c.quantity, c.fell_back_from,
  u.display_name as performed_by_name
`;

/**
 * De rapportage kijkt hooguit een kwartaal terug, maar hardlopers rekenen over
 * acht weken. Een half jaar dekt beide ruim.
 */
export async function listConversionLog(actorId: string, days = 190, limit = 5000) {
  await requirePermission(actorId, "inventory.view");
  const sql = database();
  const rows = await sql<ConversionRow[]>`
    select
      c.id, c.occurred_at, c.method, c.status, c.model, c.target_layout, c.variant,
      c.source_sku_text, c.hanging_file_number, c.order_reference, c.quantity, c.fell_back_from,
      u.display_name as performed_by_name
    from conversion_log c
    join users u on u.id = c.performed_by
    where c.occurred_at > now() - make_interval(days => ${days})
    order by c.occurred_at desc
    limit ${limit}
  `;
  return rows.map(toEntry);
}

/**
 * De conversie stond op "wacht op print" zodra de werkvloer een vel aanvroeg.
 * Zolang niemand die stand terugzette bleef hij daar staan, ook nadat Noviply
 * het vel had geprint — en dan meldt de rapportage werk als onafgerond dat
 * allang klaar is.
 *
 * Wordt gedraaid binnen de transactie die de aanvraag of de rondegregel
 * afhandelt, zodat de twee nooit uiteen kunnen lopen.
 */
export async function markConversionsPrinted(
  transaction: TransactionSql,
  orderReference: string,
) {
  const reference = orderReference.trim();
  if (!reference) return 0;
  const rows = await transaction<{ id: string }[]>`
    update conversion_log
    set status = 'completed'
    where order_reference = ${reference} and status = 'awaiting_print'
    returning id
  `;
  return rows.length;
}

export async function logConversion(rawInput: LogConversionInput) {
  const input = logSchema.parse(rawInput);
  await requirePermission(input.actorId, "conversion.execute");
  const model = input.model.trim();
  if (!model) {
    throw new ConversionLogError("Een conversie hoort bij een model.");
  }
  const sku = input.sku.trim().toUpperCase();
  const sql = database();

  return sql.begin(async (transaction) => {
    // Een medewerker die twee keer op "Gedaan" drukt, doet één laptop.
    await transaction`
      select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))
    `;

    const [existing] = await transaction<ConversionRow[]>`
      select ${transaction.unsafe(selectColumns)}
      from conversion_log c
      join users u on u.id = c.performed_by
      where c.idempotency_key = ${input.idempotencyKey}
      limit 1
    `;
    if (existing) {
      return { entry: toEntry(existing), duplicate: true };
    }

    // Het vel hoeft niet in de catalogus te staan: bij de andere drie methoden
    // komt er geen vel aan te pas. De tekst bewaren we altijd.
    const [known] = sku
      ? await transaction<{ id: string }[]>`
          select id from sticker_skus where sku = ${sku} limit 1
        `
      : [];

    const [inserted] = await transaction<{ id: string }[]>`
      insert into conversion_log (
        idempotency_key, method, status, model, target_layout, variant,
        sku_id, source_sku_text, hanging_file_number, order_reference, quantity,
        fell_back_from, performed_by
      )
      values (
        ${input.idempotencyKey}, ${input.method}, ${input.status}, ${model},
        ${input.targetLayout.trim()}, ${input.variant.trim()},
        ${known?.id ?? null}, ${sku}, ${input.storageNumber},
        ${input.orderReference.trim()}, ${input.quantity}, ${input.fellBackFrom}, ${input.actorId}
      )
      returning id
    `;

    const [row] = await transaction<ConversionRow[]>`
      select ${transaction.unsafe(selectColumns)}
      from conversion_log c
      join users u on u.id = c.performed_by
      where c.id = ${inserted.id}
    `;
    return { entry: toEntry(row), duplicate: false };
  });
}
