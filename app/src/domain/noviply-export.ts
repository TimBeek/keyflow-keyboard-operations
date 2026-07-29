/**
 * Noviply werkt in hun eigen systeem, niet in KeyFlow. Overtypen is werk dat
 * fouten maakt, dus mogen beide lijsten er als bestand uit. Engelstalig, net
 * als hun schermen.
 */

import { toCsv, type CsvValue } from "./csv";
import { printRequestStatusLabel, type PrintRequestRecord } from "./print-requests";
import { displayStickerSku } from "./sticker-sku";

export type NoviplyStockRow = {
  storageNumber: number;
  model: string;
  sku: string;
  layout: string;
  stock: number;
  threshold: number;
  shortfall: number;
};

const stockHeaders = [
  "Folder",
  "Part number",
  "Model",
  "Layout",
  "Stock",
  "Minimum",
  "Resupply",
  "Status",
] as const;

export function createNoviplyStockCsv(rows: NoviplyStockRow[]) {
  return toCsv(stockHeaders, rows.map((row): CsvValue[] => [
    row.storageNumber,
    displayStickerSku(row.sku),
    row.model,
    row.layout,
    row.stock,
    row.threshold,
    // Wie de kolom optelt wil het aantal, niet een streepje.
    row.shortfall > 0 ? row.shortfall : 0,
    row.shortfall > 0 ? "Below minimum" : "OK",
  ]));
}

const printRequestHeaders = [
  "Requested",
  "Brand",
  "Model",
  "Language",
  "Enter",
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
    record.orderReference,
    record.reason,
    printRequestStatusLabel(record.status),
    record.handledAt ?? "",
    record.handledBy ?? "",
    record.note,
  ]));
}

/** Een bestandsnaam waarin de datum voorop staat, zodat sorteren op naam werkt. */
export function noviplyExportFilename(kind: "stock" | "print-requests", isoMoment: string) {
  return `noviply-${kind}-${isoMoment.slice(0, 10)}.csv`;
}
