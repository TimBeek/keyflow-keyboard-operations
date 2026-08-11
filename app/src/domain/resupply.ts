/**
 * Wanneer moet Noviply bijleveren?
 *
 * Het antwoord hing tot nu toe aan verzonnen vraagcijfers. Nu wordt het gemeten:
 * hoeveel vellen gaan er werkelijk uit een hangmap, over de historie die er is.
 * Loopt een hangmap harder, dan stijgt zijn minimum vanzelf mee.
 */

import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import type { InventoryTransactionEntry } from "./operations";
import { isRealUsage } from "./real-usage";
import { dayKey, daysBetween } from "./reporting";

/**
 * Noviply levert naar eigen zeggen in ongeveer anderhalve week.
 *
 * Dit is een mededeling van de leverancier, geen meting: er zijn nog geen
 * leveringen doorgemeten. Zodra die er zijn hoort dit getal daarop te volgen.
 * Management kan hem in de instellingen bijstellen zonder nieuwe versie.
 */
export const resupplyLeadTimeDays = 11;

/** Een week extra, voor een drukke week of een levering die tegenzit. */
export const resupplySafetyStockWeeks = 1;

/** Verder terugkijken maakt het traag reagerend op een model dat net hard gaat lopen. */
export const usageWindowWeeks = 8;

/**
 * Onder twee weken meten is elk gemiddelde ruis: één drukke dag zou het
 * minimum de lucht in jagen, één stille week zou een lege hangmap goedkeuren.
 */
export const minimumHistoryDays = 14;

/**
 * Of er genoeg gemeten is om over bijbestellen te beginnen.
 *
 * Zolang dit vals is, hoort er bij Noviply geen minimum, geen tekort en geen
 * verbruik in beeld te staan: dat zouden 139 streepjes zijn die eruitzien als
 * een storing. De kolommen komen vanzelf terug zodra er echt gewerkt is.
 */
export function resupplyReady(
  transactions: InventoryTransactionEntry[],
  today: string,
) {
  return measuredHistoryDays(transactions, today) >= minimumHistoryDays;
}

export type ResupplyLevel = {
  /** Gemeten verbruik per week. */
  weeklyDemand: number;
  /** Onder dit aantal moet er bijbesteld worden. */
  minimum: number;
  /** Hoeveel er nu bij moet; nul als de voorraad toereikend is. */
  shortfall: number;
  /** Hoeveel weken de huidige voorraad nog meegaat. */
  weeksOfStock: number;
};

function issuesFor(
  transactions: InventoryTransactionEntry[],
  item: InventoryCatalogItem,
  fromDay: string,
) {
  return transactions.filter((entry) =>
    entry.aggregated !== true
    && entry.type === "issue"
    && dayKey(entry.occurredAt) >= fromDay
    && (entry.catalogKey ? entry.catalogKey === item.catalogKey : entry.sku === item.sku));
}

/**
 * Hoeveel dagen verbruik er te meten valt. Zolang dat er te weinig zijn, is er
 * geen betrouwbaar minimum — en dan liegen we er liever geen.
 */
export function measuredHistoryDays(
  transactions: InventoryTransactionEntry[],
  today: string,
) {
  const days = transactions
    .filter((entry) => entry.aggregated !== true)
    /*
     * Meten begint bij het eerste vel dat er echt doorheen ging.
     *
     * Twee dingen die hier eerder misgingen. Het inladen van de bronlijst
     * gebeurde op de dag dat de app werd ingericht; dat als startpunt nemen
     * meet dagen die niemand heeft gewerkt. En een levering telde mee als
     * meetdag, terwijl we hier verbruik per week uitrekenen: een levering van
     * drie weken geleden en pas gisteren het eerste vel gaf een verbruik dat
     * drie keer te laag uitkwam — met een "OK" boven een hangmap die volgende
     * week leeg is.
     */
    .filter(isRealUsage)
    .map((entry) => dayKey(entry.occurredAt))
    .filter(Boolean)
    .sort();
  if (days.length === 0) return 0;
  return Math.max(0, daysBetween(days[0], today));
}

/**
 * Het bijbestelniveau voor één hangmap, of null zolang er te weinig gemeten is.
 * `historyDays` komt van buiten, zodat elke hangmap met dezelfde meetperiode
 * rekent — anders zou een hangmap die net één keer is gebruikt een eigen,
 * veel te korte periode krijgen.
 */
export function calculateResupplyLevel(
  transactions: InventoryTransactionEntry[],
  item: InventoryCatalogItem,
  stock: number,
  today: string,
  historyDays: number,
  // Levert Noviply sneller of trager, dan hoort dat een instelling te zijn en
  // geen nieuwe versie van de app.
  leadTimeDays = resupplyLeadTimeDays,
  safetyWeeks = resupplySafetyStockWeeks,
): ResupplyLevel | null {
  if (historyDays < minimumHistoryDays) return null;

  const measuredDays = Math.min(historyDays, usageWindowWeeks * 7);
  const fromDay = shiftDays(today, -measuredDays);
  const used = issuesFor(transactions, item, fromDay)
    .reduce((sum, entry) => sum + Math.abs(entry.quantityDelta), 0);

  const weeklyDemand = used / (measuredDays / 7);
  if (weeklyDemand <= 0) return null;

  const minimum = Math.ceil(weeklyDemand * (leadTimeDays / 7 + safetyWeeks));

  return {
    weeklyDemand,
    minimum,
    shortfall: Math.max(0, minimum - stock),
    weeksOfStock: stock / weeklyDemand,
  };
}

function shiftDays(day: string, delta: number) {
  const [year, month, date] = day.split("-").map(Number);
  return dayKey(new Date(year, month - 1, date + delta));
}
