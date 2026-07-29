import { describe, expect, it } from "vitest";
import { inventoryCatalog } from "../data/inventory-catalog";
import {
  calculateAbcAnalysis,
  extractStickerCountry,
  extractStickerVariant,
  findNoviplySku,
  layoutWithCountry,
  type InventoryTransactionEntry,
} from "./operations";

describe("Land van de sticker", () => {
  it("leest de landcode achteraan het artikelnummer", () => {
    expect(extractStickerCountry("NB10052E1NL")).toBe("NL");
    expect(extractStickerCountry("NB10043E1DE")).toBe("DE");
    expect(extractStickerCountry("NB10077E2FR")).toBe("FR");
  });

  it("geeft niets terug bij lege of onbruikbare importregels", () => {
    expect(extractStickerCountry("")).toBe("");
    expect(extractStickerCountry(",,,,,,,,,,")).toBe("");
  });

  it("vult QWERTY US aan met het land, want die layout noemt het niet zelf", () => {
    expect(layoutWithCountry("QWERTY US", "NB10052E1NL")).toBe("QWERTY US NL");
  });

  it("herhaalt het land niet als de layout het al noemt", () => {
    expect(layoutWithCountry("QWERTZ DE", "NB10043E1DE")).toBe("QWERTZ DE");
    expect(layoutWithCountry("AZERTY FR", "NB10077E2FR")).toBe("AZERTY FR");
  });

  it("laat de layout ongemoeid zonder bruikbaar artikelnummer", () => {
    expect(layoutWithCountry("QWERTY US", "")).toBe("QWERTY US");
  });
});

describe("Noviply SKU matching", () => {
  it("vindt het exacte stickernummer en behoudt de E-variant", () => {
    const match = findNoviplySku("Dell Latitude 7400", "QWERTY US", inventoryCatalog, {});

    expect(match.status).toBe("matched");
    if (match.status === "matched") {
      expect(match.item.sku).toBe("NB10052E1NL");
      expect(match.variant).toBe("E1");
      expect(match.currentStock).toBe(15);
      expect(match.item.storageNumber).toBe(1);
    }
  });

  it("meldt expliciet wanneer de exacte SKU niet op voorraad is", () => {
    const match = findNoviplySku(
      "Dell Latitude 7400",
      "QWERTY US",
      inventoryCatalog,
      { NB10052E1NL: 0 },
    );

    expect(match.status).toBe("out_of_stock");
  });

  it("raadt geen SKU wanneer model en layout niet exact zijn gevonden", () => {
    expect(findNoviplySku("Onbekend model", "QWERTY US", inventoryCatalog, {}).status).toBe("not_found");
  });

  it("leest ook E2 als afzonderlijke stickeruitvoering", () => {
    expect(extractStickerVariant("NB10200E2NL")).toBe("E2");
  });

  it("verwijst de Dell Latitude 5420 QWERTY US naar hangmap 75", () => {
    const match = findNoviplySku("Dell Latitude 5420", "QWERTY US", inventoryCatalog, {});

    expect(match.status).toBe("matched");
    if (match.status === "matched") {
      expect(match.item.sku).toBe("NB10172E1NL");
      expect(match.item.storageNumber).toBe(75);
      expect(match.variant).toBe("E1");
    }
  });
});

describe("ABC-analyse", () => {
  it("classificeert de hoogste uitgaande voorraadwaarde als hardloper", () => {
    const transactions: InventoryTransactionEntry[] = [
      entry("NB10052E1NL", -100),
      entry("NB10056E1NL", -10),
      entry("NB10057E1NL", -1),
    ];

    const rows = calculateAbcAnalysis(inventoryCatalog.slice(0, 3), transactions, {
      abcAThreshold: 80,
      abcBThreshold: 95,
    });

    expect(rows[0].sku).toBe("NB10052E1NL");
    expect(rows[0].abcClass).toBe("A");
    expect(rows[0].velocity).toBe("Hardloper");
    expect(rows.at(-1)?.abcClass).toBe("C");
  });
});

function entry(sku: string, quantityDelta: number): InventoryTransactionEntry {
  return {
    id: `${sku}-${quantityDelta}`,
    occurredAt: "2026-07-27T08:00:00.000Z",
    sku,
    model: "Testmodel",
    layout: "QWERTY US",
    type: quantityDelta < 0 ? "issue" : "receipt",
    quantityDelta,
    reasonCode: "test",
    actor: "Test",
  };
}
