import { describe, expect, it } from "vitest";
import { buildModelChoices, searchModelMatches, searchModels } from "./model-search";
import { catalogModelOptions } from "./model-catalog";
import { inventoryCatalog } from "@/data/inventory-catalog";

const hangmapModels = ["Dell Latitude 5420", "HP ProBook 640 G5"];
const choices = buildModelChoices(hangmapModels);

describe("buildModelChoices", () => {
  it("zet de hangmapmodellen voorop", () => {
    expect(choices.slice(0, 2).map((choice) => choice.name)).toEqual(hangmapModels);
    expect(choices.every((choice, index) => index >= 2 || choice.source === "hangmap")).toBe(true);
  });

  it("voegt de rest van de laptopdatabase toe", () => {
    // Bijna tweeduizend modellen gaan door de handen; 376 hangen aan een hangmap.
    expect(choices.length).toBeGreaterThan(1500);
    expect(choices.some((choice) => choice.source === "database")).toBe(true);
  });

  it("neemt een model dat al aan een hangmap hangt niet dubbel op", () => {
    const dells = choices.filter((choice) =>
      choice.name.toLowerCase() === "dell latitude 5420");

    expect(dells).toHaveLength(1);
    expect(dells[0].source).toBe("hangmap");
  });
});

describe("searchModels", () => {
  it("vindt een model op het kale nummer van de onderkant", () => {
    const results = searchModels(choices, "5420");

    expect(results[0].name).toBe("Dell Latitude 5420");
  });

  it("laat de hangmap voorgaan bij een gelijke treffer", () => {
    // Daar ligt een vel klaar; de rest kost een aanvraag of een print.
    const results = searchModels(choices, "latitude 5420");

    expect(results[0].source).toBe("hangmap");
  });

  it("vindt ook laptops zonder hangmap", () => {
    const results = searchModels(choices, "thinkpad");

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((choice) => choice.source === "database")).toBe(true);
  });

  it("trekt zich niets aan van de volgorde van woorden", () => {
    const heen = searchModels(choices, "dell 5420");
    const terug = searchModels(choices, "5420 dell");

    expect(heen[0].name).toBe(terug[0].name);
  });

  it("geeft niets terug bij een te korte of onzinnige zoekterm", () => {
    expect(searchModels(choices, "a")).toEqual([]);
    expect(searchModels(choices, "zzzzqqq")).toEqual([]);
  });

  it("houdt de lijst kort genoeg om uit te kiezen", () => {
    expect(searchModels(choices, "hp").length).toBeLessThanOrEqual(8);
  });
});

describe("Wat er buiten de lijst valt", () => {
  const echteKeuzes = buildModelChoices(catalogModelOptions(inventoryCatalog));

  it("vertelt hoeveel treffers er in totaal zijn", () => {
    // "840" levert meer op dan er passen. Stond er alleen "8 modellen" boven,
    // dan lijkt de lijst compleet en kiest de medewerker de bovenste die erop
    // lijkt — met een vel dat niet op zijn laptop past.
    const uitkomst = searchModelMatches(echteKeuzes, "840");

    expect(uitkomst.shown).toHaveLength(8);
    expect(uitkomst.total).toBeGreaterThan(uitkomst.shown.length);
  });

  it("zegt niets over afkappen als alles past", () => {
    const uitkomst = searchModelMatches(echteKeuzes, "Dell Latitude 5420");

    expect(uitkomst.total).toBe(uitkomst.shown.length);
  });

  it("laat searchModels precies doen wat het deed", () => {
    expect(searchModels(echteKeuzes, "840").map((c) => c.name))
      .toEqual(searchModelMatches(echteKeuzes, "840").shown.map((c) => c.name));
  });
});
