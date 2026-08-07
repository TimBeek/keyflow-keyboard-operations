/**
 * Noviply werkt in hun eigen systeem, niet in ReKey. Overtypen is werk dat
 * fouten maakt, dus mogen beide lijsten er als bestand uit. Engelstalig, net
 * als hun schermen.
 */

import { toCsv, type CsvValue } from "./csv";
import { printRequestStatusLabel, type PrintRequestRecord } from "./print-requests";
import { displayStickerSku } from "./sticker-sku";
import { unavailableReasonEnglish } from "./noviply-availability";
import type { PrintVerdict } from "./print-verdict";
import { signalLabel, type NoviplyStockRow } from "./noviply-stock";

/** Wat Noviply in het bestand leest; hun kant is Engelstalig. */
export function trackpointLabel(answer: PrintRequestRecord["trackpoint"]) {
  if (answer === "yes") return "Yes";
  if (answer === "no") return "No";
  return "Not stated";
}


const orderHeaders = [
  "Folder", "Part number", "Model", "Layout", "Per week", "In stock",
  "Minimum", "Cover (weeks)", "Order", "Status",
] as const;

/**
 * De bestellijst mee naar Excel.
 *
 * De kolommen zeggen wat er moet gebeuren en waarom: hoe hard het loopt, wat
 * er nog ligt, hoe lang dat nog meegaat en hoeveel erbij moet. Een leeg vak
 * betekent "niet te zeggen" — een nul zou zeggen "niets nodig", en daar wordt
 * op besteld.
 */
export function createNoviplyStockCsv(rows: NoviplyStockRow[]) {
  return toCsv(orderHeaders, rows.map((row): CsvValue[] => [
    row.storageNumber,
    displayStickerSku(row.sku),
    row.model,
    row.layout,
    row.weeklyDemand === null ? "" : Math.round(row.weeklyDemand * 10) / 10,
    row.stock,
    row.minimum ?? "",
    row.coverWeeks === null ? "" : Math.round(row.coverWeeks * 10) / 10,
    // Leeg als er niets te zeggen valt; een nul leest in Excel als "niets
    // nodig", en daar wordt op besteld. Dat is precies waarom de oude export
    // de bijbestelkolommen wegliet zolang er geen minimum was.
    row.weeklyDemand === null ? "" : row.orderQuantity,
    signalLabel(row.signal),
  ]));
}

const partNumberHeaders = [
  "Folder", "Part number", "Own number", "Shared", "Model", "Fits models",
  "Layout", "Enter", "Used (30 d)", "Per week", "In stock", "Cover (weeks)", "Note",
] as const;

/**
 * Alle artikelnummers, met alles wat wij erover weten.
 *
 * Noviply houdt hier hun eigen voorraad op bij; dan moet er niets ontbreken —
 * ook niet de vellen die stilstaan, en ook niet dat een nummer van onszelf is
 * of in twee hangmappen ligt.
 */
export function createPartNumberCsv(rows: NoviplyStockRow[]) {
  return toCsv(partNumberHeaders, rows.map((row): CsvValue[] => [
    row.storageNumber,
    displayStickerSku(row.sku),
    row.ownNumber ? "yes" : "",
    row.sharedNumber ? "yes" : "",
    row.model,
    row.compatibleModels,
    row.layout,
    row.variant,
    row.used,
    row.weeklyDemand === null ? "" : Math.round(row.weeklyDemand * 10) / 10,
    row.stock,
    row.coverWeeks === null ? "" : Math.round(row.coverWeeks * 10) / 10,
    row.note,
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
export function noviplyExportFilename(
  kind: "stock" | "print-requests" | "run" | "part-numbers" | "cannot-print",
  isoMoment: string,
) {
  return `noviply-${kind}-${isoMoment.slice(0, 10)}.csv`;
}


const verdictHeaders = [
  "Model", "Language", "Status", "Reason", "Note", "Since", "Source", "Orders",
] as const;

/**
 * De lijst "what we cannot print" mee naar Excel.
 *
 * Eén regel per model en taal, met alle ordernummers achter elkaar in de
 * laatste kolom — zo blijft het aantal regels gelijk aan wat er op het scherm
 * staat, terwijl er geen order verdwijnt.
 */
export function createVerdictCsv(verdicts: PrintVerdict[]) {
  return toCsv(verdictHeaders, verdicts.map((verdict): CsvValue[] => [
    verdict.model,
    verdict.layout || "All languages",
    verdict.blockId ? "Blocked" : "Still offered",
    verdict.reason ? unavailableReasonEnglish(verdict.reason) : "",
    verdict.note,
    verdict.when ? verdict.when.slice(0, 10) : "",
    verdict.sourceLabel,
    verdict.orders.join(" "),
  ]));
}
