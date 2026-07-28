import type { InventoryCatalogItem } from "@/data/inventory-catalog";

export type InventoryQuantities = Record<string, number>;

export function inventoryQuantity(
  quantities: InventoryQuantities,
  item: InventoryCatalogItem,
) {
  return quantities[item.catalogKey]
    ?? (item.sku ? quantities[item.sku] : undefined)
    ?? item.stock;
}

export function withInventoryQuantity(
  quantities: InventoryQuantities,
  item: InventoryCatalogItem,
  quantity: number,
) {
  return {
    ...quantities,
    [item.catalogKey]: quantity,
  };
}

export function migrateInventoryQuantities(
  quantities: InventoryQuantities,
  catalog: InventoryCatalogItem[],
) {
  const migrated: InventoryQuantities = {};
  const catalogKeys = new Set(catalog.map(({ catalogKey }) => catalogKey));

  for (const [key, quantity] of Object.entries(quantities)) {
    if (catalogKeys.has(key)) migrated[key] = quantity;
  }

  for (const [legacySku, quantity] of Object.entries(quantities)) {
    if (catalogKeys.has(legacySku)) continue;
    const candidates = catalog.filter(
      (item) =>
        item.dataQuality === "ready"
        && item.sku === legacySku,
    );
    if (candidates.length === 1 && migrated[candidates[0].catalogKey] === undefined) {
      migrated[candidates[0].catalogKey] = quantity;
    }
  }

  return migrated;
}
