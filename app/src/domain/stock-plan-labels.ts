import type { DemandConfidence, StockStatus } from "./stock-plan";

/**
 * De woorden bij de cijfers, in twee talen.
 *
 * Noviply leest Engels, management Nederlands, en beide kijken naar precies
 * dezelfde berekening. Door alleen de labels te splitsen kunnen de schermen
 * niet uit elkaar gaan lopen — dat gebeurde eerder wel, toen er twee panelen
 * naast elkaar stonden die dezelfde vraag verschillend beantwoordden.
 */

export type Taal = "nl" | "en";

export const statusLabel: Record<Taal, Record<StockStatus, string>> = {
  en: {
    out: "Empty",
    critical: "Critical",
    order: "Order now",
    watch: "Running low",
    ok: "Fine",
    idle: "Not moving",
  },
  nl: {
    out: "Leeg",
    critical: "Kritiek",
    order: "Nu bestellen",
    watch: "Loopt terug",
    ok: "In orde",
    idle: "Staat stil",
  },
};

/** Eén zin die zegt waarom deze regel er staat. */
export const statusUitleg: Record<Taal, Record<StockStatus, string>> = {
  en: {
    out: "Nothing left in the folder.",
    critical: "Runs out before a sheet ordered today can arrive.",
    order: "Below the reorder point — order this week.",
    watch: "Still above the reorder point, but not for long.",
    ok: "Enough for now.",
    idle: "Stock, but nothing used in the measured period.",
  },
  nl: {
    out: "Niets meer in de hangmap.",
    critical: "Raakt leeg voordat een vel dat je vandaag bestelt binnen is.",
    order: "Onder het bestelpunt — deze week bestellen.",
    watch: "Nog boven het bestelpunt, maar niet lang meer.",
    ok: "Voorlopig genoeg.",
    idle: "Er ligt voorraad, maar er is niets gebruikt in de meetperiode.",
  },
};

/**
 * Hoe hard het cijfer is.
 *
 * Naar het aantal geziene vellen, niet naar het aantal dagen. Van twee vellen
 * valt geen tempo af te leiden, hoe lang je ook meet.
 */
export const confidenceLabel: Record<Taal, Record<DemandConfidence, string>> = {
  en: {
    measured: "Measured",
    estimate: "Estimate",
    rough: "Rough estimate",
    none: "Too few to plan on",
  },
  nl: {
    measured: "Gemeten",
    estimate: "Schatting",
    rough: "Ruwe schatting",
    none: "Te weinig om op te plannen",
  },
};

/** De woordenlijst; beide talen hebben dezelfde sleutels. */
export type Woorden = {
  orderNow: string; fastMovers: string; slow: string; all: string;
  folder: string; partNumber: string; model: string; layout: string;
  enter: string; fits: string; inStock: string; perWeek: string; used: string;
  reorderAt: string; orderUpTo: string; send: string; daysLeft: string;
  orderBy: string; status: string; share: string; running: string;
  klasse: string; note: string; lastUsed: string; download: string;
  search: string; ownNumber: string; shared: string; overdue: string;
  workingDays: string; today: string; nothing: string; noMatch: string;
  sheets: string; lines: string;
};

export const woorden: Record<Taal, Woorden> = {
  en: {
    orderNow: "Order now",
    fastMovers: "Fast movers",
    slow: "Not moving",
    all: "All sheets",
    folder: "Folder",
    partNumber: "Part number",
    model: "Model",
    layout: "Layout",
    enter: "Enter",
    fits: "Fits",
    inStock: "In stock",
    perWeek: "Per week",
    used: "Used",
    reorderAt: "Order at",
    orderUpTo: "Top up to",
    send: "Send",
    daysLeft: "Days left",
    orderBy: "Order by",
    status: "Status",
    share: "Share",
    running: "Cumulative",
    klasse: "Class",
    note: "Note",
    lastUsed: "Last used",
    download: "Download for Excel",
    search: "Part number, model or folder…",
    ownNumber: "our own number — not from Noviply",
    shared: "same number in another folder",
    overdue: "overdue",
    workingDays: "working days",
    today: "today",
    nothing: "Nothing to order. Every folder is above its reorder point.",
    noMatch: "Nothing matches",
    sheets: "sheets",
    lines: "lines",
  },
  nl: {
    orderNow: "Bestellen",
    fastMovers: "Hardlopers",
    slow: "Staat stil",
    all: "Alle vellen",
    folder: "Hangmap",
    partNumber: "Artikelnummer",
    model: "Model",
    layout: "Layout",
    enter: "Enter",
    fits: "Past op",
    inStock: "Voorraad",
    perWeek: "Per week",
    used: "Gebruikt",
    reorderAt: "Bestelpunt",
    orderUpTo: "Aanvullen tot",
    send: "Bestellen",
    daysLeft: "Dagen over",
    orderBy: "Uiterlijk",
    status: "Stand",
    share: "Aandeel",
    running: "Cumulatief",
    klasse: "Klasse",
    note: "Opmerking",
    lastUsed: "Laatst gebruikt",
    download: "Download voor Excel",
    search: "Artikelnummer, model of hangmap…",
    ownNumber: "eigen nummer — niet van Noviply",
    shared: "zelfde nummer in een andere hangmap",
    overdue: "te laat",
    workingDays: "werkdagen",
    today: "vandaag",
    nothing: "Niets te bestellen. Elke hangmap zit boven zijn bestelpunt.",
    noMatch: "Niets gevonden voor",
    sheets: "vellen",
    lines: "regels",
  },
};
