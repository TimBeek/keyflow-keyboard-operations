import "server-only";
import { z } from "zod";
import {
  modelKey,
  reasonBlocksFuture,
  scopeForReason,
  type NoviplyUnavailableRecord,
  type UnavailableReason,
} from "@/domain/noviply-availability";
import { requirePermission } from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";
import type { TransactionSql } from "postgres";

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

/**
 * Vastleggen dat Noviply dit niet kan printen.
 *
 * Stond alleen in print-request-service, waardoor een regel uit een printronde
 * die op "cannot print" ging nergens landde: de werkvloer kreeg de volgende
 * laptop van hetzelfde model gewoon weer de premiumsticker aangeraden, Noviply
 * kon in hun eigen lijst niet zien dat het er stond, en niemand kon het
 * terugdraaien. De rondes zijn juist het grootste deel van het werk.
 *
 * Nu schrijven beide kanten via deze ene functie, in dezelfde transactie als de
 * afhandeling zelf. Slaagt de vastlegging niet, dan is de afhandeling ook niet
 * gebeurd — half werk is hier erger dan geen werk.
 */
export async function recordNoviplyUnavailable(
  transaction: TransactionSql<Record<string, unknown>>,
  invoer: {
    model: string;
    layout: string;
    reason: UnavailableReason;
    note: string;
    actorId: string;
    /** De aanvraag waar het uit voortkwam; leeg bij een regel uit een ronde. */
    sourceRequestId?: string | null;
    /** De rondesregel waar het uit voortkwam; zo weet Undo wat hij mag intrekken. */
    sourceBatchRowId?: string | null;
  },
) {
  // "Het materiaal is op" is morgen voorbij en hoort geen blokkade te worden.
  if (!reasonBlocksFuture(invoer.reason)) return { recorded: false };
  const model = invoer.model.trim();
  if (!model) return { recorded: false };

  /*
   * Waar de melding op slaat.
   *
   * "Deze taal kunnen wij niet" met een lege taal leverde een MODELBREDE
   * blokkade op — een veel zwaardere uitspraak dan iemand deed. Dat gebeurt bij
   * een regel waarvan de app de landcode niet kent; die code staat er wel, hij
   * is alleen niet naar een layout te vertalen. Dan is de ruwe code het bereik.
   */
  const bereik = scopeForReason(invoer.reason, invoer.layout);
  if (invoer.reason === "layout_unknown" && bereik === "") {
    return { recorded: false };
  }
  await transaction`
    insert into noviply_unavailable (
      model, model_key, layout, reason, note,
      source_request_id, source_batch_row_id, recorded_by
    )
    values (
      ${model}, ${modelKey(model)}, ${bereik},
      ${invoer.reason}, ${invoer.note},
      ${invoer.sourceRequestId ?? null}, ${invoer.sourceBatchRowId ?? null}, ${invoer.actorId}
    )
    on conflict (model_key, layout) where removed_at is null
    do update set
      reason = excluded.reason,
      note = excluded.note,
      -- De verwijzing naar waar het vandaan kwam alleen aanvullen, nooit wissen:
      -- anders raakt een tweede melding het spoor naar de eerste kwijt.
      source_request_id = coalesce(excluded.source_request_id, noviply_unavailable.source_request_id),
      source_batch_row_id = coalesce(excluded.source_batch_row_id, noviply_unavailable.source_batch_row_id),
      recorded_at = now(),
      recorded_by = excluded.recorded_by
  `;
  return { recorded: true };
}

/**
 * De blokkade weghalen die bij deze rondesregel hoort.
 *
 * Hoort bij de Undo-knop: wie zich verklikt heeft, verwacht dat álles
 * terugdraait. Alleen de regel die deze klik zelf heeft aangemaakt — een
 * blokkade die al lag, of die van iemand anders, blijft staan.
 */
export async function withdrawBlockFromBatchRow(
  transaction: TransactionSql<Record<string, unknown>>,
  rowId: string,
  actorId: string,
) {
  const rows = await transaction<{ id: string }[]>`
    update noviply_unavailable
    set removed_at = now(), removed_by = ${actorId}
    where source_batch_row_id = ${rowId} and removed_at is null
    returning id
  `;
  return { withdrawn: rows.length };
}
