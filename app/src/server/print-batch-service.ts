import "server-only";
import { createHash } from "node:crypto";
import readXlsxFile from "read-excel-file/node";
import { z } from "zod";
import {
  PrintBatchError,
  batchNumberFromFileName,
  parsePrintBatch,
  type PrintBatch,
  type PrintBatchRow,
} from "@/domain/print-batch";
import { markConversionsPrinted } from "./conversion-log-service";
import { requirePermission } from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

/**
 * De printrondes van Noviply, ingelezen uit het bestand dat het ordersysteem
 * twee keer per dag maakt.
 *
 * Beiden mogen uploaden — management en Noviply — dus dezelfde ronde landt
 * vroeg of laat twee keer. Dat is geen fout maar hetzelfde: dan wordt de
 * bestaande ronde teruggegeven in plaats van een tweede aangemaakt.
 */

const QUOTE = '"';
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

/** De export gebruikt puntkomma's; komma's en regeleinden kunnen in een cel staan. */
function parseCsv(text: string, separator: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const endRow = () => { row.push(cell); cell = ""; rows.push(row); row = []; };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === QUOTE) {
        if (text[index + 1] === QUOTE) { cell += QUOTE; index += 1; }
        else inQuotes = false;
      } else cell += char;
      continue;
    }
    if (char === QUOTE) { inQuotes = true; continue; }
    if (char === separator) { row.push(cell); cell = ""; continue; }
    if (char === CR) continue;
    if (char === LF) { endRow(); continue; }
    cell += char;
  }
  endRow();
  return rows;
}

/** Welk scheidingsteken de export gebruikte; puntkomma bij ons, komma elders. */
function detectSeparator(text: string) {
  const eersteRegels = text.split(LF).slice(0, 3).join(LF);
  const puntkomma = (eersteRegels.match(/;/g) ?? []).length;
  const komma = (eersteRegels.match(/,/g) ?? []).length;
  return puntkomma >= komma ? ";" : ",";
}

async function sheetFromFile(fileName: string, bytes: Buffer): Promise<unknown[][]> {
  if (/\.(xlsx|xlsm)$/i.test(fileName)) {
    // read-excel-file wil een pad of stream; een buffer gaat via een stream.
    const { Readable } = await import("node:stream");
    const uit = await readXlsxFile(Readable.from(bytes) as never) as unknown;
    // Bij één werkblad komt er soms een omhulsel terug in plaats van de rijen
    // zelf: [{ sheet, data }]. Beide vormen horen hier hetzelfde op te leveren.
    if (Array.isArray(uit) && uit.length > 0 && !Array.isArray(uit[0])) {
      const eerste = uit[0] as { data?: unknown[][] };
      if (Array.isArray(eerste.data)) return eerste.data;
    }
    return uit as unknown[][];
  }
  if (/\.csv$/i.test(fileName)) {
    const text = bytes.toString("utf8").replace(/^﻿/, "");
    return parseCsv(text, detectSeparator(text));
  }
  throw new PrintBatchError("Alleen .xlsx, .xlsm of .csv.");
}

/* ---------- lezen ---------- */

type BatchRow = {
  id: string;
  run_date: Date;
  batch_number: number;
  file_name: string;
  uploaded_at: Date;
  uploaded_by_name: string;
  seen_at: Date | null;
  deleted_at: Date | null;
};

type LineRow = {
  id: string;
  batch_id: string;
  line_number: number;
  model: string;
  language_code: string;
  layout: string;
  variant: string;
  quantity: number;
  order_reference: string;
  status: "open" | "printed" | "not_printable";
  note: string;
  handled_at: Date | null;
  handled_by_name: string | null;
};

function toRow(row: LineRow): PrintBatchRow {
  return {
    id: row.id,
    lineNumber: row.line_number,
    model: row.model,
    languageCode: row.language_code,
    layout: row.layout,
    variant: row.variant,
    quantity: row.quantity,
    orderReference: row.order_reference,
    status: row.status,
    note: row.note,
    handledAt: row.handled_at ? row.handled_at.toISOString() : null,
    handledBy: row.handled_by_name,
  };
}

function dayKey(date: Date) {
  const maand = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dag = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${maand}-${dag}`;
}

/**
 * Ook de verwijderde rondes komen mee: die staan niet meer in de rondelijst,
 * maar hun afgehandelde regels vullen nog wel de geschiedenis. Ruim genoeg om
 * maanden terug te kunnen kijken.
 */
export async function listPrintBatches(limit = 400): Promise<PrintBatch[]> {
  const sql = database();
  const batches = await sql<BatchRow[]>`
    select b.id, b.run_date, b.batch_number, b.file_name, b.uploaded_at, b.seen_at,
           b.deleted_at, u.display_name as uploaded_by_name
    from print_batches b
    join users u on u.id = b.uploaded_by
    order by b.run_date desc, b.batch_number desc
    limit ${limit}
  `;
  if (batches.length === 0) return [];

  const lines = await sql<LineRow[]>`
    select r.id, r.batch_id, r.line_number, r.model, r.language_code, r.layout,
           r.variant, r.quantity, r.order_reference, r.status, r.note, r.handled_at,
           h.display_name as handled_by_name
    from print_batch_rows r
    left join users h on h.id = r.handled_by
    where r.batch_id in ${sql(batches.map((b) => b.id))}
    order by r.line_number
  `;

  return batches.map((batch) => ({
    id: batch.id,
    runDate: dayKey(batch.run_date),
    batchNumber: batch.batch_number,
    fileName: batch.file_name,
    uploadedAt: batch.uploaded_at.toISOString(),
    uploadedBy: batch.uploaded_by_name,
    seenAt: batch.seen_at ? batch.seen_at.toISOString() : null,
    deletedAt: batch.deleted_at ? batch.deleted_at.toISOString() : null,
    rows: lines.filter((line) => line.batch_id === batch.id).map(toRow),
  }));
}

/* ---------- inlezen ---------- */

export async function importPrintBatch(input: {
  fileName: string;
  bytes: Buffer;
  batchNumber?: number;
  actorId: string;
}) {
  await requirePermission(input.actorId, "print.fulfil");
  const sheet = await sheetFromFile(input.fileName, input.bytes);
  const parsed = parsePrintBatch(sheet);
  const number = input.batchNumber ?? batchNumberFromFileName(input.fileName);
  if (!number) {
    throw new PrintBatchError(
      "Het rondenummer staat niet in de bestandsnaam. Noem het bestand batch-1-… of batch-2-…, of geef het nummer op.",
    );
  }
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const sql = database();

  return sql.begin(async (transaction) => {
    // Beiden mogen uploaden, dus twee keer dezelfde ronde is te verwachten.
    await transaction`
      select pg_advisory_xact_lock(hashtextextended(${`batch:${parsed.runDate}:${number}`}, 0))
    `;
    // Een ronde die uit de lijst is gehaald mag opnieuw ingelezen worden;
    // anders kun je een per ongeluk verwijderde ronde nooit terugzetten.
    const [existing] = await transaction<{ id: string; source_sha256: string }[]>`
      select id, source_sha256 from print_batches
      where run_date = ${parsed.runDate} and batch_number = ${number}
        and deleted_at is null
    `;
    if (existing) {
      return {
        batchId: existing.id,
        rows: parsed.rows.length,
        duplicate: true,
        sameFile: existing.source_sha256 === sha256,
      };
    }

    const [batch] = await transaction<{ id: string }[]>`
      insert into print_batches (run_date, batch_number, file_name, source_sha256, uploaded_by)
      values (${parsed.runDate}, ${number}, ${input.fileName}, ${sha256}, ${input.actorId})
      returning id
    `;
    for (const row of parsed.rows) {
      await transaction`
        insert into print_batch_rows (
          batch_id, line_number, model, language_code, layout, variant,
          quantity, order_reference
        )
        values (
          ${batch.id}, ${row.lineNumber}, ${row.model}, ${row.languageCode},
          ${row.layout}, ${row.variant}, ${row.quantity}, ${row.orderReference}
        )
      `;
    }
    return { batchId: batch.id, rows: parsed.rows.length, duplicate: false, sameFile: false };
  });
}

/* ---------- afhandelen ---------- */

const settleSchema = z.object({
  rowId: databaseUuidSchema,
  status: z.enum(["printed", "not_printable"]),
  note: z.string().max(500).default(""),
  actorId: databaseUuidSchema,
});

export async function settleBatchRow(rawInput: z.input<typeof settleSchema>) {
  const input = settleSchema.parse(rawInput);
  await requirePermission(input.actorId, "print.fulfil");
  const note = input.note.trim();
  // Dezelfde regel als in de database, maar met een uitleg die een mens begrijpt.
  if (input.status === "not_printable" && note.length < 3) {
    throw new PrintBatchError("Vermeld waarom deze regel niet geprint kan worden.");
  }
  const sql = database();

  return sql.begin(async (transaction) => {
    const [row] = await transaction<{ id: string; order_reference: string }[]>`
      update print_batch_rows
      set status = ${input.status}, note = ${note},
          handled_at = now(), handled_by = ${input.actorId}
      where id = ${input.rowId} and status = 'open'
      returning id, order_reference
    `;
    if (!row) throw new PrintBatchError("Deze regel is al afgehandeld.");
    // Stond er een laptop op deze order te wachten, dan is die nu af.
    if (input.status === "printed") {
      await markConversionsPrinted(transaction, row.order_reference);
    }
    return { settled: true };
  });
}

/** Alles wat nog openstaat in één keer op geprint; dat is het normale geval. */
export async function settleWholeBatch(batchId: string, actorId: string) {
  await requirePermission(actorId, "print.fulfil");
  const sql = database();

  return sql.begin(async (transaction) => {
    const rows = await transaction<{ id: string; order_reference: string }[]>`
      update print_batch_rows
      set status = 'printed', handled_at = now(), handled_by = ${actorId}
      where batch_id = ${batchId} and status = 'open'
      returning id, order_reference
    `;
    for (const row of rows) {
      await markConversionsPrinted(transaction, row.order_reference);
    }
    return { settled: rows.length };
  });
}

/**
 * Een ronde uit de lijst halen. Geen delete: de regels blijven bestaan en
 * blijven de geschiedenis vullen, want het werk ís gedaan. Wat verdwijnt is
 * alleen de plek in "Print runs".
 */
export async function removePrintBatch(batchId: string, actorId: string) {
  await requirePermission(actorId, "print.fulfil");
  const sql = database();
  const [row] = await sql<{ id: string }[]>`
    update print_batches
    set deleted_at = now(), deleted_by = ${actorId}
    where id = ${batchId} and deleted_at is null
    returning id
  `;
  if (!row) throw new PrintBatchError("Deze ronde staat al niet meer in de lijst.");
  return { removed: true };
}

/** Noviply heeft de ronde geopend; de melding mag weg. */
export async function markBatchSeen(batchId: string, actorId: string) {
  await requirePermission(actorId, "print.fulfil");
  const sql = database();
  await sql`
    update print_batches
    set seen_at = now(), seen_by = ${actorId}
    where id = ${batchId} and seen_at is null
  `;
  return { seen: true };
}
