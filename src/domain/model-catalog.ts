import type { InventoryCatalogItem } from "@/data/inventory-catalog";

export function catalogModelOptions(catalog: InventoryCatalogItem[]) {
  const byNormalizedName = new Map<string, string>();

  for (const item of catalog) {
    if (item.dataQuality !== "ready") continue;
    for (const alias of item.modelAliases) {
      const normalized = normalizeModel(alias);
      if (!normalized || byNormalizedName.has(normalized)) continue;
      byNormalizedName.set(normalized, alias);
    }
  }

  return [...byNormalizedName.values()].sort((left, right) =>
    left.localeCompare(right, "nl", { numeric: true, sensitivity: "base" }),
  );
}

export function modelMatchesCatalogItem(model: string, item: InventoryCatalogItem) {
  const normalizedModel = normalizeModel(model);
  return item.modelAliases.some((alias) => normalizeModel(alias) === normalizedModel);
}

function normalizeModel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}
