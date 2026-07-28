export const canonicalInventoryExpectation = {
  rowCount: 148,
  totalQuantity: 3218,
} as const;

export const productionLayoutCodes = {
  "QWERTY US": "QWERTY_US",
  "AZERTY FR": "AZERTY_FR",
  "QWERTZ DE": "QWERTZ_DE",
} as const;

export type ProductionLayout = keyof typeof productionLayoutCodes;
export type ProductionDataQuality = "ready" | "blocked";

export type ProductionSourceMetadata = {
  fileName: string;
  sheet: string;
  sha256: string;
  rowCount: number;
  totalQuantity: number;
};

export type ProductionSourceRow = {
  sourceRow: number;
  storageNumber: number;
  model: string;
  stock: number;
  layout: string;
  sku: string;
  linkedModels: string;
  notes: string;
};

export type ProductionBootstrapRow = ProductionSourceRow & {
  catalogKey: string;
  normalizedSku: string;
  layoutCode: string | null;
  variant: string | null;
  modelAliases: string[];
  dataQuality: ProductionDataQuality;
  dataQualityIssues: string[];
};

export type ProductionModel = {
  manufacturer: string;
  modelName: string;
  normalizedName: string;
  aliases: string[];
};

export type ProductionBootstrapPlan = {
  metadata: ProductionSourceMetadata;
  rows: ProductionBootstrapRow[];
  operationalRows: ProductionBootstrapRow[];
  blockedRows: ProductionBootstrapRow[];
  models: ProductionModel[];
  operationalQuantity: number;
};

type SourceExpectation = {
  rowCount: number;
  totalQuantity: number;
};

export class ProductionBootstrapValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`De productiebron is ongeldig: ${issues.join(" ")}`);
    this.name = "ProductionBootstrapValidationError";
  }
}

export function createProductionBootstrapPlan(
  metadata: ProductionSourceMetadata,
  sourceRows: readonly ProductionSourceRow[],
  expectation: SourceExpectation = canonicalInventoryExpectation,
): ProductionBootstrapPlan {
  const sourceIssues = validateSource(metadata, sourceRows, expectation);
  if (sourceIssues.length > 0) {
    throw new ProductionBootstrapValidationError(sourceIssues);
  }

  const skuCounts = sourceRows.reduce<Map<string, number>>((counts, row) => {
    const sku = normalizeSku(row.sku);
    if (sku) counts.set(sku, (counts.get(sku) ?? 0) + 1);
    return counts;
  }, new Map());

  const rows = sourceRows.map<ProductionBootstrapRow>((row) => {
    const normalizedSku = normalizeSku(row.sku);
    const dataQualityIssues: string[] = [];
    const layoutCode = productionLayoutCodes[row.layout as ProductionLayout] ?? null;

    if (!/^NB\d+E\d+(NL|FR|DE)$/.test(normalizedSku)) {
      dataQualityIssues.push("Artikelnummer ontbreekt of heeft een ongeldig formaat.");
    }
    if ((skuCounts.get(normalizedSku) ?? 0) > 1) {
      dataQualityIssues.push(
        "Artikelnummer staat op meerdere hangmaplocaties en vereist managementcontrole.",
      );
    }
    if (!layoutCode) {
      dataQualityIssues.push("Keyboardlayout is niet ondersteund voor de productie-import.");
    }

    return {
      ...row,
      catalogKey: `hangmap-${String(row.storageNumber).padStart(3, "0")}`,
      normalizedSku,
      layoutCode,
      variant: normalizedSku.match(/E(\d+)/)?.[0] ?? null,
      modelAliases: collectProductionModelAliases(row.model, row.linkedModels),
      dataQuality: dataQualityIssues.length === 0 ? "ready" : "blocked",
      dataQualityIssues,
    };
  });

  const operationalRows = rows.filter(({ dataQuality }) => dataQuality === "ready");
  const blockedRows = rows.filter(({ dataQuality }) => dataQuality === "blocked");

  return {
    metadata: { ...metadata },
    rows,
    operationalRows,
    blockedRows,
    models: buildProductionModels(operationalRows),
    operationalQuantity: operationalRows.reduce((sum, row) => sum + row.stock, 0),
  };
}

export function collectProductionModelAliases(primaryModel: string, linkedModels: string) {
  const aliases = [primaryModel, ...linkedModels.split(",")]
    .map(cleanText)
    .filter((model) => !isPlaceholderModel(model));

  return [
    ...new Map(
      aliases.map((model) => [normalizeProductionModel(model), model] as const),
    ).values(),
  ];
}

export function normalizeProductionModel(value: string) {
  return canonicalizeManufacturer(value)
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function productionManufacturer(value: string) {
  const normalized = value.toLowerCase().trim();
  if (/^(dell)\b/.test(normalized)) return "Dell";
  if (/^(hp)\b/.test(normalized)) return "HP";
  if (/^(lenovo)\b/.test(normalized)) return "Lenovo";
  if (/^(fujitsu)\b/.test(normalized)) return "Fujitsu";
  if (/^(microsoft|mircorsoft)\b/.test(normalized)) return "Microsoft";
  if (/^(apple)\b/.test(normalized)) return "Apple";
  if (/^(acer)\b/.test(normalized)) return "Acer";
  if (/^(toshiba|dynabook)\b/.test(normalized)) return "Dynabook";
  return "Onbekend";
}

function validateSource(
  metadata: ProductionSourceMetadata,
  rows: readonly ProductionSourceRow[],
  expectation: SourceExpectation,
) {
  const issues: string[] = [];
  const totalQuantity = rows.reduce(
    (sum, row) => sum + (Number.isInteger(row.stock) ? row.stock : 0),
    0,
  );
  const sourceRows = rows.map(({ sourceRow }) => sourceRow);
  const storageNumbers = rows.map(({ storageNumber }) => storageNumber);

  if (!metadata.fileName.trim()) issues.push("Bestandsnaam ontbreekt.");
  if (!metadata.sheet.trim()) issues.push("Werkbladnaam ontbreekt.");
  if (!/^[a-f0-9]{64}$/i.test(metadata.sha256)) {
    issues.push("SHA-256 van de bron ontbreekt of is ongeldig.");
  }
  if (rows.length !== metadata.rowCount) {
    issues.push(`Metadata noemt ${metadata.rowCount} regels, maar de bron bevat ${rows.length}.`);
  }
  if (totalQuantity !== metadata.totalQuantity) {
    issues.push(
      `Metadata noemt ${metadata.totalQuantity} vellen, maar de bron bevat ${totalQuantity}.`,
    );
  }
  if (rows.length !== expectation.rowCount || totalQuantity !== expectation.totalQuantity) {
    issues.push(
      `Bron bevat ${rows.length} regels en ${totalQuantity} vellen; verwacht `
      + `${expectation.rowCount} en ${expectation.totalQuantity}.`,
    );
  }
  if (new Set(sourceRows).size !== sourceRows.length) {
    issues.push("Bronrijnummers zijn niet uniek.");
  }
  if (new Set(storageNumbers).size !== storageNumbers.length) {
    issues.push("Hangmapnummers zijn niet uniek.");
  }

  for (const row of rows) {
    if (!Number.isInteger(row.sourceRow) || row.sourceRow < 1) {
      issues.push(`Bronrijnummer ${row.sourceRow} is ongeldig.`);
    }
    if (!Number.isInteger(row.storageNumber) || row.storageNumber < 1) {
      issues.push(`Hangmapnummer ${row.storageNumber} is ongeldig.`);
    }
    if (!Number.isInteger(row.stock) || row.stock < 0) {
      issues.push(`Voorraad op bronrij ${row.sourceRow} is ongeldig.`);
    }
    if (!cleanText(row.model)) {
      issues.push(`Model op bronrij ${row.sourceRow} ontbreekt.`);
    }
  }

  return [...new Set(issues)];
}

function buildProductionModels(rows: readonly ProductionBootstrapRow[]) {
  const models = new Map<string, ProductionModel>();

  for (const row of rows) {
    for (const alias of row.modelAliases) {
      const modelName = canonicalizeManufacturer(alias);
      const normalizedName = normalizeProductionModel(modelName);
      const current = models.get(normalizedName);
      if (current) {
        if (!current.aliases.includes(alias)) current.aliases.push(alias);
        continue;
      }
      models.set(normalizedName, {
        manufacturer: productionManufacturer(modelName),
        modelName,
        normalizedName,
        aliases: [alias],
      });
    }
  }

  return [...models.values()].sort((left, right) =>
    left.normalizedName.localeCompare(right.normalizedName, "nl", { numeric: true }),
  );
}

function canonicalizeManufacturer(value: string) {
  return cleanText(value)
    .replace(/^Mircorsoft\b/i, "Microsoft")
    .replace(/^Toshiba Dynabook\b/i, "Dynabook");
}

function normalizeSku(value: string) {
  return cleanText(value).toUpperCase();
}

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isPlaceholderModel(value: string) {
  const normalized = value.toLowerCase();
  return (
    !normalized
    || ["geen gevonden", "-", "\\", "0"].includes(normalized)
    || /^[a-z]$/i.test(normalized)
  );
}
