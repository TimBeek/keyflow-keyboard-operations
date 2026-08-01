import { batchLabel, type PrintBatch } from "./print-batch";
import { brandFromModel, type PrintRequestRecord } from "./print-requests";

/**
 * Alles wat Noviply heeft afgehandeld, uit één lijst.
 *
 * De geschiedenis toonde alleen de losse aanvragen. Sinds de dagelijkse rondes
 * hier worden ingelezen is dat het kleinste deel van hun werk: de vellen uit de
 * ronde stonden nergens terug te vinden. Nu komen beide bronnen in dezelfde
 * lijst, met erbij waar een regel vandaan kwam.
 *
 * En doorzoekbaar, want een lijst waarin je moet scrollen om één ordernummer
 * terug te vinden is geen administratie.
 */

export type HistoryOutcome = "printed" | "not_printable";

export type NoviplyHistoryEntry = {
  id: string;
  /** Een losse aanvraag van de werkvloer, of een regel uit een printronde. */
  source: "request" | "run";
  /** Bij een ronde: "Batch 2 · 30-07". Bij een aanvraag leeg. */
  sourceLabel: string;
  brand: string;
  model: string;
  layout: string;
  variant: string;
  quantity: number;
  orderReference: string;
  outcome: HistoryOutcome;
  note: string;
  handledAt: string;
  handledBy: string;
};

export function noviplyHistory(
  printRequests: PrintRequestRecord[],
  printBatches: PrintBatch[],
): NoviplyHistoryEntry[] {
  const uitAanvragen = printRequests
    .filter((request) => request.status !== "requested")
    .map((request): NoviplyHistoryEntry => ({
      id: `request-${request.id}`,
      source: "request",
      sourceLabel: "",
      brand: request.brand,
      model: request.model,
      layout: request.layout,
      variant: request.variant,
      quantity: request.quantity,
      orderReference: request.orderReference,
      outcome: request.status === "printed" ? "printed" : "not_printable",
      note: request.note,
      handledAt: request.handledAt ?? "",
      handledBy: request.handledBy ?? "",
    }));

  const uitRondes = printBatches.flatMap((batch) => batch.rows
    .filter((row) => row.status !== "open")
    .map((row): NoviplyHistoryEntry => ({
      id: `run-${row.id}`,
      source: "run",
      sourceLabel: batchLabel(batch, "en"),
      brand: brandFromModel(row.model),
      model: row.model,
      layout: row.layout || row.languageCode,
      variant: row.variant,
      quantity: row.quantity,
      orderReference: row.orderReference,
      outcome: row.status === "printed" ? "printed" : "not_printable",
      note: row.note,
      handledAt: row.handledAt ?? "",
      handledBy: row.handledBy ?? "",
    })));

  // Het laatst afgehandelde bovenaan; dat is waar iemand naar zoekt.
  return [...uitAanvragen, ...uitRondes]
    .sort((left, right) => right.handledAt.localeCompare(left.handledAt));
}

/**
 * Zoeken op ordernummer, model, taal of ronde. Meerdere woorden moeten allemaal
 * ergens voorkomen: "5420 printed" vindt de geprinte Latitudes en niet alles
 * met een van beide.
 */
export function searchNoviplyHistory(entries: NoviplyHistoryEntry[], query: string) {
  const woorden = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (woorden.length === 0) return entries;

  return entries.filter((entry) => {
    const hooi = [
      entry.orderReference,
      entry.brand,
      entry.model,
      entry.layout,
      entry.variant,
      entry.sourceLabel,
      entry.note,
      entry.handledBy,
      entry.outcome === "printed" ? "printed geprint" : "not printable kan niet",
      entry.source === "run" ? "run ronde batch" : "request aanvraag",
    ].join(" ").toLowerCase();
    return woorden.every((woord) => hooi.includes(woord));
  });
}

export function historyTotals(entries: NoviplyHistoryEntry[]) {
  return {
    lines: entries.length,
    sheets: entries.reduce((sum, entry) => sum + entry.quantity, 0),
    printed: entries.filter((entry) => entry.outcome === "printed").length,
    blocked: entries.filter((entry) => entry.outcome === "not_printable").length,
  };
}
