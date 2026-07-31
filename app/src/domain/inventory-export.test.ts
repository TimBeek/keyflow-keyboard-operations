import { describe, expect, it } from "vitest";
import { inventoryCatalog } from "../data/inventory-catalog";
import { createInventoryCsv } from "./inventory-export";

describe("voorraad-CSV-export", () => {
  it("exporteert alle hangmappen met actuele aantallen", () => {
    const csv = createInventoryCsv(inventoryCatalog, { NB10172E1NL: 24 });
    const lines = csv.trim().split("\r\n");

    expect(lines).toHaveLength(149);
    expect(lines[0]).toContain('"Hangmap";"Model";"Artikelnummer"');
    expect(lines.find((line) => line.startsWith("75;"))).toContain('"NB10172E1NL";"QWERTY US";24');
  });

  it("vertelt in de export welk nummer we zelf hebben toegekend", () => {
    // Hangmap 63 heeft geen nummer van Noviply. De map is gewoon bruikbaar,
    // maar wie de export leest moet zien dat het nummer van ons komt.
    const csv = createInventoryCsv(inventoryCatalog, {});
    const regel = csv.split("\r\n").find((line) => line.startsWith("63;"));

    expect(regel).toContain('"RM00063E1NL"');
    expect(regel).toContain("zelf toegekend");
  });

  it("neutraliseert spreadsheetformules in tekstvelden", () => {
    const csv = createInventoryCsv([
      {
        ...inventoryCatalog[0],
        model: "=HYPERLINK(\"https://example.invalid\")",
      },
    ], {});

    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
  });
});
