import { describe, expect, it } from "vitest";
import {
  analyzeInventoryWorkbook,
  InventoryWorkbookError,
  type WorkbookSheet,
} from "./inventory-workbook";

function workbook(...rows: WorkbookSheet["data"][number][]): WorkbookSheet[] {
  return [
    {
      sheet: "Productie",
      data: [
        ["Voorraad toetsenbordstickers"],
        ["Nr.", "Model", "Aantal", "Layout", "Artikelnummer", "Gekoppelde modellen", "Notities"],
        ...rows,
      ],
    },
  ];
}

describe("analyzeInventoryWorkbook", () => {
  it("accepteert geldige voorraadregels en telt de voorraad op", () => {
    const result = analyzeInventoryWorkbook(
      workbook(
        [1, "Dell Latitude 5420", 12, "QWERTY US", "NB101E01NL", "Latitude 5420", null],
        [2, "HP EliteBook 840", 5, "AZERTY FR", "NB102E02FR", "EliteBook 840 G7", "Controle"],
      ),
    );

    expect(result.summary).toEqual({
      records: 2,
      totalQuantity: 17,
      errors: 0,
      warnings: 0,
      reviews: 0,
    });
    expect(result.rows[0].sourceRow).toBe(3);
  });

  it("signaleert fouten, waarschuwingen en genormaliseerde dubbelen", () => {
    const result = analyzeInventoryWorkbook(
      workbook(
        [1, "Dell  Latitude 5420", -1, "QWERTY UK", "fout", "\\", null],
        [2, "dell latitude 5420", 3, "QWERTY US", "NB101E01NL", "Latitude 5420", null],
        [3, "HP EliteBook", 2, "QWERTY US", "NB101E01NL", "EliteBook", null],
      ),
    );

    expect(result.summary).toEqual({
      records: 3,
      totalQuantity: 5,
      errors: 2,
      warnings: 2,
      reviews: 2,
    });
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "INVALID_QUANTITY",
        "INVALID_SKU",
        "UNKNOWN_LAYOUT",
        "MISSING_COMPATIBILITY",
        "DUPLICATE_SKU",
        "DUPLICATE_MODEL",
      ]),
    );
  });

  it("weigert een werkboek zonder Productie-tabblad", () => {
    expect(() =>
      analyzeInventoryWorkbook([{ sheet: "Overzicht", data: [] }]),
    ).toThrowError(InventoryWorkbookError);
  });
});
