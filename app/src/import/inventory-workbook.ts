export type WorkbookCell = string | number | boolean | Date | null;

export type WorkbookSheet = {
  sheet: string;
  data: WorkbookCell[][];
};

export type ImportSeverity = "error" | "warning" | "review";

export type InventoryImportIssue = {
  severity: ImportSeverity;
  sourceRow: number;
  field: "storageNumber" | "quantity" | "sku" | "layout" | "linkedModels" | "model";
  code:
    | "INVALID_STORAGE_NUMBER"
    | "DUPLICATE_STORAGE_NUMBER"
    | "INVALID_QUANTITY"
    | "INVALID_SKU"
    | "UNKNOWN_LAYOUT"
    | "MISSING_COMPATIBILITY"
    | "DUPLICATE_SKU"
    | "DUPLICATE_MODEL";
  message: string;
};

export type InventoryImportRow = {
  sourceRow: number;
  storageNumber: number | null;
  model: string;
  normalizedModel: string;
  quantity: number | null;
  layout: string;
  sku: string;
  linkedModels: string;
  notes: string;
  rawData: WorkbookCell[];
};

export type InventoryWorkbookAnalysis = {
  rows: InventoryImportRow[];
  issues: InventoryImportIssue[];
  summary: {
    records: number;
    totalQuantity: number;
    errors: number;
    warnings: number;
    reviews: number;
  };
};

const knownLayouts = new Set(["QWERTY US", "AZERTY FR", "QWERTZ DE"]);
const compatibilityPlaceholders = new Set(["", "geen gevonden", "-", "\\", "0", "a"]);

export function analyzeInventoryWorkbook(sheets: WorkbookSheet[]): InventoryWorkbookAnalysis {
  const production = sheets.find(({ sheet }) => sheet.trim().toLowerCase() === "productie");
  if (!production) {
    throw new InventoryWorkbookError("MISSING_PRODUCTIE_SHEET", "Werkblad 'Productie' ontbreekt.");
  }

  const rows = production.data
    .slice(2)
    .filter((row) => row.some((cell) => cell !== null))
    .map<InventoryImportRow>((row, index) => {
      const model = cleanText(row[1]);
      return {
        sourceRow: index + 3,
        storageNumber: integerOrNull(row[0]),
        model,
        normalizedModel: normalize(model),
        quantity: integerOrNull(row[2]),
        layout: cleanText(row[3]),
        sku: cleanText(row[4]),
        linkedModels: cleanText(row[5]),
        notes: cleanText(row[6]),
        rawData: row,
      };
    });

  const issues: InventoryImportIssue[] = [];
  const skuRows = new Map<string, number[]>();
  const modelRows = new Map<string, number[]>();
  const storageNumberRows = new Map<string, number[]>();

  for (const row of rows) {
    if (row.storageNumber === null || row.storageNumber <= 0) {
      issues.push(issue("error", row.sourceRow, "storageNumber", "INVALID_STORAGE_NUMBER", `Ongeldig hangmapnummer: ${row.storageNumber ?? "leeg"}`));
    }
    if (row.quantity === null || row.quantity < 0) {
      issues.push(issue("error", row.sourceRow, "quantity", "INVALID_QUANTITY", `Ongeldig aantal: ${row.quantity ?? "leeg"}`));
    }
    if (!/^NB\d+E\d+(NL|FR|DE)$/i.test(row.sku)) {
      issues.push(issue("error", row.sourceRow, "sku", "INVALID_SKU", `Ontbrekend of afwijkend artikelnummer: ${row.sku || "leeg"}`));
    }
    if (!knownLayouts.has(row.layout)) {
      issues.push(issue("warning", row.sourceRow, "layout", "UNKNOWN_LAYOUT", `Onbekende layout: ${row.layout || "leeg"}`));
    }
    if (compatibilityPlaceholders.has(row.linkedModels.toLowerCase())) {
      issues.push(issue("warning", row.sourceRow, "linkedModels", "MISSING_COMPATIBILITY", "Compatibiliteit ontbreekt of bevat een placeholder."));
    }
    addIndex(skuRows, row.sku, row.sourceRow);
    addIndex(modelRows, row.normalizedModel, row.sourceRow);
    if (row.storageNumber !== null) addIndex(storageNumberRows, String(row.storageNumber), row.sourceRow);
  }

  for (const [sku, sourceRows] of skuRows) {
    if (sku && sourceRows.length > 1) {
      issues.push(issue("review", sourceRows[0], "sku", "DUPLICATE_SKU", `Dubbel artikelnummer ${sku} op rijen ${sourceRows.join(", ")}.`));
    }
  }
  for (const [model, sourceRows] of modelRows) {
    if (model && sourceRows.length > 1) {
      issues.push(issue("review", sourceRows[0], "model", "DUPLICATE_MODEL", `Dubbele modelnaam na normalisatie op rijen ${sourceRows.join(", ")}.`));
    }
  }
  for (const [storageNumber, sourceRows] of storageNumberRows) {
    if (sourceRows.length > 1) {
      issues.push(issue("review", sourceRows[0], "storageNumber", "DUPLICATE_STORAGE_NUMBER", `Hangmapnummer ${storageNumber} wordt gebruikt op rijen ${sourceRows.join(", ")}.`));
    }
  }

  return {
    rows,
    issues,
    summary: {
      records: rows.length,
      totalQuantity: rows.reduce((sum, row) => sum + Math.max(row.quantity ?? 0, 0), 0),
      errors: issues.filter(({ severity }) => severity === "error").length,
      warnings: issues.filter(({ severity }) => severity === "warning").length,
      reviews: issues.filter(({ severity }) => severity === "review").length,
    },
  };
}

export class InventoryWorkbookError extends Error {
  constructor(
    public readonly code: "MISSING_PRODUCTIE_SHEET",
    message: string,
  ) {
    super(message);
    this.name = "InventoryWorkbookError";
  }
}

function cleanText(value: WorkbookCell | undefined) {
  return value === null || value === undefined ? "" : String(value).trim().replace(/\s+/g, " ");
}

function normalize(value: string) {
  return cleanText(value).toLowerCase();
}

function integerOrNull(value: WorkbookCell | undefined) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function addIndex(index: Map<string, number[]>, key: string, row: number) {
  const sourceRows = index.get(key) ?? [];
  sourceRows.push(row);
  index.set(key, sourceRows);
}

function issue(
  severity: ImportSeverity,
  sourceRow: number,
  field: InventoryImportIssue["field"],
  code: InventoryImportIssue["code"],
  message: string,
): InventoryImportIssue {
  return { severity, sourceRow, field, code, message };
}
