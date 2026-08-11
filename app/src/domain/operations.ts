import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import { normalizeLayoutName } from "./keyboard-layouts";
import { realReceiptUnits, realUsageUnits } from "./real-usage";
import type { OperationalMethodId } from "@/domain/conversion-policy";
import { inventoryQuantity } from "./inventory-quantities";
import { modelMatchesCatalogItem } from "./model-catalog";
import { defaultPrintRunTimes, type PrintRunTimes } from "./print-runs";

// Hoort bij het beleid, niet bij de voorraad; hier alleen doorgegeven.
export type { OperationalMethodId };
export type { PrintRunTimes };

/**
 * Voor welke prijsklasse een regel geldt. Ontbreekt hij, dan geldt de regel
 * voor beide — zo blijven regels van vóór deze splitsing gewoon werken.
 */
export type PriceBand = "below" | "above";

export type LayoutRule = {
  layout: string;
  band?: PriceBand;
  method: OperationalMethodId;
  /**
   * Wat er moet gebeuren als die methode niet kan — een lege hangmap, een
   * model dat de toetsenbordsprinter niet aankan. Zonder dit valt het advies
   * terug op de standaardvolgorde, en die kiest niet altijd wat jij zou
   * kiezen: bij QWERTY US onder de grens is dat de toetsenbordsprint, terwijl
   * de premiumsticker vaak de bedoeling is.
   */
  fallback?: OperationalMethodId;
  note: string;
};

export type OperationsPolicy = {
  thresholdEur: number;
  workload: "quiet" | "normal" | "busy" | "critical";
  methodEnabled: Record<OperationalMethodId, boolean>;
  employeeCanReceive: boolean;
  employeeCanBookMismatch: boolean;
  abcAThreshold: number;
  abcBThreshold: number;
  /** Uitzonderingen per doeltaal; die gaan voor op de waarderegel. */
  layoutRules: LayoutRule[];
  /** Hoe lang Noviply erover doet, en hoeveel reserve we willen. */
  resupplyLeadTimeDays: number;
  resupplySafetyWeeks: number;
  /** Hoe vaak er bij Noviply besteld wordt, in dagen. De knop voor batchgrootte. */
  orderCycleDays: number;
  /** Hoe ver vooruit een regel mag meeliften op een bestelling, in werkdagen. */
  canOrderDays: number;
  /** Niet minder dan dit van één artikel bestellen. */
  minLineQuantity: number;
  /** Wanneer Noviply de twee automatische printrondes draait, als "HH:MM". */
  printRunTimes: PrintRunTimes;
};

export const defaultOperationsPolicy: OperationsPolicy = {
  thresholdEur: 300,
  workload: "normal",
  methodEnabled: {
    loose_stickers: false,
    noviply_sheet: true,
    printed_sticker: true,
    direct_reprint: true,
  },
  employeeCanReceive: true,
  employeeCanBookMismatch: true,
  abcAThreshold: 80,
  abcBThreshold: 95,
  layoutRules: [],
  resupplyLeadTimeDays: 11,
  resupplySafetyWeeks: 1,
  orderCycleDays: 28,
  canOrderDays: 10,
  minLineQuantity: 10,
  printRunTimes: defaultPrintRunTimes,
};

export type InventoryTransactionEntry = {
  id: string;
  occurredAt: string;
  catalogKey?: string;
  storageNumber?: number;
  sku: string;
  model: string;
  layout: string;
  type: "issue" | "receipt" | "adjustment";
  quantityDelta: number;
  reasonCode: string;
  notes?: string;
  actor: string;
  reference?: string;
  /**
   * Een samengevoegde regel uit de import: twaalf weken verbruik op één datum.
   * Bruikbaar voor een beginstand, niet voor een dagverloop.
   */
  aggregated?: boolean;
};

export type InventoryMutationRequest = {
  /**
   * De sleutel van de hangmap waaruit geboekt wordt. Meestal het artikelnummer,
   * maar twee mappen kunnen hetzelfde nummer dragen — dan is dit de sleutel die
   * alleen bij die ene map hoort. Zie `stockKey` in de catalogus.
   */
  sku: string;
  type: "issue" | "receipt";
  quantity: number;
  reasonCode: string;
  notes?: string;
  reference?: string;
  actor: string;
};

export type InventoryMutationOutcome = {
  newQuantity: number;
  quantityDelta: number;
};

export type NoviplySkuMatch =
  | {
      status: "matched";
      item: InventoryCatalogItem;
      currentStock: number;
      variant: string;
      /** Andere hangmappen met een vel dat op dit model past. */
      alternatives: InventoryCatalogItem[];
    }
  | {
      status: "out_of_stock";
      item: InventoryCatalogItem;
      currentStock: 0;
      variant: string;
      alternatives: InventoryCatalogItem[];
    }
  | {
      // Het model staat er wel, maar niet in de gekozen entervorm.
      status: "other_variant";
      candidates: InventoryCatalogItem[];
      availableVariants: string[];
    }
  | {
      status: "not_found";
      candidates: [];
    };

/**
 * Eén laptop past vaak in meerdere hangmappen: een vel dat voor de ThinkPad
 * L380 is ingekocht past net zo goed op een T495, en zo staat hetzelfde model
 * bij verschillende mappen in de bijbehorende modellen. Welke van die mappen je
 * pakt maakt voor de laptop niet uit, dus wijst de app er zelf één aan.
 *
 * De volgorde: een map waarvan iemand met een foto heeft vastgelegd dat het
 * past gaat voor, een afgekeurde map achteraan, daarna wat er nog ligt (want
 * een lege map helpt de werkvloer niet), dan de voorste map met de meeste
 * vellen. Bij gelijke stand het laagste hangmapnummer, zodat dezelfde laptop
 * morgen hetzelfde antwoord geeft.
 */
function rankCandidates(
  candidates: InventoryCatalogItem[],
  quantities: Record<string, number>,
  evidenceStatusFor?: (item: InventoryCatalogItem) => "approved" | "rejected" | null,
) {
  const weging = (item: InventoryCatalogItem) => {
    const bewijs = evidenceStatusFor?.(item) ?? null;
    return {
      bewijs: bewijs === "approved" ? 0 : bewijs === "rejected" ? 2 : 1,
      voorraad: inventoryQuantity(quantities, item),
    };
  };
  return [...candidates].sort((left, right) => {
    const a = weging(left);
    const b = weging(right);
    if (a.bewijs !== b.bewijs) return a.bewijs - b.bewijs;
    const aLeeg = a.voorraad <= 0 ? 1 : 0;
    const bLeeg = b.voorraad <= 0 ? 1 : 0;
    if (aLeeg !== bLeeg) return aLeeg - bLeeg;
    if (a.voorraad !== b.voorraad) return b.voorraad - a.voorraad;
    return left.storageNumber - right.storageNumber;
  });
}

export function findNoviplySku(
  model: string,
  targetLayout: string,
  catalog: InventoryCatalogItem[],
  quantities: Record<string, number>,
  wantedVariant?: string,
  evidenceStatusFor?: (item: InventoryCatalogItem) => "approved" | "rejected" | null,
): NoviplySkuMatch {
  const candidates = catalog.filter(
    (item) =>
      item.dataQuality === "ready"
      && modelMatchesCatalogItem(model, item)
      && normalizeLayout(item.layout) === normalizeLayout(targetLayout),
  );

  if (candidates.length === 0) {
    return { status: "not_found", candidates: [] };
  }

  // De entervorm bepaalt uit welke hangmap het vel komt. Kiest de medewerker er
  // een, dan mag alleen die vorm terugkomen — nooit stilzwijgend de andere.
  const wanted = wantedVariant?.trim().toUpperCase() ?? "";
  const matchingVariant = wanted
    ? candidates.filter((item) => extractStickerVariant(item.sku) === wanted)
    : candidates;

  if (wanted && matchingVariant.length === 0) {
    return {
      status: "other_variant",
      candidates,
      availableVariants: [
        ...new Set(candidates.map((item) => extractStickerVariant(item.sku))),
      ],
    };
  }

  const [item, ...alternatives] = rankCandidates(matchingVariant, quantities, evidenceStatusFor);
  const currentStock = inventoryQuantity(quantities, item);
  const variant = extractStickerVariant(item.sku);

  if (currentStock <= 0) {
    return { status: "out_of_stock", item, currentStock: 0, variant, alternatives };
  }

  return { status: "matched", item, currentStock, variant, alternatives };
}

export function extractStickerVariant(sku: string) {
  return sku.match(/E\d+/i)?.[0]?.toUpperCase() ?? "Variant onbekend";
}

// Het land van de sticker staat achteraan het artikelnummer: NB10052E1NL is de
// NL-uitvoering. Lege regels uit de Excel-import leveren geen code op.
export function extractStickerCountry(sku: string) {
  return sku.trim().match(/([A-Z]{2})$/i)?.[1]?.toUpperCase() ?? "";
}

// "QWERTY US" verzwijgt voor welk land het vel is; "AZERTY FR" zegt het al.
// Daarom alleen aanvullen als de layout de landcode nog niet noemt.
export function layoutWithCountry(layout: string, sku: string) {
  const country = extractStickerCountry(sku);
  if (!country || layout.toUpperCase().endsWith(country)) return layout;
  return `${layout} ${country}`;
}

export type AbcAnalysisRow = {
  catalogKey: string;
  storageNumber: number;
  sku: string;
  model: string;
  layout: string;
  issueUnits: number;
  receiptUnits: number;
  netMovement: number;
  usageValue: number;
  sharePercentage: number;
  cumulativePercentage: number;
  abcClass: "A" | "B" | "C";
  velocity: "Hardloper" | "Middenloper" | "Zachtloper";
};

export function calculateAbcAnalysis(
  catalog: InventoryCatalogItem[],
  transactions: InventoryTransactionEntry[],
  policy: Pick<OperationsPolicy, "abcAThreshold" | "abcBThreshold">,
): AbcAnalysisRow[] {
  const rows = catalog.map((item) => {
    const skuTransactions = transactions.filter((entry) =>
      entry.catalogKey
        ? entry.catalogKey === item.catalogKey
        : item.dataQuality === "ready" && entry.sku === item.sku,
    );
    // Alleen wat er echt doorheen is gegaan. Het inladen van de bronlijst en de
    // tellingcorrecties zeggen niets over hoe hard een vel loopt; die meetellen
    // maakte van een leeggeboekte hangmap de grootste hardloper van de lijst.
    const issueUnits = realUsageUnits(skuTransactions);
    const receiptUnits = realReceiptUnits(skuTransactions);

    return {
      catalogKey: item.catalogKey,
      storageNumber: item.storageNumber,
      sku: item.sku,
      model: item.model,
      layout: item.layout,
      issueUnits,
      receiptUnits,
      netMovement: receiptUnits - issueUnits,
      usageValue: issueUnits * item.unitCost,
    };
  }).sort((a, b) => b.usageValue - a.usageValue || b.issueUnits - a.issueUnits);

  // Zolang er geen inkoopprijs bekend is, is verbruikswaarde overal nul en zou
  // alles als zachtloper eindigen. Dan rangschikken we op aantallen: dat meet
  // hetzelfde — wat gaat er hard doorheen — zonder een prijs te verzinnen.
  const totalUsageValue = rows.reduce((sum, row) => sum + row.usageValue, 0);
  const totalUnits = rows.reduce((sum, row) => sum + row.issueUnits, 0);
  const rankOnUnits = totalUsageValue === 0 && totalUnits > 0;
  const total = rankOnUnits ? totalUnits : totalUsageValue;
  const weightOf = (row: { usageValue: number; issueUnits: number }) =>
    rankOnUnits ? row.issueUnits : row.usageValue;
  let cumulativeValue = 0;

  return rows.map((row) => {
    const percentageBefore = total === 0 ? 100 : (cumulativeValue / total) * 100;
    cumulativeValue += weightOf(row);
    const cumulativePercentage = total === 0 ? 100 : (cumulativeValue / total) * 100;
    const abcClass = percentageBefore < policy.abcAThreshold
      ? "A"
      : percentageBefore < policy.abcBThreshold
        ? "B"
        : "C";

    return {
      ...row,
      sharePercentage: total === 0 ? 0 : (weightOf(row) / total) * 100,
      cumulativePercentage,
      abcClass,
      velocity: abcClass === "A" ? "Hardloper" : abcClass === "B" ? "Middenloper" : "Zachtloper",
    };
  });
}

function normalizeLayout(value: string) {
  return normalizeLayoutName(value);
}
