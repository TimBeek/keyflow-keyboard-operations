import { describe, expect, it } from "vitest";
import {
  calculateStockCount,
  StockCountRuleError,
} from "./cycle-count";

describe("cycle-countregels", () => {
  it("registreert een kloppende telling zonder voorraadmutatie", () => {
    expect(calculateStockCount(25, 25)).toEqual({
      expectedQuantity: 25,
      countedQuantity: 25,
      difference: 0,
      status: "matched",
      notes: undefined,
    });
  });

  it("berekent tekorten en overschotten", () => {
    expect(calculateStockCount(25, 23, "Twee vellen ontbreken")).toMatchObject({
      difference: -2,
      status: "shortage",
    });
    expect(calculateStockCount(25, 27, "Levering nog niet geboekt")).toMatchObject({
      difference: 2,
      status: "overage",
    });
  });

  it("vereist toelichting bij ieder verschil", () => {
    expect(() => calculateStockCount(25, 24, "  ")).toThrow(StockCountRuleError);
  });

  it("weigert negatieve en niet-gehele tellingen", () => {
    expect(() => calculateStockCount(25, -1, "Ongeldig")).toThrow(StockCountRuleError);
    expect(() => calculateStockCount(25, 2.5, "Ongeldig")).toThrow(StockCountRuleError);
  });
});
