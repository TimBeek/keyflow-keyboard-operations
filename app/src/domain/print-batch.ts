import { normalizeLayoutName } from "./keyboard-layouts";

/**
 * De lijst die twee keer per dag naar Noviply gaat.
 *
 * Die lijst komt uit het ordersysteem en werd gemaild. KeyFlow kent de orders
 * niet, dus zelf genereren zou betekenen dat eerst de hele orderstroom hierheen
 * moet. Importeren is de korte weg naar hetzelfde doel: één plek waar de ronde
 * staat, waar Noviply hem afvinkt, en waar hij naast de losse aanvragen ligt.
 *
 * De vorm is vast: datum in de eerste cel, dan een koprij, dan de regels.
 */

export type BatchRowStatus = "open" | "printed" | "not_printable";

export type PrintBatchRow = {
  id: string;
  lineNumber: number;
  model: string;
  /** De tweeletterige code uit het bestand: NL, BE, ES. */
  languageCode: string;
  /** Diezelfde code als taal die de app kent; leeg als hij onbekend is. */
  layout: string;
  /** E1 of E2 — in het bestand staat die onder de kop "Layout". */
  variant: string;
  quantity: number;
  orderReference: string;
  status: BatchRowStatus;
  note: string;
  handledAt: string | null;
  handledBy: string | null;
};

export type PrintBatch = {
  id: string;
  /** De dag waarop de ronde loopt, als "2026-07-30". */
  runDate: string;
  /** 1 voor de ochtendronde, 2 voor de middagronde. */
  batchNumber: number;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  /** Wanneer Noviply hem heeft geopend; leeg = nog niet gezien. */
  seenAt: string | null;
  /**
   * Uit de rondelijst gehaald. De regels blijven bestaan en blijven de
   * geschiedenis vullen: een ronde mag uit de lijst, niet uit de administratie.
   */
  deletedAt: string | null;
  rows: PrintBatchRow[];
};

export class PrintBatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrintBatchError";
  }
}

/**
 * Het bestand gebruikt landcodes, de app volledige taalnamen. Staat een code
 * hier niet in, dan wordt de regel niet geweigerd: Noviply print hem toch, en
 * hij wordt gemarkeerd zodat iemand ernaar kan kijken.
 */
export const batchLanguageCodes: Record<string, string> = {
  NL: "QWERTY NL",
  BE: "AZERTY BE",
  DE: "QWERTZ DE",
  ES: "QWERTY ES",
  IT: "QWERTY IT",
  FR: "AZERTY FR",
  PT: "QWERTY PT",
  US: "QWERTY US",
  UK: "QWERTY UK",
  SE: "QWERTY SE/FI",
  FI: "QWERTY SE/FI",
  NO: "QWERTY NO",
  DK: "QWERTY DK",
  PL: "QWERTY PL",
};

export function layoutForBatchCode(code: string) {
  return batchLanguageCodes[code.trim().toUpperCase()] ?? "";
}

const expectedHeaders = ["model", "language", "layout", "quantity", "ordernummer"];

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

/** "30-7-2026", "2026-07-30" of een echte datum uit Excel — alles naar één vorm. */
export function batchRunDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const maand = String(value.getMonth() + 1).padStart(2, "0");
    const dag = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${maand}-${dag}`;
  }
  const raw = text(value);
  const dagEerst = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(raw);
  if (dagEerst) {
    return `${dagEerst[3]}-${dagEerst[2].padStart(2, "0")}-${dagEerst[1].padStart(2, "0")}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  throw new PrintBatchError("De datum in de eerste cel is niet te lezen.");
}

/**
 * Het rondenummer staat niet in het bestand maar in de naam:
 * batch-2-30-07-2026. Lukt dat niet, dan moet iemand het zelf zeggen.
 */
export function batchNumberFromFileName(fileName: string): number | null {
  const match = /batch[^0-9]*([0-9]+)/i.exec(fileName);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isInteger(number) && number >= 1 && number <= 9 ? number : null;
}

export type ParsedBatch = {
  runDate: string;
  rows: Omit<PrintBatchRow, "id" | "status" | "note" | "handledAt" | "handledBy">[];
};

export function parsePrintBatch(sheet: unknown[][]): ParsedBatch {
  if (sheet.length < 3) {
    throw new PrintBatchError("Dit bestand heeft geen datum, koprij en regels.");
  }
  const runDate = batchRunDate(sheet[0]?.[0]);

  // De koprij controleren: verandert de export, dan hoort dat hier stuk te
  // lopen en niet stil een lijst met verschoven kolommen op te leveren.
  const headers = (sheet[1] ?? []).map((cell) => text(cell).toLowerCase());
  const missing = expectedHeaders.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new PrintBatchError(
      `De koprij mist ${missing.join(", ")}. Verwacht: ${expectedHeaders.join(", ")}.`,
    );
  }
  const index = Object.fromEntries(expectedHeaders.map((h) => [h, headers.indexOf(h)]));

  const rows: ParsedBatch["rows"] = [];
  for (let offset = 2; offset < sheet.length; offset += 1) {
    const raw = sheet[offset] ?? [];
    const model = text(raw[index.model]);
    // De export laat onderaan lege regels staan; die horen niet in de lijst.
    if (!model) continue;
    const code = text(raw[index.language]).toUpperCase();
    const quantity = Number(text(raw[index.quantity]) || "1");
    rows.push({
      lineNumber: rows.length + 1,
      model,
      languageCode: code,
      layout: layoutForBatchCode(code),
      variant: text(raw[index.layout]).toUpperCase(),
      quantity: Number.isInteger(quantity) && quantity >= 1 && quantity <= 200 ? quantity : 1,
      orderReference: text(raw[index.ordernummer]),
    });
  }

  if (rows.length === 0) {
    throw new PrintBatchError("Er staan geen regels in dit bestand.");
  }
  return { runDate, rows };
}

/* ---------- wat de schermen ervan willen weten ---------- */

export function batchLabel(batch: Pick<PrintBatch, "runDate" | "batchNumber">) {
  const [, maand, dag] = batch.runDate.split("-");
  return `Batch ${batch.batchNumber} · ${dag}-${maand}`;
}

export function openBatchRows(batch: PrintBatch) {
  return batch.rows.filter((row) => row.status === "open").length;
}

export function batchSheetCount(batch: PrintBatch) {
  return batch.rows.reduce((sum, row) => sum + row.quantity, 0);
}

/**
 * Een ronde is voltooid als er niets meer openstaat. Die hoort dan niet meer
 * tussen het werk te staan — maar ook niet weg: de regels zitten in de
 * geschiedenis en de ronde zelf is de herkomst daarvan. Dus opzij, niet weg.
 */
export function batchIsDone(batch: PrintBatch) {
  return batch.rows.length > 0 && batch.rows.every((row) => row.status !== "open");
}

/** Wat er in de rondelijst hoort te staan; verwijderde rondes niet. */
export function listedBatches(batches: PrintBatch[]) {
  return batches.filter((batch) => batch.deletedAt === null);
}

export function activeBatches(batches: PrintBatch[]) {
  return listedBatches(batches).filter((batch) => !batchIsDone(batch));
}

export function completedBatches(batches: PrintBatch[]) {
  return listedBatches(batches).filter(batchIsDone);
}

/** Rondes die Noviply nog niet heeft geopend; daar hoort een melding bij. */
export function unseenBatches(batches: PrintBatch[]) {
  return listedBatches(batches).filter((batch) => batch.seenAt === null);
}

/**
 * Staat een laptop die apart is gelegd in een ronde die inmiddels is
 * ingelezen? Dan is bevestigd dat het vel eraan komt. Bewust niet automatisch
 * afvinken: het vel moet nog steeds fysiek arriveren.
 */
export function batchRowForOrder(batches: PrintBatch[], orderReference: string) {
  const key = orderReference.trim();
  if (!key) return null;
  for (const batch of batches) {
    const row = batch.rows.find((entry) => entry.orderReference.trim() === key);
    if (row) return { batch, row };
  }
  return null;
}

/** Regels waar de app geen bekende taal bij kon vinden; even naar kijken. */
export function unknownLanguageRows(batch: PrintBatch) {
  return batch.rows.filter((row) => row.layout === "");
}

/** Of de taal op de regel overeenkomt met wat de app eronder verstaat. */
export function batchRowMatchesLayout(row: PrintBatchRow, layout: string) {
  return row.layout !== "" && normalizeLayoutName(row.layout) === normalizeLayoutName(layout);
}
