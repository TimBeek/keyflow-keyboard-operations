import "server-only";
import { z } from "zod";
import { brandFromModel } from "@/domain/print-requests";
import { RunWaitlistError, type RunWaitlistEntry } from "@/domain/run-waitlist";
import { requirePermission } from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

/**
 * De laptops die apart staan tot de volgende printronde.
 *
 * Dit is nadrukkelijk géén aanvraag bij Noviply: zij zien deze lijst niet, en
 * horen dat ook niet te doen, want het vel komt vanzelf met hun eigen ronde
 * mee. Blijkt na de ronde dat het er tóch niet ligt, dan pas ontstaat er een
 * echte aanvraag — en dan verwijst deze regel daarnaar, zodat je later kunt
 * terugzien dat het eerst is afgewacht.
 */

const addSchema = z.object({
  model: z.string().min(1).max(200),
  layout: z.string().max(80).default(""),
  variant: z.string().max(20).default(""),
  orderReference: z.string().min(1).max(80),
  expectedRunAt: z.string().min(1),
  expectedRunLabel: z.string().max(20).default(""),
  idempotencyKey: z.string().min(8).max(200),
  actorId: databaseUuidSchema,
});

const settleSchema = z.object({
  id: databaseUuidSchema,
  outcome: z.enum(["collected", "escalated"]),
  actorId: databaseUuidSchema,
});

export type AddToRunWaitlistInput = z.input<typeof addSchema>;
export type SettleRunWaitlistInput = z.input<typeof settleSchema>;

type Row = {
  id: string;
  model: string;
  layout: string;
  variant: string;
  order_reference: string;
  expected_run_at: Date;
  expected_run_label: string;
  created_at: Date;
  created_by_name: string;
  status: "waiting" | "collected" | "escalated";
  settled_at: Date | null;
  settled_by_name: string | null;
};

const selectColumns = `
  w.id, w.model, w.layout, w.variant, w.order_reference,
  w.expected_run_at, w.expected_run_label, w.created_at, w.status, w.settled_at,
  creator.display_name as created_by_name,
  settler.display_name as settled_by_name
`;

function toRecord(row: Row): RunWaitlistEntry {
  return {
    id: row.id,
    model: row.model,
    layout: row.layout,
    variant: row.variant,
    orderReference: row.order_reference,
    expectedRunAt: row.expected_run_at.toISOString(),
    expectedRunLabel: row.expected_run_label,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by_name,
    status: row.status,
    settledAt: row.settled_at ? row.settled_at.toISOString() : null,
    settledBy: row.settled_by_name,
  };
}

export async function listRunWaitlist(limit = 200) {
  const sql = database();
  const rows = await sql<Row[]>`
    select ${sql.unsafe(selectColumns)}
    from print_run_waitlist w
    join users creator on creator.id = w.created_by
    left join users settler on settler.id = w.settled_by
    order by w.expected_run_at desc, w.created_at desc
    limit ${limit}
  `;
  return rows.map(toRecord);
}

export async function addToRunWaitlist(rawInput: AddToRunWaitlistInput) {
  const input = addSchema.parse(rawInput);
  await requirePermission(input.actorId, "conversion.execute");
  const expected = new Date(input.expectedRunAt);
  if (Number.isNaN(expected.getTime())) {
    throw new RunWaitlistError("De printronde is niet bekend.");
  }
  const sql = database();

  return sql.begin(async (transaction) => {
    // Twee keer op de knop is één laptop, geen twee.
    await transaction`
      select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))
    `;

    const [existing] = await transaction<Row[]>`
      select ${transaction.unsafe(selectColumns)}
      from print_run_waitlist w
      join users creator on creator.id = w.created_by
      left join users settler on settler.id = w.settled_by
      where w.idempotency_key = ${input.idempotencyKey}
         or (w.order_reference = ${input.orderReference.trim()}
             and w.expected_run_at = ${expected}
             and w.status = 'waiting')
      limit 1
    `;
    if (existing) {
      return { record: toRecord(existing), duplicate: true };
    }

    const [inserted] = await transaction<{ id: string }[]>`
      insert into print_run_waitlist (
        idempotency_key, model, layout, variant, order_reference,
        expected_run_at, expected_run_label, created_by
      )
      values (
        ${input.idempotencyKey}, ${input.model.trim()}, ${input.layout.trim()},
        ${input.variant.trim()}, ${input.orderReference.trim()},
        ${expected}, ${input.expectedRunLabel.trim()}, ${input.actorId}
      )
      returning id
    `;
    const [row] = await transaction<Row[]>`
      select ${transaction.unsafe(selectColumns)}
      from print_run_waitlist w
      join users creator on creator.id = w.created_by
      left join users settler on settler.id = w.settled_by
      where w.id = ${inserted.id}
    `;
    return { record: toRecord(row), duplicate: false };
  });
}

/**
 * Na de ronde: het vel lag er (collected), of het lag er niet en dan gaat er
 * alsnog een aanvraag naar Noviply (escalated).
 */
export async function settleRunWaitlistEntry(rawInput: SettleRunWaitlistInput) {
  const input = settleSchema.parse(rawInput);
  await requirePermission(input.actorId, "conversion.execute");
  const sql = database();

  return sql.begin(async (transaction) => {
    const [entry] = await transaction<{
      id: string;
      model: string;
      layout: string;
      variant: string;
      order_reference: string;
      expected_run_label: string;
    }[]>`
      select id, model, layout, variant, order_reference, expected_run_label
      from print_run_waitlist
      where id = ${input.id} and status = 'waiting'
      for update
    `;
    if (!entry) {
      throw new RunWaitlistError("Deze laptop is al afgehandeld.");
    }

    let printRequestId: string | null = null;
    if (input.outcome === "escalated") {
      const model = entry.model.trim();
      const [request] = await transaction<{ id: string }[]>`
        insert into print_requests (
          idempotency_key, brand, model, layout, variant,
          order_reference, reason, requested_by
        )
        values (
          ${`waitlist-${entry.id}`}, ${brandFromModel(model)}, ${model},
          ${entry.layout}, ${entry.variant}, ${entry.order_reference},
          ${`Lag er na de ronde van ${entry.expected_run_label || "vandaag"} nog steeds niet bij.`},
          ${input.actorId}
        )
        on conflict (idempotency_key) do update set order_reference = excluded.order_reference
        returning id
      `;
      printRequestId = request.id;
    }

    await transaction`
      update print_run_waitlist
      set status = ${input.outcome},
          settled_at = now(),
          settled_by = ${input.actorId},
          print_request_id = ${printRequestId}
      where id = ${input.id}
    `;
    return { settled: true, printRequestId };
  });
}
