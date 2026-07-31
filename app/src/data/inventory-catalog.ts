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
  /** Wat er op het vel staat, en wat de werkvloer op het scherm leest. */
  sku: string;
  /**
   * Waarop de voorraad wordt geteld. Normaal hetzelfde als het artikelnummer,
   * maar twee hangmappen kunnen hetzelfde nummer dragen en die willen we apart
   * kunnen tellen — dan krijgt elke map hier zijn eigen sleutel.
   */
  stockKey: string;
  /** Het nummer komt niet van Noviply maar hebben we zelf toegekend. */
  ownNumber: boolean;
  /** Ditzelfde artikelnummer ligt ook in een andere hangmap. */
  sharedNumber: boolean;
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

/**
 * De vellen in de kast zijn van Noviply en dragen hun artikelnummer. Bij een
 * handvol hangmappen staat er geen nummer in de bronlijst, en bij een paar
 * andere staat hetzelfde nummer bij twee mappen. Zulke mappen bleven vroeger
 * ongebruikt: de werkvloer kreeg dan geen vel aangewezen en de laptop ging naar
 * de printer, terwijl er tientallen vellen lagen.
 *
 * Daarom krijgt elke hangmap hier een eigen sleutel om op te tellen. Ontbreekt
 * het nummer, dan kennen we er zelf een toe met RM ervoor — meteen te zien dat
 * het van ons is en niet bij Noviply te bestellen. Staat hetzelfde nummer bij
 * twee mappen, dan houdt allebei het echte nummer op het scherm en telt elke
 * map los verder.
 */
const eigenNummerLanden: Record<InventoryLayout, string> = {
  "QWERTY US": "NL",
  "AZERTY FR": "FR",
  "QWERTZ DE": "DE",
};

function eigenArtikelnummer(storageNumber: number, layout: InventoryLayout) {
  // E1 omdat elke hangmap zonder nummer naast mappen met dezelfde modellen ligt
  // die allemaal E1 zijn. Klopt dat voor een map niet, dan corrigeert
  // management het nummer in de catalogus.
  return `RM${String(storageNumber).padStart(5, "0")}E1${eigenNummerLanden[layout] ?? "NL"}`;
}

export const inventoryCatalog: InventoryCatalogItem[] = inventorySourceRows.map((row) => {
  const bronSku = row.sku.trim().toUpperCase();
  const layout = row.layout as InventoryLayout;
  const bruikbaarNummer = /^NB\d+E\d+(NL|FR|DE)$/.test(bronSku);
  const gedeeld = bruikbaarNummer && (skuCounts.get(bronSku) ?? 0) > 1;

  const sku = bruikbaarNummer ? bronSku : eigenArtikelnummer(row.storageNumber, layout);
  const stockKey = gedeeld ? `${sku}-M${row.storageNumber}` : sku;

  const dataQualityIssues: string[] = [];
  if (!bruikbaarNummer) {
    dataQualityIssues.push(
      `Geen artikelnummer in de bronlijst; ${sku} is zelf toegekend. Vul het echte nummer in zodra het bekend is.`,
    );
  }
  if (gedeeld) {
    dataQualityIssues.push(
      `Artikelnummer ${sku} ligt ook in een andere hangmap; deze map telt apart verder.`,
    );
  }

  const modelAliases = collectModelAliases(row.model, row.linkedModels);
  // Wat een hangmap écht onbruikbaar maakt is dat er geen laptop bij staat: dan
  // valt er niets op te zoeken. Een ontbrekend of dubbel artikelnummer is
  // hierboven opgelost en hoeft de map niet meer buiten te sluiten.
  if (modelAliases.length === 0) {
    dataQualityIssues.push("Er staat geen laptopmodel bij deze hangmap.");
  }

  return {
    catalogKey: `hangmap-${String(row.storageNumber).padStart(3, "0")}`,
    sourceRow: row.sourceRow,
    model: row.model,
    modelAliases,
    sku,
    stockKey,
    ownNumber: !bruikbaarNummer,
    sharedNumber: gedeeld,
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
    dataQuality: modelAliases.length === 0 ? "blocked" : "ready",
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
