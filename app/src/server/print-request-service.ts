import "server-only";
import { z } from "zod";
import { brandFromModel, PrintRequestError } from "@/domain/print-requests";
import { requirePermission } from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

const createSchema = z.object({
  model: z.string().min(1).max(200),
  layout: z.string().max(80).default(""),
  variant: z.string().max(20).default(""),
  orderReference: z.string().max(80).default(""),
  reason: z.string().max(500).default(""),
  idempotencyKey: z.string().min(8).max(200),
  actorId: databaseUuidSchema,
});

const settleSchema = z.object({
  id: databaseUuidSchema,
  status: z.enum(["printed", "not_printable"]),
  note: z.string().max(500).default(""),
  actorId: databaseUuidSchema,
});

export type CreatePrintRequestInput = z.input<typeof createSchema>;
export type SettlePrintRequestInput = z.input<typeof settleSchema>;

type PrintRequestRow = {
  id: string;
  brand: string;
  model: string;
  layout: string;
  variant: string;
  order_reference: string;
  reason: string;
  requested_at: Date;
  requested_by_name: string;
  status: "requested" | "printed" | "not_printable";
  handled_at: Date | null;
  handled_by_name: string | null;
  note: string;
};

/** De vorm die de schermen al kennen, zodat er aan die kant niets hoeft te veranderen. */
function toRecord(row: PrintRequestRow) {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    layout: row.layout,
    variant: row.variant,
    orderReference: row.order_reference,
    reason: row.reason,
    requestedAt: row.requested_at.toISOString(),
    requestedBy: row.requested_by_name,
    status: row.status,
    handledAt: row.handled_at ? row.handled_at.toISOString() : null,
    handledBy: row.handled_by_name,
    note: row.note,
  };
}

const selectColumns = `
  r.id, r.brand, r.model, r.layout, r.variant, r.order_reference, r.reason,
  r.requested_at, r.status, r.handled_at, r.note,
  requester.display_name as requested_by_name,
  handler.display_name as handled_by_name
`;

export async function listPrintRequests(actorId: string, limit = 500) {
  await requirePermission(actorId, "inventory.view");
  const sql = database();
  const rows = await sql<PrintRequestRow[]>`
    select
      r.id, r.brand, r.model, r.layout, r.variant, r.order_reference, r.reason,
      r.requested_at, r.status, r.handled_at, r.note,
      requester.display_name as requested_by_name,
      handler.display_name as handled_by_name
    from print_requests r
    join users requester on requester.id = r.requested_by
    left join users handler on handler.id = r.handled_by
    order by r.requested_at desc
    limit ${limit}
  `;
  return rows.map(toRecord);
}

export async function createPrintRequestRecord(rawInput: CreatePrintRequestInput) {
  const input = createSchema.parse(rawInput);
  await requirePermission(input.actorId, "conversion.execute");
  const model = input.model.trim();
  if (!model) {
    throw new PrintRequestError("Een aanvraag heeft een model nodig.");
  }
  const sql = database();

  return sql.begin(async (transaction) => {
    // Twee keer op de knop mag niet twee regels opleveren voor Noviply.
    await transaction`
      select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))
    `;

    const [existing] = await transaction<PrintRequestRow[]>`
      select ${transaction.unsafe(selectColumns)}
      from print_requests r
      join users requester on requester.id = r.requested_by
      left join users handler on handler.id = r.handled_by
      where r.idempotency_key = ${input.idempotencyKey}
      limit 1
    `;
    if (existing) {
      return { record: toRecord(existing), duplicate: true };
    }

    const [inserted] = await transaction<{ id: string }[]>`
      insert into print_requests (
        idempotency_key, brand, model, layout, variant,
        order_reference, reason, requested_by
      )
      values (
        ${input.idempotencyKey}, ${brandFromModel(model)}, ${model},
        ${input.layout.trim()}, ${input.variant.trim()},
        ${input.orderReference.trim()}, ${input.reason.trim()}, ${input.actorId}
      )
      returning id
    `;

    const [row] = await transaction<PrintRequestRow[]>`
      select ${transaction.unsafe(selectColumns)}
      from print_requests r
      join users requester on requester.id = r.requested_by
      left join users handler on handler.id = r.handled_by
      where r.id = ${inserted.id}
    `;
    return { record: toRecord(row), duplicate: false };
  });
}

export async function settlePrintRequestRecord(rawInput: SettlePrintRequestInput) {
  const input = settleSchema.parse(rawInput);
  await requirePermission(input.actorId, "print.fulfil");
  const note = input.note.trim();
  // Dezelfde regel als in de database, maar hier met een uitleg die de gebruiker
  // begrijpt in plaats van een schending van een constraint.
  if (input.status === "not_printable" && note.length < 3) {
    throw new PrintRequestError("Vermeld waarom deze sticker niet geprint kan worden.");
  }
  const sql = database();

  return sql.begin(async (transaction) => {
    const [current] = await transaction<{ status: string }[]>`
      select status from print_requests where id = ${input.id} for update
    `;
    if (!current) {
      throw new PrintRequestError("Deze aanvraag bestaat niet meer.");
    }
    // Twee mensen die tegelijk afvinken: de tweede krijgt de stand te zien in
    // plaats van de eerste stilzwijgend te overschrijven.
    if (current.status !== "requested") {
      const [row] = await transaction<PrintRequestRow[]>`
        select ${transaction.unsafe(selectColumns)}
        from print_requests r
        join users requester on requester.id = r.requested_by
        left join users handler on handler.id = r.handled_by
        where r.id = ${input.id}
      `;
      return { record: toRecord(row), alreadySettled: true };
    }

    await transaction`
      update print_requests
      set status = ${input.status},
          note = ${note},
          handled_at = now(),
          handled_by = ${input.actorId}
      where id = ${input.id}
    `;

    const [row] = await transaction<PrintRequestRow[]>`
      select ${transaction.unsafe(selectColumns)}
      from print_requests r
      join users requester on requester.id = r.requested_by
      left join users handler on handler.id = r.handled_by
      where r.id = ${input.id}
    `;
    return { record: toRecord(row), alreadySettled: false };
  });
}
