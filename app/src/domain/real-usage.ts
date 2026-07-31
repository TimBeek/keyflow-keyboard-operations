import type { InventoryTransactionEntry } from "./operations";

/**
 * Wat telt als echt verbruik, en wat is administratie.
 *
 * De voorraadboekingen zijn een allegaartje. Verreweg de meeste komen van het
 * inladen van de voorraadlijst: 137 regels, bijna drieduizend vellen, in één
 * seconde geboekt op de dag dat de app werd ingericht. Daarnaast staan er
 * tellingcorrecties in, en een enkele losse correctie.
 *
 * Werden die meegeteld, dan ging er van alles mis. Een hangmap die bij de
 * telling van 31 vellen naar nul ging, kwam op het scherm te staan als de
 * hardloper met het grootste aandeel — terwijl er nog geen enkel vel van op een
 * laptop was geplakt. En het vak "ingeboekt" toonde bijna drieduizend
 * "leveringen" terwijl er nog nooit iets geleverd is.
 *
 * Echt verbruik is een vel dat op een laptop terecht is gekomen, of daarbij is
 * misgegaan. Echt ontvangen is een levering die iemand heeft aangenomen.
 */

/** Een vel dat de kast uit is gegaan om er ook werkelijk op te gaan. */
const usageReasons = new Set(["conversion_usage", "verification_scrap", "fit_mismatch"]);

/** Een levering die iemand heeft aangenomen, of een correctie daarop. */
const receiptReasons = new Set(["supplier_delivery", "correction"]);

export function isRealUsage(entry: InventoryTransactionEntry) {
  return entry.quantityDelta < 0 && usageReasons.has(entry.reasonCode);
}

export function isRealReceipt(entry: InventoryTransactionEntry) {
  return entry.quantityDelta > 0 && receiptReasons.has(entry.reasonCode);
}

/**
 * Administratie: het inladen van de bronlijst en de tellingcorrecties. Die
 * horen wél in de geschiedenis thuis — je moet kunnen terugzoeken waar een
 * verschil vandaan komt — maar ze zeggen niets over hoe hard iets loopt.
 */
export function isBookkeeping(entry: InventoryTransactionEntry) {
  return !isRealUsage(entry) && !isRealReceipt(entry);
}

export function realUsageUnits(transactions: InventoryTransactionEntry[]) {
  return transactions
    .filter(isRealUsage)
    .reduce((sum, entry) => sum + Math.abs(entry.quantityDelta), 0);
}

export function realReceiptUnits(transactions: InventoryTransactionEntry[]) {
  return transactions
    .filter(isRealReceipt)
    .reduce((sum, entry) => sum + entry.quantityDelta, 0);
}
