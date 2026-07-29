import { planningCatalog } from "./inventory-catalog";
import type { InventoryTransactionEntry } from "../domain/operations";

export const initialInventoryTransactions: InventoryTransactionEntry[] = planningCatalog.flatMap(
  (item, index) => {
    const issueUnits = Math.round(item.averageWeeklyDemand * 12);
    const issueEntry: InventoryTransactionEntry[] = issueUnits > 0
      ? [{
          id: `history-issue-${item.sku}`,
          occurredAt: `2026-07-${String(2 + (index % 24)).padStart(2, "0")}T09:15:00.000Z`,
          catalogKey: item.catalogKey,
          storageNumber: item.storageNumber,
          sku: item.sku,
          model: item.model,
          layout: item.layout,
          type: "issue",
          quantityDelta: -issueUnits,
          reasonCode: "conversion_usage",
          notes: "Samengevoegd verbruik over de afgelopen 12 weken",
          actor: "Historische import",
          reference: "12W-BASELINE",
          aggregated: true,
        }]
      : [];
    const receiptEntry: InventoryTransactionEntry[] = index % 3 === 0
      ? [{
          id: `history-receipt-${item.sku}`,
          occurredAt: `2026-07-${String(3 + (index % 20)).padStart(2, "0")}T11:30:00.000Z`,
          catalogKey: item.catalogKey,
          storageNumber: item.storageNumber,
          sku: item.sku,
          model: item.model,
          layout: item.layout,
          type: "receipt",
          quantityDelta: Math.max(10, Math.round(item.averageWeeklyDemand * 8)),
          reasonCode: "supplier_delivery",
          notes: "Samengevoegde leveranciersontvangst",
          actor: "Historische import",
          reference: `PO-26${String(index + 1).padStart(3, "0")}`,
          aggregated: true,
        }]
      : [];

    return [...issueEntry, ...receiptEntry];
  },
);
