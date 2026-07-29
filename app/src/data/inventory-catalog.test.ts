import { describe, expect, it } from "vitest";
import {
  inventoryCatalog,
  inventoryCatalogSummary,
  operationalInventoryCatalog,
  planningCatalog,
} from "./inventory-catalog";

describe("volledige Excelvoorraadcatalogus", () => {
  it("bevat elke genummerde hangmap uit de bron, met de voorraad uit de bron", () => {
    expect(inventoryCatalog).toHaveLength(148);
    expect(new Set(inventoryCatalog.map(({ storageNumber }) => storageNumber)).size).toBe(148);
    expect(inventoryCatalog.map(({ storageNumber }) => storageNumber)).toEqual(
      Array.from({ length: 148 }, (_, index) => index + 1),
    );
    expect(inventoryCatalog.reduce((sum, item) => sum + item.stock, 0))
      .toBe(inventoryCatalogSummary.totalQuantity);
  });

  it("legt de gecontroleerde bronherkomst vast", () => {
    expect(inventoryCatalogSummary).toMatchObject({
      fileName: "Toetsenbordstickers voorraad.xlsx",
      sheet: "Productie",
      rowCount: 148,
    });
  });

  it("blokkeert ontbrekende en dubbele artikelnummers voor operationeel gebruik", () => {
    expect(inventoryCatalogSummary.blockedRows).toBe(9);
    expect(operationalInventoryCatalog).toHaveLength(139);
    expect(inventoryCatalog.find(({ storageNumber }) => storageNumber === 63)).toMatchObject({
      sku: "",
      dataQuality: "blocked",
    });
    expect(inventoryCatalog.find(({ storageNumber }) => storageNumber === 147)).toMatchObject({
      sku: "NB10100E1NL",
      dataQuality: "blocked",
    });
  });

  it("verzint geen verbruik, levertijd of inkoopprijs", () => {
    // Deze stonden er als voorbeeldwaarden in, tot en met een prijs per vel.
    // Een besteladvies daarop kost geld, dus blijven ze nul tot ze gemeten zijn.
    expect(planningCatalog).toHaveLength(0);
    expect(inventoryCatalog.every((item) =>
      item.averageWeeklyDemand === 0
      && item.leadTimeDays === 0
      && item.safetyStockWeeks === 0
      && item.unitCost === 0
      && item.planningDataStatus === "unconfigured")).toBe(true);
  });

  it("leest de echte bronregels wel gewoon in", () => {
    expect(inventoryCatalog.find(({ storageNumber }) => storageNumber === 75)).toMatchObject({
      model: "Dell Latitude 5420",
      sku: "NB10172E1NL",
      layout: "QWERTY US",
      stock: 25,
    });
  });
});
