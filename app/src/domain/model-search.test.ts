import { describe, expect, it } from "vitest";
import { buildModelChoices, searchModels } from "./model-search";

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
