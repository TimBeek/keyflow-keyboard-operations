import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import { inventoryQuantity } from "./inventory-quantities";
import { realUsageUnits } from "./real-usage";
import { calculateResupplyLevel, measuredHistoryDays } from "./resupply";
import { layoutWithCountry, type InventoryTransactionEntry } from "./operations";
import { dayKey } from "./reporting";

/**
 * Het voorraadbeeld op het scherm van Noviply, uit één berekening.
 *
 * Er stonden twee panelen naast elkaar die dezelfde vraag verschillend
 * beantwoordden. De hardlopers rekenden over een vast venster van dertig dagen
 * zonder meetdrempel; de voorraadtabel over de gemeten periode mét een
 * ondergrens van veertien dagen. Dezelfde hangmap kon daardoor bovenin "nog
 * geen week" melden en onderin "nog geen minimum bekend". Wie daarop bestelt,
 * bestelt op ruis.
 *
 * Nu is er één rijenlijst en zijn beide tabellen een andere blik daarop: de ene
 * toont alles, de andere alleen wat aandacht vraagt. Ze kunnen elkaar niet meer
 * tegenspreken.
 */

/** Waar deze hangmap aan toe is. Van erg naar rustig. */
export type StockSignal =
  /** Niets meer, en we weten niet hoe hard het loopt. */
  | "empty"
  /** Niets meer, en het loopt. */
  | "out"
  /** Onder het minimum én een hardloper: dit is de bestelregel. */
  | "order_now"
  /** Onder het minimum. */
  | "order"
  /** Nog boven het minimum, maar een hardloper die er bij de volgende keer
   *  kijken doorheen is. */
  | "watch"
  /**
   * Geen weekverbruik te geven. Dat kan twee dingen betekenen: er is nog te
   * kort gemeten, óf dit vel is in die tijd niet gebruikt. Beide keren valt er
   * niets zinnigs over bestellen te zeggen.
   */
  | "unknown"
  | "ok";

export type NoviplyStockRow = {
  catalogKey: string;
  storageNumber: number;
  sku: string;
  /** Het nummer is van onszelf; Noviply kan dit niet leveren. */
  ownNumber: boolean;
  /** Ditzelfde nummer ligt ook in een andere hangmap. */
  sharedNumber: boolean;
  model: string;
  /** Hoeveel laptopmodellen dit vel bedienen kan. */
  compatibleModels: number;
  /** Met de landcode erbij; anders lijken bijna alle regels identiek. */
  layout: string;
  variant: string;
  note: string;
  stock: number;
  /** Echt verbruik over het venster; puur om te tonen. */
  used: number;
  /** Gemeten weekverbruik, of null zolang er te weinig is gemeten. */
  weeklyDemand: number | null;
  minimum: number | null;
  shortfall: number;
  /** Hoeveel weken de huidige voorraad nog meegaat. */
  coverWeeks: number | null;
  /** Wat er bij zou moeten om weer even vooruit te kunnen. */
  orderQuantity: number;
  fastMover: boolean;
  signal: StockSignal;
};

export const moverWindowDays = 30;

/**
 * Vanaf hoeveel vellen per week iets een hardloper is.
 *
 * Eén vel per week klinkt weinig, maar op honderdachtenveertig hangmappen met
 * een levertijd in weken is dat precies de grens waarboven leeg raken pijn doet.
 */
export const fastMoverPerWeek = 1;

/** Hoe ver vooruit je wilt kunnen kijken zonder opnieuw te hoeven bestellen. */
const reviewWeeks = 4;

type Beleid = {
  leadTimeDays: number;
  safetyWeeks: number;
};

export function noviplyStockRows(
  catalog: InventoryCatalogItem[],
  transactions: InventoryTransactionEntry[],
  quantities: Record<string, number>,
  now: Date,
  beleid: Beleid,
): NoviplyStockRow[] {
  const vandaag = dayKey(now);
  // Eén meetperiode voor alle hangmappen; anders krijgt een map die net één
  // keer is gebruikt zijn eigen, veel te korte periode.
  const historyDays = measuredHistoryDays(transactions, vandaag);

  const vanaf = now.getTime() - moverWindowDays * 24 * 60 * 60 * 1000;
  const binnenVenster = transactions.filter((entry) => {
    const moment = new Date(entry.occurredAt).getTime();
    return !Number.isNaN(moment) && moment >= vanaf;
  });

  return catalog
    .filter((item) => item.dataQuality === "ready")
    .map((item): NoviplyStockRow => {
      const stock = inventoryQuantity(quantities, item);
      const level = calculateResupplyLevel(
        transactions, item, stock, vandaag, historyDays,
        beleid.leadTimeDays, beleid.safetyWeeks,
      );
      const vanDitVel = binnenVenster.filter((entry) =>
        entry.catalogKey ? entry.catalogKey === item.catalogKey : entry.sku === item.sku);
      const used = realUsageUnits(vanDitVel);

      const weeklyDemand = level?.weeklyDemand ?? null;
      const coverWeeks = level?.weeksOfStock ?? null;
      const shortfall = level?.shortfall ?? 0;
      const fastMover = weeklyDemand !== null && weeklyDemand >= fastMoverPerWeek;

      return {
        catalogKey: item.catalogKey,
        storageNumber: item.storageNumber,
        sku: item.sku,
        ownNumber: item.ownNumber,
        sharedNumber: item.sharedNumber,
        model: item.model,
        compatibleModels: item.compatibleModels,
        layout: layoutWithCountry(item.layout, item.sku),
        // Engels, want dit staat op hun scherm; de Nederlandse terugval van
        // extractStickerVariant hoort daar niet thuis.
        variant: item.sku.match(/E\d+/i)?.[0]?.toUpperCase() ?? "Unknown",
        note: item.sourceNote ?? "",
        stock,
        used,
        weeklyDemand,
        minimum: level?.minimum ?? null,
        shortfall,
        coverWeeks,
        orderQuantity: bestelAantal(stock, weeklyDemand, beleid),
        fastMover,
        signal: signaalVoor({ level, stock, shortfall, coverWeeks, fastMover }, beleid),
      };
    });
}

/**
 * Hoeveel erbij moet.
 *
 * Genoeg om de levertijd, de veiligheidsmarge én de periode tot de volgende
 * keer kijken te overbruggen. Bestel je precies tot het minimum, dan sta je bij
 * het eerstvolgende vel weer onder de grens.
 */
function bestelAantal(stock: number, weeklyDemand: number | null, beleid: Beleid) {
  if (weeklyDemand === null || weeklyDemand <= 0) return 0;
  const doel = Math.ceil(
    weeklyDemand * (beleid.leadTimeDays / 7 + beleid.safetyWeeks + reviewWeeks),
  );
  return Math.max(0, doel - stock);
}

function signaalVoor(
  invoer: {
    level: { minimum: number } | null;
    stock: number;
    shortfall: number;
    coverWeeks: number | null;
    fastMover: boolean;
  },
  beleid: Beleid,
): StockSignal {
  // Zonder meting valt er niets te zeggen — behalve dat een lege map leeg is.
  if (invoer.level === null) return invoer.stock === 0 ? "empty" : "unknown";
  if (invoer.stock === 0) return "out";
  /*
   * Onder het minimum én een hardloper is de regel waar de gebruiker om vroeg:
   * "er is er nog 1 en het is een hardloper, dan moet deze besteld gaan
   * worden". Onder het minimum zonder hardloper mag ook besteld worden, maar
   * dat heeft geen haast.
   */
  if (invoer.shortfall > 0) return invoer.fastMover ? "order_now" : "order";
  /*
   * Nog nét boven het minimum, maar een hardloper. Bij de volgende keer kijken
   * is die eroverheen — en dan is bestellen te laat, want de levertijd loopt
   * nog. `shortfall > 0` is wiskundig hetzelfde als "dekking onder het
   * minimum"; dit is de enige echt nieuwe band.
   */
  const grens = beleid.leadTimeDays / 7 + beleid.safetyWeeks + reviewWeeks;
  if (invoer.fastMover && invoer.coverWeeks !== null && invoer.coverWeeks < grens) {
    return "watch";
  }
  return "ok";
}

/** Van erg naar rustig, zodat de bestellijst op volgorde van haast staat. */
const signaalRang: Record<StockSignal, number> = {
  out: 0, order_now: 1, order: 2, watch: 3, empty: 4, unknown: 5, ok: 6,
};

export function signalLabel(signal: StockSignal) {
  switch (signal) {
    case "out": return "Out of stock";
    case "order_now": return "Order now";
    case "order": return "Order";
    case "watch": return "Running low";
    case "empty": return "Empty";
    case "unknown": return "No usage figure";
    default: return "Fine";
  }
}

/**
 * Wat aandacht vraagt, met de meeste haast bovenaan.
 *
 * "Nog niet gemeten" hoort hier niet bij: er ligt voorraad en wij weten alleen
 * nog niet hoe hard het loopt. Dat is geen bestelregel maar een gebrek aan
 * gegevens, en zou de lijst in de eerste weken vullen met alle honderdachten-
 * veertig hangmappen. Leeg is wél een bestelregel, gemeten of niet.
 */
export function rowsNeedingAttention(rows: NoviplyStockRow[]) {
  return rows
    .filter((rij) => rij.signal !== "ok" && rij.signal !== "unknown")
    .sort((links, rechts) =>
      signaalRang[links.signal] - signaalRang[rechts.signal]
      || rechts.shortfall - links.shortfall
      || (links.coverWeeks ?? Infinity) - (rechts.coverWeeks ?? Infinity)
      || links.stock - rechts.stock
      || links.storageNumber - rechts.storageNumber);
}

/** Alles, hardst lopend bovenaan. Wat niet loopt zakt vanzelf naar onderen. */
export function rowsByMovement(rows: NoviplyStockRow[]) {
  return [...rows].sort((links, rechts) =>
    rechts.used - links.used
    || links.stock - rechts.stock
    || links.storageNumber - rechts.storageNumber);
}

/** Zoeken op artikelnummer of model; Noviply denkt in nummers. */
export function searchStockRows(rows: NoviplyStockRow[], query: string) {
  const gezocht = query.trim().toLowerCase();
  if (!gezocht) return rows;
  return rows.filter((rij) =>
    rij.sku.toLowerCase().includes(gezocht)
    || rij.model.toLowerCase().includes(gezocht)
    || rij.layout.toLowerCase().includes(gezocht)
    || String(rij.storageNumber) === gezocht);
}
