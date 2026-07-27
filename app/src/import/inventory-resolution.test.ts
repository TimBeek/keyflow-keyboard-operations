import { describe, expect, it } from "vitest";
import {
  allowedActions,
  InventoryResolutionError,
  validateImportResolution,
} from "./inventory-resolution";

describe("validateImportResolution", () => {
  it("valideert en normaliseert gecorrigeerde waarden", () => {
    expect(validateImportResolution(
      { severity: "error", field: "sku" },
      "correct_value",
      "nb10100e1nl",
    )).toEqual({ action: "correct_value", correctedValue: "nb10100e1nl" });
    expect(validateImportResolution(
      { severity: "warning", field: "layout" },
      "correct_value",
      "qwerty us",
    )).toEqual({ action: "correct_value", correctedValue: "QWERTY US" });
    expect(validateImportResolution(
      { severity: "error", field: "storageNumber" },
      "correct_value",
      "75",
    )).toEqual({ action: "correct_value", correctedValue: "75" });
  });

  it("weigert het administratief accepteren van een harde fout", () => {
    expect(() => validateImportResolution(
      { severity: "error", field: "sku" },
      "accept_warning",
    )).toThrowError(InventoryResolutionError);
  });

  it("vereist een bruikbare correctiewaarde", () => {
    expect(() => validateImportResolution(
      { severity: "error", field: "quantity" },
      "correct_value",
      "-1",
    )).toThrow("tussen 0 en 100.000");
  });

  it("biedt alleen passende acties per ernst", () => {
    expect(allowedActions({ severity: "review", field: "sku" })).toEqual([
      "keep_separate",
      "reject_row",
    ]);
  });

  it("weigert een ongeldig hangmapnummer", () => {
    expect(() => validateImportResolution(
      { severity: "error", field: "storageNumber" },
      "correct_value",
      "0",
    )).toThrow("tussen 1 en 10.000");
  });
});
