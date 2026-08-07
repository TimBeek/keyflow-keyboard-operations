import { normalizeLayoutName } from "./keyboard-layouts";

/**
 * De lijst die twee keer per dag naar Noviply gaat.
 *
 * Die lijst komt uit het ordersysteem en werd gemaild. ReKey kent de orders
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

/**
 * Hoe een ronde heet.
 *
 * "Batch 2" is een nummer waar je bij moet nadenken. Er komen er twee per dag —
 * 's ochtends en rond half één — dus zeg dat gewoon: dan weet je meteen welke
 * lijst voor je ligt zonder eerst de tijdstempel te zoeken. Komt er een keer een
 * derde, dan is dat een extra ronde en heet hij ook zo.
 */
export function batchRunName(batchNumber: number, taal: Taal = "nl") {
  if (batchNumber === 1) return taal === "en" ? "Morning run" : "Ochtendronde";
  if (batchNumber === 2) return taal === "en" ? "Afternoon run" : "Middagronde";
  return taal === "en" ? `Extra run ${batchNumber}` : `Extra ronde ${batchNumber}`;
}

export type Taal = "nl" | "en";

const maandenKort: Record<Taal, string[]> = {
  nl: ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

/**
 * De datum als "1 aug" in plaats van "01-08". Twee getallen met een streepje
 * ertussen leest iedereen anders — 01-08 is hier 1 augustus en elders 8 januari
 * — en Noviply zit in een ander land. Een maandnaam kan maar één ding
 * betekenen.
 */
export function batchDateLabel(runDate: string, taal: Taal = "nl") {
  // Zonder jaartal. Een ronde is een dagelijkse werklijst — je kijkt naar
  // vandaag of hooguit een paar dagen terug — en in de geschiedenis staat bij
  // elke regel al een volledige datum en tijd. Een jaartal in het tabblad is
  // dan alleen maar langer.
  const [, maand, dag] = runDate.split("-");
  const naam = maandenKort[taal][Number(maand) - 1];
  if (!naam) return runDate;
  return `${Number(dag)} ${naam}`;
}

/**
 * Welk rondenummer hoort bij dit tijdstip?
 *
 * Doortellen op wat er die dag al staat leek logisch, maar dan bepaalt de
 * volgorde van binnenkomst de naam: één proeflevering 's ochtends en de echte
 * ochtendronde erna heet "middagronde". Het uur van de dag weet het beter. Voor
 * half één is het de ochtendronde, daarna de middagronde — precies de twee
 * momenten waarop het ordersysteem zijn lijst maakt.
 *
 * Is dat nummer al bezet, dan pakt de aanroeper het eerstvolgende vrije; dan is
 * het een extra ronde en heet hij ook zo.
 */
export const middagVanafUur = 12;
export const middagVanafMinuut = 30;

export function batchNumberForTime(uur: number, minuut: number) {
  const naMiddag = uur > middagVanafUur
    || (uur === middagVanafUur && minuut >= middagVanafMinuut);
  return naMiddag ? 2 : 1;
}

export function batchLabel(
  batch: Pick<PrintBatch, "runDate" | "batchNumber">,
  taal: Taal = "nl",
) {
  return `${batchRunName(batch.batchNumber, taal)} · ${batchDateLabel(batch.runDate, taal)}`;
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

/**
 * Rondesregels die Noviply niet kon printen.
 *
 * De werkvloer had hier geen zicht op. Een afgekeurde lósse aanvraag stond wel
 * op hun scherm, maar een afgekeurde regel uit een ronde niet — die zit in een
 * andere tabel en werd alleen op het beheerscherm getoond. Sinds het
 * ordersysteem de rondes aanlevert is dat het merendeel van het werk, en dan is
 * dat een gat: de werkvloer legt een laptop opzij tot het vel er is, Noviply
 * meldt dat het niet gaat, en op de werkbank blijft het stil.
 *
 * Nieuwste eerst, want dat is wat er nu op tafel ligt. Verwijderde rondes tellen
 * niet mee: die zijn met opzet uit de lijst gehaald.
 */
export function blockedBatchRows(batches: PrintBatch[]) {
  return listedBatches(batches)
    .flatMap((batch) => batch.rows
      .filter((row) => row.status === "not_printable")
      .map((row) => ({ batch, row })))
    .sort((links, rechts) =>
      (rechts.row.handledAt ?? "").localeCompare(links.row.handledAt ?? ""));
}

export type EerdereAfkeuring = {
  /** Wat Noviply toen opgaf. */
  reden: string;
  /** Wanneer, als ISO-tijd; leeg als dat niet bekend is. */
  wanneer: string;
  /** Uit welke ronde het kwam, om het terug te kunnen zoeken. */
  ronde: string;
};

/**
 * Heeft Noviply dit model in deze taal eerder al niet kunnen printen?
 *
 * Michael werkt een lijst van boven naar beneden af en komt dan halverwege een
 * model tegen waar hij vorige week ook al op vastliep. Dat hoort hij te zien
 * voordat hij eraan begint, niet erna.
 *
 * Alleen als de láátste uitkomst een afkeuring was. Is hetzelfde model daarna
 * wél geprint — nieuwe folie, ander vel, wat dan ook — dan is die oude melding
 * geen waarschuwing meer maar ruis, en ruis leest niemand.
 *
 * De regel zelf telt niet mee: die gaat over nu.
 */
export function eerderAfgekeurd(
  batches: PrintBatch[],
  model: string,
  languageCode: string,
  negeerRowId = "",
): EerdereAfkeuring | null {
  const gezocht = sleutel(model, languageCode);
  if (!gezocht) return null;

  const eerder = listedBatches(batches)
    .flatMap((batch) => batch.rows.map((row) => ({ batch, row })))
    .filter(({ row }) => row.id !== negeerRowId
      && row.status !== "open"
      && sleutel(row.model, row.languageCode) === gezocht)
    .sort((links, rechts) =>
      (rechts.row.handledAt ?? "").localeCompare(links.row.handledAt ?? ""));

  const laatste = eerder[0];
  if (!laatste || laatste.row.status !== "not_printable") return null;
  return {
    reden: laatste.row.note,
    wanneer: laatste.row.handledAt ?? "",
    ronde: batchLabel(laatste.batch, "en"),
  };
}

function sleutel(model: string, languageCode: string) {
  const m = model.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!m) return "";
  return `${m}|${languageCode.trim().toUpperCase()}`;
}

/** Regels waar de app geen bekende taal bij kon vinden; even naar kijken. */
export function unknownLanguageRows(batch: PrintBatch) {
  return batch.rows.filter((row) => row.layout === "");
}

/** Of de taal op de regel overeenkomt met wat de app eronder verstaat. */
export function batchRowMatchesLayout(row: PrintBatchRow, layout: string) {
  return row.layout !== "" && normalizeLayoutName(row.layout) === normalizeLayoutName(layout);
}
