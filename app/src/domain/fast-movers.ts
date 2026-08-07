import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import { inventoryQuantity } from "./inventory-quantities";
import { realUsageUnits } from "./real-usage";
import type { InventoryTransactionEntry } from "./operations";

/**
 * Welke vellen er het hardst doorheen gaan.
 *
 * ReMarkt heeft hier al een analyse voor, maar die is op geld en op letters:
 * A, B en C. Dat is een inkoopgesprek. Noviply wil iets anders weten — wat moet
 * ik voorradig houden en waar loop ik straks tegenaan — en dat is gewoon: hoe
 * vaak is dit vel de afgelopen weken gebruikt, en hoeveel liggen er nog.
 *
 * Bewust alleen echt verbruik. Het inlezen van de bronlijst en tellingcorrecties
 * zeggen niets over hoe hard iets loopt; die meetellen maakte van een
 * leeggeboekte hangmap ooit de grootste hardloper van de lijst.
 */
export type FastMover = {
  catalogKey: string;
  storageNumber: number;
  sku: string;
  model: string;
  layout: string;
  /** Vellen gebruikt binnen het venster. */
  used: number;
  /** Wat er nu nog ligt. */
  stock: number;
};

export const defaultMoverWindowDays = 30;

export function fastMovers(
  catalog: InventoryCatalogItem[],
  transactions: InventoryTransactionEntry[],
  quantities: Record<string, number>,
  now: Date,
  windowDays = defaultMoverWindowDays,
  limit = 10,
): FastMover[] {
  const vanaf = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const binnenVenster = transactions.filter((entry) => {
    const moment = new Date(entry.occurredAt).getTime();
    return !Number.isNaN(moment) && moment >= vanaf;
  });

  return catalog
    .map((item): FastMover => {
      const vanDitVel = binnenVenster.filter((entry) =>
        entry.catalogKey
          ? entry.catalogKey === item.catalogKey
          : item.dataQuality === "ready" && entry.sku === item.sku,
      );
      return {
        catalogKey: item.catalogKey,
        storageNumber: item.storageNumber,
        sku: item.sku,
        model: item.model,
        layout: item.layout,
        used: realUsageUnits(vanDitVel),
        stock: inventoryQuantity(quantities, item),
      };
    })
    // Een vel dat niet gebruikt is, is geen hardloper. Die eruit laten scheelt
    // Noviply een lijst van honderdveertig regels waarvan er tien iets zeggen.
    .filter((rij) => rij.used > 0)
    .sort((links, rechts) =>
      rechts.used - links.used
      // Bij gelijk verbruik eerst wat het krapst zit: daar loop je het eerst
      // tegenaan.
      || links.stock - rechts.stock
      || links.storageNumber - rechts.storageNumber)
    .slice(0, limit);
}

/**
 * Hoeveel weken deze voorraad nog meegaat bij dit tempo.
 *
 * Het getal waar een leverancier iets aan heeft: niet "er liggen er twaalf" maar
 * "dat is nog twee weken". Zonder verbruik valt er niets te zeggen; dan liever
 * niets dan een verzonnen oneindig.
 */
export function weeksOfCover(mover: FastMover, windowDays = defaultMoverWindowDays) {
  if (mover.used <= 0) return null;
  const perWeek = (mover.used / windowDays) * 7;
  if (perWeek <= 0) return null;
  return mover.stock / perWeek;
}
