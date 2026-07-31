import { describe, expect, it } from "vitest";
import {
  inventoryCatalog,
  inventoryCatalogSummary,
  operationalInventoryCatalog,
  planningCatalog,
} from "./inventory-catalog";

describe("volledige Excelvoorraadcatalogus", () => {
  it("bevat elke genummerde hangmap uit de bron, met de voorraad uit de bron", () => {
    expect(inventoryCatalog).toHaveLength(148);
    expect(new Set(inventoryCatalog.map(({ storageNumber }) => storageNumber)).size).toBe(148);
    expect(inventoryCatalog.map(({ storageNumber }) => storageNumber)).toEqual(
      Array.from({ length: 148 }, (_, index) => index + 1),
    );
    expect(inventoryCatalog.reduce((sum, item) => sum + item.stock, 0))
      .toBe(inventoryCatalogSummary.totalQuantity);
  });

  it("legt de gecontroleerde bronherkomst vast", () => {
    // Bewust niet één bestandsnaam: elke nieuwe telling levert een nieuw
    // bestand op, en dan zou deze test omvallen op iets wat juist goed gaat.
    // Wat moet kloppen is dat er een herleidbare bron ís.
    expect(inventoryCatalogSummary.fileName).toMatch(/\.(xlsx|csv)$/i);
    expect(inventoryCatalogSummary.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(inventoryCatalogSummary).toMatchObject({ sheet: "Productie", rowCount: 148 });
  });

  it("laat geen hangmap ongebruikt om een ontbrekend of dubbel artikelnummer", () => {
    // Deze negen mappen bleven vroeger buiten beeld. Samen 177 vellen die de
    // werkvloer niet kreeg, terwijl de laptop dan naar de printer ging.
    expect(operationalInventoryCatalog).toHaveLength(148);
    expect(inventoryCatalogSummary.blockedRows).toBe(0);
  });

  it("kent zelf een nummer toe als de bronlijst er geen heeft", () => {
    expect(inventoryCatalog.find(({ storageNumber }) => storageNumber === 63)).toMatchObject({
      sku: "RM00063E1NL",
      stockKey: "RM00063E1NL",
      ownNumber: true,
      dataQuality: "ready",
    });
  });

  it("houdt het echte nummer op het scherm als twee mappen het delen", () => {
    // Wie bij hangmap 147 staat leest NB10100E1NL, want dat staat op het vel.
    // De voorraad telt wel per map, anders weet je niet welke map leeg raakt.
    const map36 = inventoryCatalog.find(({ storageNumber }) => storageNumber === 36);
    const map147 = inventoryCatalog.find(({ storageNumber }) => storageNumber === 147);

    expect(map36).toMatchObject({ sku: "NB10100E1NL", stockKey: "NB10100E1NL-M36", sharedNumber: true });
    expect(map147).toMatchObject({ sku: "NB10100E1NL", stockKey: "NB10100E1NL-M147", sharedNumber: true });
  });

  it("geeft elke hangmap een eigen voorraadsleutel", () => {
    const sleutels = inventoryCatalog.map(({ stockKey }) => stockKey);

    expect(new Set(sleutels).size).toBe(inventoryCatalog.length);
  });

  it("laat een gewone hangmap ongemoeid", () => {
    expect(inventoryCatalog.find(({ storageNumber }) => storageNumber === 75)).toMatchObject({
      sku: "NB10172E1NL",
      stockKey: "NB10172E1NL",
      ownNumber: false,
      sharedNumber: false,
    });
  });

  it("verzint geen verbruik, levertijd of inkoopprijs", () => {
    // Deze stonden er als voorbeeldwaarden in, tot en met een prijs per vel.
    // Een besteladvies daarop kost geld, dus blijven ze nul tot ze gemeten zijn.
    expect(planningCatalog).toHaveLength(0);
    expect(inventoryCatalog.every((item) =>
      item.averageWeeklyDemand === 0
      && item.leadTimeDays === 0
      && item.safetyStockWeeks === 0
      && item.unitCost === 0
      && item.planningDataStatus === "unconfigured")).toBe(true);
  });

  it("leest de echte bronregels wel gewoon in", () => {
    expect(inventoryCatalog.find(({ storageNumber }) => storageNumber === 75)).toMatchObject({
      model: "Dell Latitude 5420",
      sku: "NB10172E1NL",
      layout: "QWERTY US",
      stock: 25,
    });
  });
});
