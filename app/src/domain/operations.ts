import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import type { ConversionMethodId } from "@/domain/conversion-policy";
import { inventoryQuantity } from "./inventory-quantities";
import { modelMatchesCatalogItem } from "./model-catalog";

export type OperationalMethodId = Exclude<ConversionMethodId, "none">;

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
      status: "not_found";
      candidates: [];
    };

export function findNoviplySku(
  model: string,
  targetLayout: string,
  catalog: InventoryCatalogItem[],
  quantities: Record<string, number>,
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

  if (candidates.length > 1) {
    return { status: "ambiguous", candidates };
  }

  const item = candidates[0];
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

  const totalUsageValue = rows.reduce((sum, row) => sum + row.usageValue, 0);
  let cumulativeValue = 0;

  return rows.map((row) => {
    const percentageBefore = totalUsageValue === 0 ? 100 : (cumulativeValue / totalUsageValue) * 100;
    cumulativeValue += row.usageValue;
    const cumulativePercentage = totalUsageValue === 0 ? 100 : (cumulativeValue / totalUsageValue) * 100;
    const abcClass = percentageBefore < policy.abcAThreshold
      ? "A"
      : percentageBefore < policy.abcBThreshold
        ? "B"
        : "C";

    return {
      ...row,
      sharePercentage: totalUsageValue === 0 ? 0 : (row.usageValue / totalUsageValue) * 100,
      cumulativePercentage,
      abcClass,
      velocity: abcClass === "A" ? "Hardloper" : abcClass === "B" ? "Middenloper" : "Zachtloper",
    };
  });
}

function normalizeLayout(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
