import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import { toCsv } from "./csv";
import { inventoryQuantity } from "./inventory-quantities";

const headers = [
  "Hangmap",
  "Model",
  "Artikelnummer",
  "Layout",
  "Voorraad",
  "Gekoppelde modellen",
  "Bronnotitie",
  "Datakwaliteit",
  "Datakwaliteitsmelding",
  "Planningsstatus",
] as const;

export function createInventoryCsv(
  items: InventoryCatalogItem[],
  quantities: Record<string, number>,
) {
  const rows = items.map((item) => [
    item.storageNumber,
    item.model,
    item.sku,
    item.layout,
    inventoryQuantity(quantities, item),
    item.modelAliases.join(", "),
    item.sourceNote ?? "",
    item.dataQuality === "ready" ? "Operationeel" : "Geblokkeerd",
    item.dataQualityIssues.join(" "),
    item.planningDataStatus === "sample" ? "Voorbeeldparameters" : "Niet geconfigureerd",
  ]);

  return toCsv(headers, rows);
}
