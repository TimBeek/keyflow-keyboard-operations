import {
  inventorySourceMetadata,
  inventorySourceRows,
} from "./inventory-source.generated";

export type InventoryLayout = "QWERTY US" | "AZERTY FR" | "QWERTZ DE";
export type InventoryDataQuality = "ready" | "blocked";
export type PlanningDataStatus = "sample" | "unconfigured";

export type InventoryCatalogItem = {
  catalogKey: string;
  sourceRow: number;
  model: string;
  modelAliases: string[];
  sku: string;
  layout: InventoryLayout;
  stock: number;
  reserved: number;
  averageWeeklyDemand: number;
  leadTimeDays: number;
  safetyStockWeeks: number;
  location: "Hangmappenwagen";
  storageNumber: number;
  sourceNote?: string;
  supplier: "Noviply";
  unitCost: number;
  compatibleModels: number;
  dataQuality: InventoryDataQuality;
  dataQualityIssues: string[];
  planningDataStatus: PlanningDataStatus;
};

type PlanningParameters = Pick<
  InventoryCatalogItem,
  "averageWeeklyDemand" | "leadTimeDays" | "safetyStockWeeks" | "unitCost"
>;

const sampleWeeklyDemandByStorageNumber: Readonly<Record<number, number>> = {
  1: 4.5,
  2: 3.2,
  3: 2.8,
  4: 5.5,
  5: 4.2,
  6: 6.5,
  7: 1.5,
  8: 2.1,
  9: 0,
  10: 4.8,
  11: 2.7,
  12: 1.8,
  13: 3.5,
  14: 2.9,
  15: 1.2,
  16: 3.8,
  17: 2.4,
  18: 4.1,
  19: 3.6,
  20: 4.9,
  41: 1.7,
  75: 4.3,
  112: 3.4,
  140: 2.2,
  146: 2.6,
};

const skuCounts = inventorySourceRows.reduce<Map<string, number>>((counts, row) => {
  const normalizedSku = row.sku.trim().toUpperCase();
  if (!normalizedSku) return counts;
  counts.set(normalizedSku, (counts.get(normalizedSku) ?? 0) + 1);
  return counts;
}, new Map());

export const inventoryCatalog: InventoryCatalogItem[] = inventorySourceRows.map((row) => {
  const sku = row.sku.trim().toUpperCase();
  const dataQualityIssues: string[] = [];
  if (!/^NB\d+E\d+(NL|FR|DE)$/.test(sku)) {
    dataQualityIssues.push("Artikelnummer ontbreekt of heeft een ongeldig formaat.");
  }
  if ((skuCounts.get(sku) ?? 0) > 1) {
    dataQualityIssues.push("Artikelnummer staat op meerdere hangmaplocaties en vereist managementcontrole.");
  }

  const planning = planningParameters(row.storageNumber, row.layout);
  const modelAliases = collectModelAliases(row.model, row.linkedModels);

  return {
    catalogKey: `hangmap-${String(row.storageNumber).padStart(3, "0")}`,
    sourceRow: row.sourceRow,
    model: row.model,
    modelAliases,
    sku,
    layout: row.layout as InventoryLayout,
    stock: row.stock,
    reserved: 0,
    ...planning,
    location: "Hangmappenwagen",
    storageNumber: row.storageNumber,
    sourceNote: row.notes || undefined,
    supplier: "Noviply",
    compatibleModels: modelAliases.length,
    dataQuality: dataQualityIssues.length === 0 ? "ready" : "blocked",
    dataQualityIssues,
    planningDataStatus: row.storageNumber in sampleWeeklyDemandByStorageNumber
      ? "sample"
      : "unconfigured",
  };
});

export const operationalInventoryCatalog = inventoryCatalog.filter(
  ({ dataQuality }) => dataQuality === "ready",
);

export const planningCatalog = inventoryCatalog.filter(
  ({ dataQuality, planningDataStatus }) =>
    dataQuality === "ready" && planningDataStatus === "sample",
);

export const inventoryCatalogSummary = {
  ...inventorySourceMetadata,
  operationalRows: operationalInventoryCatalog.length,
  blockedRows: inventoryCatalog.length - operationalInventoryCatalog.length,
  planningRows: planningCatalog.length,
} as const;

function planningParameters(storageNumber: number, layout: string): PlanningParameters {
  const configured = storageNumber in sampleWeeklyDemandByStorageNumber;
  const nonQwerty = layout !== "QWERTY US";
  return {
    averageWeeklyDemand: configured ? sampleWeeklyDemandByStorageNumber[storageNumber] : 0,
    leadTimeDays: configured ? (nonQwerty ? 21 : 14) : 0,
    safetyStockWeeks: configured ? (nonQwerty ? 3 : 2) : 0,
    unitCost: configured ? (nonQwerty ? 2.85 : 2.35) : 0,
  };
}

function collectModelAliases(primaryModel: string, linkedModels: string) {
  const placeholders = new Set(["", "geen gevonden", "-", "\\", "0", "a"]);
  const aliases = [primaryModel, ...linkedModels.split(",")]
    .map((model) => model.trim().replace(/\s+/g, " "))
    .filter((model) => !placeholders.has(model.toLowerCase()));

  return [...new Map(
    aliases.map((model) => [normalizeModel(model), model] as const),
  ).values()];
}

function normalizeModel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
