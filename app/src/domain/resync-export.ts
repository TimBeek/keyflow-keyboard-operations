import { createHash } from "node:crypto";
import { z } from "zod";
import { layoutForBatchCode, type ParsedBatch } from "./print-batch";

/**
 * De printronde zoals het ordersysteem hem aanlevert.
 *
 * Tot nu toe kwam die lijst als bestand binnen: iemand exporteerde hem en
 * uploadde hem hier. Dat werkt, maar er zit een mens tussen die het kan
 * vergeten, en tussen 12:30 en het moment dat iemand eraan denkt staat de
 * werkvloer stil. Het ordersysteem kan hem net zo goed rechtstreeks posten.
 *
 * De veldnamen zijn precies de kolomkoppen uit het exportbestand — model,
 * language, layout, quantity, ordernummer. Dat is geen toeval en moet zo
 * blijven: wie de export al kan maken, hoeft niets te hernoemen om hem te
 * kunnen sturen, en beide wegen leveren daardoor gegarandeerd hetzelfde op.
 */
export const resyncRowSchema = z.object({
  /** "HP ProBook 430 G7" — zoals het ordersysteem het model schrijft. */
  model: z.string().trim().min(1).max(120),
  /** De tweeletterige landcode: NL, BE, ES, FR. */
  language: z.string().trim().min(1).max(8),
  /** E1 of E2, de vorm van de Enter-toets. */
  layout: z.string().trim().max(8).default(""),
  /**
   * Ontbreekt of onleesbaar wordt 1. Een ronde tegenhouden omdat er in één
   * regel geen aantal staat helpt niemand: Noviply print dan één vel en de
   * rest van de lijst kan gewoon door.
   */
  quantity: z.coerce.number().int().min(1).max(200).catch(1).default(1),
  /** Het ordernummer, als tekst — er zitten voorloopnullen in. */
  ordernummer: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
});

export type ResyncRow = z.infer<typeof resyncRowSchema>;

/**
 * Twee vormen worden geaccepteerd: een kale lijst regels, of diezelfde lijst
 * met een datum en rondenummer eromheen. Kaal is wat het voorbeeld laat zien en
 * het meest waarschijnlijke; de omhulde vorm is er voor als het ordersysteem
 * een ronde van gisteren nastuurt of expliciet wil zeggen dat dit ronde 2 is.
 */
export const resyncPayloadSchema = z.union([
  z.array(resyncRowSchema).min(1).max(2000),
  z.object({
    runDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    batchNumber: z.number().int().min(1).max(9).optional(),
    /** Waar de lijst vandaan komt; komt terug in de rondelijst. */
    source: z.string().trim().max(120).optional(),
    rows: z.array(resyncRowSchema).min(1).max(2000),
  }),
]);

export type ResyncPayload = z.infer<typeof resyncPayloadSchema>;

export type ResyncRequest = {
  runDate?: string;
  batchNumber?: number;
  source?: string;
  rows: ResyncRow[];
};

/** Allebei de vormen naar één vorm, zodat de rest maar één geval kent. */
export function normalizeResyncPayload(payload: ResyncPayload): ResyncRequest {
  return Array.isArray(payload) ? { rows: payload } : payload;
}

/**
 * De aangeleverde regels naar de vorm die een printronde gebruikt.
 *
 * Een onbekende landcode wordt niet geweigerd. Dat is dezelfde keuze als bij
 * het bestand: de regel blijft staan met een lege layout, zodat hij zichtbaar
 * is en iemand ernaar kan kijken, in plaats van dat de hele ronde afketst op
 * één code die nog niet in de lijst stond.
 */
export function rowsForBatch(rows: ResyncRow[]): ParsedBatch["rows"] {
  return rows.map((row, index) => {
    const code = row.language.toUpperCase();
    return {
      lineNumber: index + 1,
      model: row.model,
      languageCode: code,
      layout: layoutForBatchCode(code),
      variant: row.layout.toUpperCase(),
      quantity: row.quantity,
      orderReference: row.ordernummer,
    };
  });
}

/** De codes die we niet konden vertalen, om terug te melden aan de aanroeper. */
export function unknownLanguageCodes(rows: ResyncRow[]) {
  const onbekend = new Set<string>();
  for (const row of rows) {
    const code = row.language.toUpperCase();
    if (!layoutForBatchCode(code)) onbekend.add(code);
  }
  return [...onbekend].sort();
}

/**
 * Een vingerafdruk van de inhoud.
 *
 * Een koppeling die geen antwoord terugkrijgt — verbinding weg, time-out —
 * probeert het opnieuw. Zonder herkenning zou de ronde er dan twee keer staan
 * en zou Noviply alles dubbel printen. De vingerafdruk gaat alleen over de
 * regels zelf, in de volgorde waarin ze staan, zodat dezelfde lijst altijd
 * hetzelfde getal geeft en één gewijzigde regel een ander.
 */
export function resyncFingerprint(rows: ResyncRow[]) {
  const canoniek = rows
    .map((row) => [
      row.model.toLowerCase(),
      row.language.toUpperCase(),
      row.layout.toUpperCase(),
      String(row.quantity),
      row.ordernummer,
    ].join(""))
    .join("");
  return createHash("sha256").update(canoniek, "utf8").digest("hex");
}

/** Een printronde terug naar de vorm waarin hij is aangeleverd. */
export function rowsToResync(rows: {
  model: string;
  languageCode: string;
  variant: string;
  quantity: number;
  orderReference: string;
}[]): ResyncRow[] {
  return rows.map((row) => ({
    model: row.model,
    language: row.languageCode,
    layout: row.variant,
    quantity: row.quantity,
    ordernummer: row.orderReference,
  }));
}
