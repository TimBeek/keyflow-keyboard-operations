import { describe, expect, it } from "vitest";
import { inventoryCatalog } from "../data/inventory-catalog";
import {
  inventoryQuantity,
  migrateInventoryQuantities,
  withInventoryQuantity,
} from "./inventory-quantities";

describe("locatiegebonden voorraadhoeveelheden", () => {
  const hangmap75 = inventoryCatalog.find(({ storageNumber }) => storageNumber === 75)!;

  it("gebruikt de hangmap als primaire balanssleutel", () => {
    const quantities = withInventoryQuantity({}, hangmap75, 24);

    expect(quantities).toEqual({ "hangmap-075": 24 });
    expect(inventoryQuantity(quantities, hangmap75)).toBe(24);
  });

  it("leest een oude unieke SKU-sleutel achterwaarts compatibel", () => {
    expect(inventoryQuantity({ NB10172E1NL: 23 }, hangmap75)).toBe(23);
    expect(migrateInventoryQuantities(
      { NB10172E1NL: 23 },
      inventoryCatalog,
    )).toEqual({ "hangmap-075": 23 });
  });

  it("migreert een dubbele SKU niet naar twee fysieke locaties", () => {
    const migrated = migrateInventoryQuantities(
      { NB10100E1NL: 7 },
      inventoryCatalog,
    );

    expect(migrated).toEqual({});
  });

  it("kan een geblokkeerde hangmap afzonderlijk tellen", () => {
    const hangmap147 = inventoryCatalog.find(({ storageNumber }) => storageNumber === 147)!;
    const quantities = withInventoryQuantity({}, hangmap147, 10);

    expect(inventoryQuantity(quantities, hangmap147)).toBe(10);
  });
});
