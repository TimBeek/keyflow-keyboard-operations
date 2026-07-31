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

describe("QWERTY NL vindt dezelfde hangmappen als QWERTY US", () => {
  it("levert bij QWERTY NL hetzelfde vel op als bij QWERTY US", () => {
    const viaUs = findNoviplySku("Dell Latitude 7400", "QWERTY US", inventoryCatalog, {});
    const viaNl = findNoviplySku("Dell Latitude 7400", "QWERTY NL", inventoryCatalog, {});

    expect(viaUs.status).toBe("matched");
    expect(viaNl.status).toBe("matched");
    if (viaUs.status !== "matched" || viaNl.status !== "matched") return;
    expect(viaNl.item.sku).toBe(viaUs.item.sku);
    expect(viaNl.item.storageNumber).toBe(viaUs.item.storageNumber);
  });
});

describe("Een laptop die in meerdere hangmappen past", () => {
  // De ThinkPad T495 staat bij hangmap 76 (L390) en bij hangmap 100 (L380).
  // Allebei QWERTY US met NL achter het artikelnummer, allebei E1.
  const t495 = "Lenovo ThinkPad T495";

  it("wijst er zelf een aan in plaats van de laptop door te sturen naar de printer", () => {
    const match = findNoviplySku(t495, "QWERTY NL", inventoryCatalog, {}, "E1");

    expect(match.status).toBe("matched");
    if (match.status !== "matched") return;
    expect([76, 100]).toContain(match.item.storageNumber);
    expect(match.alternatives.map((item) => item.storageNumber)).toHaveLength(1);
  });

  it("pakt de map met de meeste vellen, zodat de dunne map niet leegloopt", () => {
    const dun = inventoryCatalog.find((item) => item.storageNumber === 76)!;
    const dik = inventoryCatalog.find((item) => item.storageNumber === 100)!;
    const match = findNoviplySku(t495, "QWERTY NL", inventoryCatalog, {
      [dun.catalogKey]: 3,
      [dik.catalogKey]: 24,
    }, "E1");

    expect(match.status).toBe("matched");
    if (match.status !== "matched") return;
    expect(match.item.storageNumber).toBe(100);
    expect(match.alternatives[0]?.storageNumber).toBe(76);
  });

  it("slaat een lege map over als er een volle naast ligt", () => {
    const leeg = inventoryCatalog.find((item) => item.storageNumber === 100)!;
    const vol = inventoryCatalog.find((item) => item.storageNumber === 76)!;
    const match = findNoviplySku(t495, "QWERTY NL", inventoryCatalog, {
      [leeg.catalogKey]: 0,
      [vol.catalogKey]: 5,
    }, "E1");

    expect(match.status).toBe("matched");
    if (match.status !== "matched") return;
    expect(match.item.storageNumber).toBe(76);
  });

  it("meldt pas uitverkocht als álle mappen leeg zijn", () => {
    const leeg = Object.fromEntries(
      inventoryCatalog.map((item) => [item.catalogKey, 0]),
    );
    const match = findNoviplySku(t495, "QWERTY NL", inventoryCatalog, leeg, "E1");

    expect(match.status).toBe("out_of_stock");
  });

  it("volgt een goedgekeurde foto, ook als die map minder vellen heeft", () => {
    const weinig = inventoryCatalog.find((item) => item.storageNumber === 76)!;
    const veel = inventoryCatalog.find((item) => item.storageNumber === 100)!;
    const match = findNoviplySku(
      t495,
      "QWERTY NL",
      inventoryCatalog,
      { [weinig.catalogKey]: 2, [veel.catalogKey]: 40 },
      "E1",
      (item) => (item.storageNumber === 76 ? "approved" : null),
    );

    expect(match.status).toBe("matched");
    if (match.status !== "matched") return;
    expect(match.item.storageNumber).toBe(76);
  });

  it("mijdt een map die is afgekeurd voor dit model", () => {
    const match = findNoviplySku(
      t495,
      "QWERTY NL",
      inventoryCatalog,
      {},
      "E1",
      (item) => (item.storageNumber === 100 ? "rejected" : null),
    );

    expect(match.status).toBe("matched");
    if (match.status !== "matched") return;
    expect(match.item.storageNumber).toBe(76);
  });

  it("geeft dezelfde laptop morgen hetzelfde antwoord", () => {
    const eerste = findNoviplySku(t495, "QWERTY NL", inventoryCatalog, {}, "E1");
    const tweede = findNoviplySku(t495, "QWERTY NL", inventoryCatalog, {}, "E1");

    expect(JSON.stringify(eerste)).toBe(JSON.stringify(tweede));
  });
});

describe("Entervorm van de medewerker", () => {
  it("laat het vel zien wanneer de gekozen entervorm klopt", () => {
    const match = findNoviplySku("Dell Latitude 7400", "QWERTY US", inventoryCatalog, {}, "E1");

    expect(match.status).toBe("matched");
    if (match.status !== "matched") return;
    expect(match.variant).toBe("E1");
  });

  it("geeft nooit stilzwijgend de andere entervorm terug", () => {
    const match = findNoviplySku("Dell Latitude 7400", "QWERTY US", inventoryCatalog, {}, "E2");

    expect(match.status).toBe("other_variant");
    if (match.status !== "other_variant") return;
    expect(match.availableVariants).toEqual(["E1"]);
  });

  it("zoekt alleen op model wanneer de medewerker het niet weet", () => {
    const match = findNoviplySku("Dell Latitude 7400", "QWERTY US", inventoryCatalog, {}, "");

    expect(match.status).toBe("matched");
  });
});

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
    const match = findNoviplySku("Dell Latitude 5420", "QWERTY US", inventoryCatalog, {});

    expect(match.status).toBe("matched");
    if (match.status === "matched") {
      expect(match.item.sku).toBe("NB10172E1NL");
      expect(match.variant).toBe("E1");
      expect(match.item.storageNumber).toBe(75);
    }
  });

  it("meldt expliciet wanneer de exacte SKU niet op voorraad is", () => {
    const leeg = Object.fromEntries(inventoryCatalog.map((item) => [item.catalogKey, 0]));
    const match = findNoviplySku("Dell Latitude 5420", "QWERTY US", inventoryCatalog, leeg);

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
