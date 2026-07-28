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

  it("markeert geblokkeerde bronregels in de export", () => {
    const csv = createInventoryCsv(inventoryCatalog, {});

    expect(csv.split("\r\n").find((line) => line.startsWith("63;"))).toContain('"Geblokkeerd"');
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
