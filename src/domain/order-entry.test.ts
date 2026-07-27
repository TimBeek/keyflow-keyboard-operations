import { describe, expect, it } from "vitest";
import {
  classifyValueBand,
  getSaleValueBand,
  policyValueForBand,
  resolveModelQuery,
} from "./order-entry";

const models = [
  "Dell Latitude 5420",
  "Dell Latitude 7400",
  "HP EliteBook 850 G7",
  "HP ZBook Fury 15 G7",
];

describe("modelnummer invoer", () => {
  it("herkent 5420 automatisch als Dell Latitude 5420", () => {
    expect(resolveModelQuery("5420", models)).toEqual({
      status: "unique",
      model: "Dell Latitude 5420",
      matches: ["Dell Latitude 5420"],
    });
  });

  it("accepteert ook fabrikant en serie zonder exacte schrijfwijze", () => {
    expect(resolveModelQuery("latitude5420", models)).toMatchObject({
      status: "unique",
      model: "Dell Latitude 5420",
    });
  });

  it("toont een keuze wanneer een kort nummer meerdere modellen raakt", () => {
    const result = resolveModelQuery("G7", models);
    expect(result.status).toBe("multiple");
    expect(result.matches).toEqual(["HP EliteBook 850 G7", "HP ZBook Fury 15 G7"]);
  });

  it("raadt niets bij een onbekend nummer", () => {
    expect(resolveModelQuery("9999", models).status).toBe("none");
  });
});

describe("verkoopwaarde-klassen", () => {
  it("plaatst 200–299 volledig onder de standaardgrens", () => {
    const band = getSaleValueBand("200_299");
    expect(classifyValueBand(band, 300)).toBe("below");
    expect(policyValueForBand(band, 300)).toBe(299);
  });

  it("plaatst 300–399 volledig in de premiumroute", () => {
    const band = getSaleValueBand("300_399");
    expect(classifyValueBand(band, 300)).toBe("premium");
    expect(policyValueForBand(band, 300)).toBe(300);
  });

  it("blokkeert stil gokken wanneer management een grens midden in een klasse zet", () => {
    expect(classifyValueBand(getSaleValueBand("300_399"), 350)).toBe("overlap");
  });
});
