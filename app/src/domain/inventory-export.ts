import type { InventoryCatalogItem } from "@/data/inventory-catalog";

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
    quantities[item.sku] ?? item.stock,
    item.modelAliases.join(", "),
    item.sourceNote ?? "",
    item.dataQuality === "ready" ? "Operationeel" : "Geblokkeerd",
    item.dataQualityIssues.join(" "),
    item.planningDataStatus === "sample" ? "Voorbeeldparameters" : "Niet geconfigureerd",
  ]);

  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map(csvCell).join(";"))
    .join("\r\n")}\r\n`;
}

function csvCell(value: string | number) {
  if (typeof value === "number") return String(value);
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}
