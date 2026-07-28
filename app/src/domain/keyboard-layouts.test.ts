import { describe, expect, it } from "vitest";
import {
  currentLayoutOptions,
  genericNordicLayout,
  isScandinavianLayout,
  requiresExactLayoutChoice,
  scandinavianLayoutReferences,
  targetLayoutOptions,
} from "./keyboard-layouts";

describe("keyboardlayoutkeuzes", () => {
  it("zet de generieke Scandinavische invoer bovenaan voor ingekochte laptops", () => {
    expect(currentLayoutOptions[0]).toMatchObject({
      value: genericNordicLayout,
      group: "Scandinavisch",
      exact: false,
    });
  });

  it("vereist een exacte Scandinavische keuze voordat de order verdergaat", () => {
    expect(requiresExactLayoutChoice(genericNordicLayout)).toBe(true);
    expect(requiresExactLayoutChoice("QWERTY SE/FI")).toBe(false);
  });

  it("biedt Zweeds/Fins, Noors en Deens als afzonderlijke layouts", () => {
    expect(scandinavianLayoutReferences.map((layout) => layout.value)).toEqual([
      "QWERTY SE/FI",
      "QWERTY NO",
      "QWERTY DK",
    ]);
    expect(scandinavianLayoutReferences.every((layout) => isScandinavianLayout(layout.value))).toBe(true);
  });

  it("laat de onbepaalde Nordic-keuze niet als klantlayout opslaan", () => {
    expect(targetLayoutOptions.some((layout) => layout.value === genericNordicLayout)).toBe(false);
    expect(targetLayoutOptions[0].value).toBe("QWERTY US");
  });

  it("houdt Nederlands QWERTY apart van US International", () => {
    expect(targetLayoutOptions.map((layout) => layout.value)).toEqual(
      expect.arrayContaining(["QWERTY US", "QWERTY NL"]),
    );
  });
});
