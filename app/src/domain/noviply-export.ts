/**
 * Noviply werkt in hun eigen systeem, niet in KeyFlow. Overtypen is werk dat
 * fouten maakt, dus mogen beide lijsten er als bestand uit. Engelstalig, net
 * als hun schermen.
 */

import { toCsv, type CsvValue } from "./csv";
import { printRequestStatusLabel, type PrintRequestRecord } from "./print-requests";
import { displayStickerSku } from "./sticker-sku";

/** Wat Noviply in het bestand leest; hun kant is Engelstalig. */
export function trackpointLabel(answer: PrintRequestRecord["trackpoint"]) {
  if (answer === "yes") return "Yes";
  if (answer === "no") return "No";
  return "Not stated";
}

export type NoviplyStockRow = {
  storageNumber: number;
  model: string;
  sku: string;
  layout: string;
  stock: number;
  threshold: number | null;
  shortfall: number;
};

const plainStockHeaders = ["Folder", "Part number", "Model", "Layout", "Stock"] as const;
const stockHeaders = [...plainStockHeaders, "Minimum", "Resupply", "Status"] as const;

/**
 * Zolang er te weinig gemeten is voor een minimum blijven die drie kolommen
 * weg. Een kolom "Resupply" die overal nul is, leest in Excel als "niets nodig"
 * terwijl het "nog niet te zeggen" betekent — en daar wordt op besteld.
 */
export function createNoviplyStockCsv(rows: NoviplyStockRow[], withResupply = true) {
  if (!withResupply) {
    return toCsv(plainStockHeaders, rows.map((row): CsvValue[] => [
      row.storageNumber,
      displayStickerSku(row.sku),
      row.model,
      row.layout,
      row.stock,
    ]));
  }
  return toCsv(stockHeaders, rows.map((row): CsvValue[] => [
    row.storageNumber,
    displayStickerSku(row.sku),
    row.model,
    row.layout,
    row.stock,
    // Een leeg vak zegt "niet bekend"; een nul zou zeggen "nul nodig".
    row.threshold ?? "",
    // Wie de kolom optelt wil het aantal, niet een streepje.
    row.shortfall > 0 ? row.shortfall : 0,
    row.threshold === null
      ? (row.stock === 0 ? "Empty" : "No minimum yet")
      : row.shortfall > 0 ? "Below minimum" : "OK",
  ]));
}

const printRequestHeaders = [
  "Requested",
  "Brand",
  "Model",
  "Language",
  "Enter",
  "Trackpoint",
  "Sheets",
  "Order number",
  "Reason",
  "Status",
  "Handled",
  "Handled by",
  "Note",
] as const;

export function createNoviplyPrintRequestCsv(records: PrintRequestRecord[]) {
  return toCsv(printRequestHeaders, records.map((record): CsvValue[] => [
    record.requestedAt,
    record.brand,
    record.model,
    record.layout,
    record.variant,
    // Met of zonder trackpoint is een ander toetsenbord. Zij zien de laptop
    // niet, dus zonder deze kolom maken ze mogelijk het verkeerde vel.
    trackpointLabel(record.trackpoint),
    // Eén order kan meerdere laptops zijn; zonder dit getal print Noviply er één.
    record.quantity,
    record.orderReference,
    record.reason,
    printRequestStatusLabel(record.status),
    record.handledAt ?? "",
    record.handledBy ?? "",
    record.note,
  ]));
}

const batchHeaders = [
  "Line",
  "Model",
  "Language",
  "Enter",
  "Sheets",
  "Order number",
  "Status",
  "Note",
] as const;

/**
 * Dezelfde ronde terug als bestand, met wat er inmiddels van is afgevinkt. Hun
 * eigen administratie wil de stand, niet alleen de opdracht.
 */
export function createPrintBatchCsv(rows: {
  lineNumber: number;
  model: string;
  languageCode: string;
  layout: string;
  variant: string;
  quantity: number;
  orderReference: string;
  status: "open" | "printed" | "not_printable";
  note: string;
}[]) {
  return toCsv(batchHeaders, rows.map((row): CsvValue[] => [
    row.lineNumber,
    row.model,
    row.layout || row.languageCode,
    row.variant,
    row.quantity,
    row.orderReference,
    row.status === "printed" ? "Printed" : row.status === "not_printable" ? "Cannot print" : "Open",
    row.note,
  ]));
}

/** Een bestandsnaam waarin de datum voorop staat, zodat sorteren op naam werkt. */
export function noviplyExportFilename(kind: "stock" | "print-requests" | "run", isoMoment: string) {
  return `noviply-${kind}-${isoMoment.slice(0, 10)}.csv`;
}
