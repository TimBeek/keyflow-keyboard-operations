import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import { normalizeLayoutName } from "./keyboard-layouts";
import type { OperationalMethodId } from "@/domain/conversion-policy";
import { inventoryQuantity } from "./inventory-quantities";
import { modelMatchesCatalogItem } from "./model-catalog";

// Hoort bij het beleid, niet bij de voorraad; hier alleen doorgegeven.
export type { OperationalMethodId };

export type OperationsPolicy = {
  thresholdEur: number;
  workload: "normal" | "busy" | "critical";
  methodEnabled: Record<OperationalMethodId, boolean>;
  employeeCanReceive: boolean;
  employeeCanBookMismatch: boolean;
  abcAThreshold: number;
  abcBThreshold: number;
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
    }
  | {
      status: "out_of_stock";
      item: InventoryCatalogItem;
      currentStock: 0;
      variant: string;
    }
  | {
      status: "ambiguous";
      candidates: InventoryCatalogItem[];
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

export function findNoviplySku(
  model: string,
  targetLayout: string,
  catalog: InventoryCatalogItem[],
  quantities: Record<string, number>,
  wantedVariant?: string,
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

  if (matchingVariant.length > 1) {
    return { status: "ambiguous", candidates: matchingVariant };
  }

  const item = matchingVariant[0];
  const currentStock = inventoryQuantity(quantities, item);
  const variant = extractStickerVariant(item.sku);

  if (currentStock <= 0) {
    return { status: "out_of_stock", item, currentStock: 0, variant };
  }

  return { status: "matched", item, currentStock, variant };
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
    const issueUnits = skuTransactions
      .filter((entry) => entry.quantityDelta < 0)
      .reduce((sum, entry) => sum + Math.abs(entry.quantityDelta), 0);
    const receiptUnits = skuTransactions
      .filter((entry) => entry.quantityDelta > 0)
      .reduce((sum, entry) => sum + entry.quantityDelta, 0);

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
