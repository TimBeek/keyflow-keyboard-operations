import { describe, expect, it } from "vitest";
import {
  layoutsFor,
  matchDirectPrintProduct,
  parseDirectPrintCatalogue,
  parseVariantLine,
} from "./direct-print-catalogue";

/** Een stuk van de echte lijst, ongewijzigd overgenomen. */
const sample = `List of products present in system
#50 - Acer
TravelMate P214 (Laptop)
SK-CZ - Backlit - No trackpoint
UK-ENG - Normal - No trackpoint
NL - Backlit - No trackpoint
NL - Normal - No trackpoint
#51 - Lenovo
ThinkPad T480 A485 (Laptop)
US-to-NL - Backlit - Trackpoint
BE - Normal - Trackpoint
TR - Backlit - Trackpoint
LOQ 15IRX9 (Palmrest)
ThinkPad Yoga 11E G6 (Type 2) (Laptop)
NL (Version 2) - Normal - No trackpoint
PT - Normal - No trackpoint`;

describe("parseVariantLine", () => {
  it("leest taal, verlichting en trackpoint", () => {
    expect(parseVariantLine("DE - Backlit - Trackpoint")).toMatchObject({
      keyflowLayout: "QWERTZ DE",
      backlit: true,
      trackpoint: true,
    });
  });

  it("leest 'No trackpoint' niet als trackpoint", () => {
    // "No trackpoint" bevat het woord trackpoint; daar mag het niet op vallen.
    expect(parseVariantLine("NL - Normal - No trackpoint")).toMatchObject({
      trackpoint: false,
      backlit: false,
    });
  });

  it("begrijpt dat US-to-NL naar Nederlands gaat, niet naar Amerikaans", () => {
    expect(parseVariantLine("US-to-NL - Backlit - Trackpoint")).toMatchObject({
      keyflowLayout: "QWERTY NL",
      convertsFrom: "QWERTY US",
    });
  });

  it("vat versienummers en varianten samen onder dezelfde taal", () => {
    expect(parseVariantLine("NL (Version 2) - Normal - No trackpoint")?.keyflowLayout)
      .toBe("QWERTY NL");
    expect(parseVariantLine("US-to-PT-C (<>) - Normal - Trackpoint")?.keyflowLayout)
      .toBe("QWERTY PT");
  });

  it("laat een taal die wij niet verkopen leeg in plaats van te gokken", () => {
    expect(parseVariantLine("HU - Normal - Trackpoint")?.keyflowLayout).toBe("");
    expect(parseVariantLine("SK-CZ - Normal - Trackpoint")?.keyflowLayout).toBe("");
  });

  it("herkent een modelnaam niet als variant", () => {
    expect(parseVariantLine("ThinkPad T480 A485 (Laptop)")).toBeNull();
    expect(parseVariantLine("TravelMate P214")).toBeNull();
  });
});

describe("parseDirectPrintCatalogue", () => {
  const products = parseDirectPrintCatalogue(sample);

  it("koppelt elk model aan de fabrikant erboven", () => {
    expect(products.find((p) => p.sourceName.startsWith("TravelMate"))?.manufacturer)
      .toBe("Acer");
    expect(products.find((p) => p.sourceName.startsWith("ThinkPad T480"))?.manufacturer)
      .toBe("Lenovo");
  });

  it("leest de bouwvorm uit de naam", () => {
    expect(products.find((p) => p.sourceName.startsWith("LOQ"))?.formFactor)
      .toBe("Palmrest");
  });

  it("houdt een model zonder varianten: dat betekent 'kennen we, kunnen we niets'", () => {
    const loq = products.find((p) => p.sourceName.startsWith("LOQ"));

    expect(loq).toBeDefined();
    expect(loq?.variants).toHaveLength(0);
  });

  it("geeft per model onze eigen layouts terug, zonder dubbelen", () => {
    const travelmate = products.find((p) => p.sourceName.startsWith("TravelMate"))!;

    // SK-CZ kennen wij niet; NL staat er twee keer maar telt één keer.
    expect(layoutsFor(travelmate)).toEqual(["QWERTY UK", "QWERTY NL"]);
  });

  it("laat een model dat wij niet in die taal kunnen ook echt niet toe", () => {
    const t480 = products.find((p) => p.sourceName.startsWith("ThinkPad T480"))!;

    expect(layoutsFor(t480)).toContain("QWERTY NL");
    expect(layoutsFor(t480)).toContain("AZERTY BE");
    expect(layoutsFor(t480)).not.toContain("QWERTZ DE");
  });

  it("negeert de koptekst van de lijst", () => {
    expect(products.some((p) => p.sourceName.toLowerCase().includes("list of products")))
      .toBe(false);
  });
});

describe("koppelen aan onze modelnamen", () => {
  const products = parseDirectPrintCatalogue(`#77 - Dell
5320 5420 5430 6220 6230 6320 6420 6430 6440
NL - Normal - Trackpoint
#53 - HP
470 G7 (Palmrest)
IT - Normal - No trackpoint
EliteBook 850 G7 855 G7 850 G8 855 G8
DK - Normal - No trackpoint
#51 - Lenovo
ThinkPad T480 A485 (Laptop)
NL - Backlit - Trackpoint`);

  it("vindt een Dell op het kale modelnummer in een rij nummers", () => {
    const match = matchDirectPrintProduct("Dell Latitude 5420", products);

    expect(match?.matchedOn).toBe("5420");
    expect(layoutsFor(match!.product)).toEqual(["QWERTY NL"]);
  });

  it("koppelt niet op alleen de generatie", () => {
    // "G7" delen de EliteBook 850 en de HP 470 — totaal verschillende toestellen.
    // Daarop matchen zou een taal toestaan die dit toestel niet aankan.
    const match = matchDirectPrintProduct("HP EliteBook 850 G7", products);

    expect(match?.product.sourceName).toContain("EliteBook 850");
    expect(match?.product.sourceName).not.toContain("470");
  });

  it("houdt merken uit elkaar", () => {
    // Zonder merkcontrole zou een Lenovo met nummer 5420 bij de Dell belanden.
    expect(matchDirectPrintProduct("Lenovo ThinkPad 5420", products)).toBeNull();
  });

  it("geeft niets terug voor een naam zonder modelnummer", () => {
    expect(matchDirectPrintProduct("Laptop", products)).toBeNull();
  });
});
