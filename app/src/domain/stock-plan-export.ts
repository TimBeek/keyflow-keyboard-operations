import { toCsv, type CsvValue } from "./csv";
import { displayStickerSku } from "./sticker-sku";
import { statusLabel, type Taal } from "./stock-plan-labels";
import type { StockPlanRow } from "./stock-plan";

/**
 * De lijsten mee naar Excel.
 *
 * Noviply werkt in zijn eigen systeem, niet in ReKey; overtypen is werk dat
 * fouten maakt. De bestellijst is bewust kort en heeft de kolommen die een
 * orderregel nodig heeft — hangmapnummer erbij, want drie artikelnummers liggen
 * in twee verschillende mappen en zonder dat nummer weet Noviply niet welke.
 */

const orderKoppen: Record<Taal, readonly string[]> = {
  en: [
    "Folder", "Part number", "Model", "Layout", "Enter", "In stock",
    "Per week (low)", "Per week", "Per week (high)", "Order at", "Top up to",
    "Send", "Working days left", "Order within (working days)", "Status", "Note",
  ],
  nl: [
    "Hangmap", "Artikelnummer", "Model", "Layout", "Enter", "Voorraad",
    "Per week (laag)", "Per week", "Per week (hoog)", "Bestelpunt", "Aanvullen tot",
    "Bestellen", "Werkdagen over", "Uiterlijk over (werkdagen)", "Stand", "Opmerking",
  ],
};

function rijNaarCel(rij: StockPlanRow, taal: Taal): CsvValue[] {
  return [
    rij.storageNumber,
    displayStickerSku(rij.sku),
    rij.model,
    rij.layout,
    rij.variant,
    rij.stock,
    // Een leeg vak betekent "niet te zeggen"; een nul zou "niets nodig" zeggen,
    // en daar wordt op besteld.
    rij.perWeekLow === null ? "" : Math.round(rij.perWeekLow),
    rij.perWeek === null ? "" : Math.round(rij.perWeek),
    rij.perWeekHigh === null ? "" : Math.round(rij.perWeekHigh),
    rij.reorderPoint ?? "",
    rij.orderUpTo ?? "",
    rij.suggested > 0 ? rij.suggested : "",
    rij.workingDaysLeft ?? "",
    rij.orderWithinDays ?? "",
    statusLabel[taal][rij.status],
    rij.note,
  ];
}

export function createOrderCsv(rows: StockPlanRow[], taal: Taal) {
  return toCsv(orderKoppen[taal], rows.map((rij) => rijNaarCel(rij, taal)));
}

const lijstKoppen: Record<Taal, readonly string[]> = {
  en: [
    "Folder", "Part number", "Own number", "Shared", "Model", "Fits models",
    "Layout", "Enter", "In stock", "Used in window", "Per week", "Per week (low)",
    "Per week (high)", "Working days left", "Status", "Note",
  ],
  nl: [
    "Hangmap", "Artikelnummer", "Eigen nummer", "Gedeeld", "Model", "Past op",
    "Layout", "Enter", "Voorraad", "Gebruikt in venster", "Per week", "Per week (laag)",
    "Per week (hoog)", "Werkdagen over", "Stand", "Opmerking",
  ],
};

/** Alles wat wij van een vel weten; hier houdt Noviply zijn eigen voorraad op bij. */
export function createSheetListCsv(rows: StockPlanRow[], taal: Taal) {
  const ja = taal === "en" ? "yes" : "ja";
  return toCsv(lijstKoppen[taal], rows.map((rij): CsvValue[] => [
    rij.storageNumber,
    displayStickerSku(rij.sku),
    rij.ownNumber ? ja : "",
    rij.sharedNumber ? ja : "",
    rij.model,
    rij.compatibleModels,
    rij.layout,
    rij.variant,
    rij.stock,
    rij.used,
    rij.perWeek === null ? "" : Math.round(rij.perWeek),
    rij.perWeekLow === null ? "" : Math.round(rij.perWeekLow),
    rij.perWeekHigh === null ? "" : Math.round(rij.perWeekHigh),
    rij.workingDaysLeft ?? "",
    statusLabel[taal][rij.status],
    rij.note,
  ]));
}
