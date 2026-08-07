import "server-only";
import { z } from "zod";
import type { NoviplyUnavailableRecord } from "@/domain/noviply-availability";
import { requirePermission } from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

type Row = {
  id: string;
  model: string;
  model_key: string;
  layout: string;
  reason: NoviplyUnavailableRecord["reason"];
  note: string;
  recorded_at: Date;
  recorded_by_name: string;
};

function toRecord(row: Row): NoviplyUnavailableRecord {
  return {
    id: row.id,
    model: row.model,
    modelKey: row.model_key,
    layout: row.layout,
    reason: row.reason,
    note: row.note,
    recordedAt: row.recorded_at.toISOString(),
    recordedBy: row.recorded_by_name,
  };
}

/** Wat Noviply op dit moment niet kan printen. Weggehaalde regels tellen niet mee. */
export async function listNoviplyUnavailable() {
  const sql = database();
  const rows = await sql<Row[]>`
    select u.id, u.model, u.model_key, u.layout, u.reason, u.note, u.recorded_at,
           gebruiker.display_name as recorded_by_name
    from noviply_unavailable u
    join users gebruiker on gebruiker.id = u.recorded_by
    where u.removed_at is null
    order by u.recorded_at desc
  `;
  return rows.map(toRecord);
}

const removeSchema = z.object({
  id: databaseUuidSchema,
  actorId: databaseUuidSchema,
});

/**
 * Nemen ze het model later alsnog op, dan haalt management de regel hier weg en
 * adviseert de app de premiumsticker gewoon weer. De regel blijft staan met een
 * datum erbij, zodat terug te zoeken is dat het er ooit was.
 */
export async function removeNoviplyUnavailable(rawInput: z.input<typeof removeSchema>) {
  const input = removeSchema.parse(rawInput);
  /*
   * Wie zegt dat het niet kan, mag ook zeggen dat het weer kan. Dit stond op
   * `policies.manage` en dat heeft Noviply niet — terwijl zij het zijn die de
   * blokkade hebben gemeld en als eerste weten dat de folie binnen is. Dan moet
   * er nu iemand van ReMarkt tussen die het van hen hoort en het overtikt.
   */
  await requirePermission(input.actorId, "print.fulfil");
  const sql = database();
  const [row] = await sql<{ id: string }[]>`
    update noviply_unavailable
    set removed_at = now(), removed_by = ${input.actorId}
    where id = ${input.id} and removed_at is null
    returning id
  `;
  return { removed: Boolean(row) };
}
