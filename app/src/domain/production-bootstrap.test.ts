import { describe, expect, it } from "vitest";
import {
  createProductionBootstrapPlan,
  normalizeProductionModel,
  productionManufacturer,
  ProductionBootstrapValidationError,
} from "./production-bootstrap";
import {
  inventorySourceMetadata,
  inventorySourceRows,
} from "@/data/inventory-source.generated";

describe("productiedatabase-bootstrapplan", () => {
  it("scheidt de volledige bron van veilig operationeel inzetbare voorraad", () => {
    const plan = createProductionBootstrapPlan(
      inventorySourceMetadata,
      inventorySourceRows,
    );

    expect(plan.rows).toHaveLength(148);
    expect(plan.operationalRows).toHaveLength(139);
    expect(plan.blockedRows).toHaveLength(9);
    expect(plan.operationalQuantity).toBe(3017);
    expect(plan.blockedRows.map(({ storageNumber }) => storageNumber)).toEqual([
      30, 36, 63, 92, 105, 110, 133, 147, 148,
    ]);
  });

  it("maakt het hangmapnummer, de layoutcode en E-variant expliciet", () => {
    const plan = createProductionBootstrapPlan(
      inventorySourceMetadata,
      inventorySourceRows,
    );

    expect(plan.rows.find(({ storageNumber }) => storageNumber === 75)).toMatchObject({
      catalogKey: "hangmap-075",
      normalizedSku: "NB10172E1NL",
      layoutCode: "QWERTY_US",
      variant: "E1",
      dataQuality: "ready",
    });
    expect(plan.rows.find(({ storageNumber }) => storageNumber === 140)).toMatchObject({
      normalizedSku: "NB10200E2NL",
      variant: "E2",
    });
  });

  it("bewaart foute bronregels maar laat ze niet operationeel door", () => {
    const plan = createProductionBootstrapPlan(
      inventorySourceMetadata,
      inventorySourceRows,
    );

    expect(plan.rows.find(({ storageNumber }) => storageNumber === 30)).toMatchObject({
      normalizedSku: ",,,,,,,,,,",
      stock: 31,
      dataQuality: "blocked",
      dataQualityIssues: ["Artikelnummer ontbreekt of heeft een ongeldig formaat."],
    });
    expect(plan.rows.find(({ storageNumber }) => storageNumber === 147)?.dataQualityIssues)
      .toContain("Artikelnummer staat op meerdere hangmaplocaties en vereist managementcontrole.");
  });

  it("normaliseert bekende fabrikantvarianten voor modellen", () => {
    expect(productionManufacturer("Mircorsoft Surface Laptop 2")).toBe("Microsoft");
    expect(productionManufacturer("Toshiba Dynabook Satellite Pro A50-EC")).toBe("Dynabook");
    expect(normalizeProductionModel("Dell Precision7530")).toBe("dell precision 7530");
    expect(normalizeProductionModel("Dell Precision 7530")).toBe("dell precision 7530");
  });

  it("weigert een gewijzigd of beschadigd broncontract vóór databasegebruik", () => {
    expect(() => createProductionBootstrapPlan(
      { ...inventorySourceMetadata, totalQuantity: 1 },
      inventorySourceRows,
    )).toThrow(ProductionBootstrapValidationError);

    expect(() => createProductionBootstrapPlan(
      inventorySourceMetadata,
      inventorySourceRows.slice(1),
    )).toThrow(/verwacht 148 en 3218/i);
  });
});
