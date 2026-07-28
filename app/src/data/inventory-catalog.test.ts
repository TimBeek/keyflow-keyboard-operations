import { describe, expect, it } from "vitest";
import {
  inventoryCatalog,
  inventoryCatalogSummary,
  operationalInventoryCatalog,
  planningCatalog,
} from "./inventory-catalog";

describe("volledige Excelvoorraadcatalogus", () => {
  it("bevat alle 148 genummerde hangmappen en exact 3.218 vellen", () => {
    expect(inventoryCatalog).toHaveLength(148);
    expect(new Set(inventoryCatalog.map(({ storageNumber }) => storageNumber)).size).toBe(148);
    expect(inventoryCatalog.map(({ storageNumber }) => storageNumber)).toEqual(
      Array.from({ length: 148 }, (_, index) => index + 1),
    );
    expect(inventoryCatalog.reduce((sum, item) => sum + item.stock, 0)).toBe(3218);
  });

  it("legt de gecontroleerde bronherkomst vast", () => {
    expect(inventoryCatalogSummary).toMatchObject({
      fileName: "Toetsenbordstickers voorraad.xlsx",
      sheet: "Productie",
      sha256: "30f6d1884c081c6ef72e99f7db779a7ef5a878b12a76fcd1ab85bc42b616ef7a",
      rowCount: 148,
      totalQuantity: 3218,
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

  it("houdt voorbeeldplanning strikt gescheiden van ongeconfigureerde bronregels", () => {
    expect(planningCatalog).toHaveLength(25);
    expect(inventoryCatalog.find(({ storageNumber }) => storageNumber === 75)).toMatchObject({
      model: "Dell Latitude 5420",
      sku: "NB10172E1NL",
      layout: "QWERTY US",
      stock: 25,
      planningDataStatus: "sample",
    });
    expect(inventoryCatalog.find(({ storageNumber }) => storageNumber === 76)).toMatchObject({
      planningDataStatus: "unconfigured",
      averageWeeklyDemand: 0,
      unitCost: 0,
    });
  });
});
