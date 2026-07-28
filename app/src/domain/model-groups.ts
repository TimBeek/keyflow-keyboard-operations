import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import { extractStickerVariant } from "./operations";

export type ModelGroupStatus =
  | "blocked_source"
  | "needs_models"
  | "needs_fit_review"
  | "imported_unverified";

export type ModelGroupCandidate = {
  id: string;
  primaryModel: string;
  manufacturer: string;
  sku: string;
  layout: string;
  variant: string;
  storageNumber: number;
  models: string[];
  status: ModelGroupStatus;
  statusReason: string;
  sourceNote?: string;
};

export type ModelCompatibilityConflict = {
  model: string;
  layout: string;
  skus: string[];
  storageNumbers: number[];
};

export function buildModelGroupAudit(catalog: InventoryCatalogItem[]) {
  const groups = catalog.map<ModelGroupCandidate>((item) => {
    const status = groupStatus(item);
    return {
      id: item.catalogKey,
      primaryModel: item.model,
      manufacturer: manufacturerFromModel(item.model),
      sku: item.sku,
      layout: item.layout,
      variant: extractStickerVariant(item.sku),
      storageNumber: item.storageNumber,
      models: item.modelAliases,
      status: status.status,
      statusReason: status.reason,
      sourceNote: item.sourceNote,
    };
  });

  return {
    groups,
    conflicts: findCompatibilityConflicts(catalog),
    uniqueModels: new Set(
      catalog.flatMap(({ modelAliases }) => modelAliases.map(normalizeModel)),
    ).size,
    needsCompatibility: groups.filter(({ status }) => status === "needs_models").length,
    blockedSources: groups.filter(({ status }) => status === "blocked_source").length,
  };
}

function findCompatibilityConflicts(catalog: InventoryCatalogItem[]) {
  const matches = new Map<string, {
    displayModel: string;
    layout: string;
    skus: Set<string>;
    storageNumbers: Set<number>;
  }>();

  for (const item of catalog) {
    if (item.dataQuality !== "ready") continue;
    for (const model of item.modelAliases) {
      const key = `${normalizeModel(model)}|${item.layout.toLowerCase()}`;
      const match = matches.get(key) ?? {
        displayModel: model,
        layout: item.layout,
        skus: new Set<string>(),
        storageNumbers: new Set<number>(),
      };
      match.skus.add(item.sku);
      match.storageNumbers.add(item.storageNumber);
      matches.set(key, match);
    }
  }

  return [...matches.values()]
    .filter(({ skus }) => skus.size > 1)
    .map<ModelCompatibilityConflict>((match) => ({
      model: match.displayModel,
      layout: match.layout,
      skus: [...match.skus].sort(),
      storageNumbers: [...match.storageNumbers].sort((left, right) => left - right),
    }))
    .sort((left, right) =>
      left.model.localeCompare(right.model, "nl", { numeric: true, sensitivity: "base" }),
    );
}

function groupStatus(item: InventoryCatalogItem): {
  status: ModelGroupStatus;
  reason: string;
} {
  if (item.dataQuality === "blocked") {
    return {
      status: "blocked_source",
      reason: item.dataQualityIssues.join(" "),
    };
  }
  if (item.modelAliases.length <= 1) {
    return {
      status: "needs_models",
      reason: "Geen bruikbare gekoppelde modellen in de Excelbron.",
    };
  }
  if (item.sourceNote) {
    return {
      status: "needs_fit_review",
      reason: "Bronnotitie vereist een fysieke pasvormcontrole.",
    };
  }
  return {
    status: "imported_unverified",
    reason: "Excelkoppeling geïmporteerd; fysieke compatibiliteit is nog niet formeel goedgekeurd.",
  };
}

function manufacturerFromModel(model: string) {
  return model.trim().split(/\s+/)[0] || "Onbekend";
}

function normalizeModel(model: string) {
  return model.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}
