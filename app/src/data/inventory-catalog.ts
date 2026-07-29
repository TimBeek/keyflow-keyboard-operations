import {
  inventorySourceMetadata,
  inventorySourceRows,
} from "./inventory-source.generated";

export type InventoryLayout = "QWERTY US" | "AZERTY FR" | "QWERTZ DE";
export type InventoryDataQuality = "ready" | "blocked";
export type PlanningDataStatus = "unconfigured" | "measured";

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
    // Verbruik, levertijd en inkoopprijs stonden hier als verzonnen
    // voorbeeldwaarden, tot en met een prijs per vel. Ze blijven nul tot ze uit
    // de bron of uit gemeten verbruik komen.
    averageWeeklyDemand: 0,
    leadTimeDays: 0,
    safetyStockWeeks: 0,
    unitCost: 0,
    location: "Hangmappenwagen",
    storageNumber: row.storageNumber,
    sourceNote: row.notes || undefined,
    supplier: "Noviply",
    compatibleModels: modelAliases.length,
    dataQuality: dataQualityIssues.length === 0 ? "ready" : "blocked",
    dataQualityIssues,
    planningDataStatus: "unconfigured",
  };
});

export const operationalInventoryCatalog = inventoryCatalog.filter(
  ({ dataQuality }) => dataQuality === "ready",
);

/**
 * Alleen hangmappen waarvan het verbruik werkelijk bekend is. Zolang die niet
 * gemeten is, mag er geen besteladvies uit rollen dat op niets berust.
 */
export const planningCatalog = inventoryCatalog.filter(
  ({ dataQuality, planningDataStatus }) =>
    dataQuality === "ready" && planningDataStatus === "measured",
);

export const inventoryCatalogSummary = {
  ...inventorySourceMetadata,
  operationalRows: operationalInventoryCatalog.length,
  blockedRows: inventoryCatalog.length - operationalInventoryCatalog.length,
  planningRows: planningCatalog.length,
} as const;

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
