import { describe, expect, it } from "vitest";
import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import { defaultMoverWindowDays, fastMovers, weeksOfCover } from "./fast-movers";
import type { InventoryTransactionEntry } from "./operations";

const nu = new Date("2026-08-07T12:00:00.000Z");
const geleden = (dagen: number) =>
  new Date(nu.getTime() - dagen * 24 * 60 * 60 * 1000).toISOString();

function vel(over: Partial<InventoryCatalogItem> = {}): InventoryCatalogItem {
  return {
    catalogKey: "hangmap-075",
    storageNumber: 75,
    sku: "NB10172E1NL",
    stockKey: "NB10172E1NL",
    model: "Dell Latitude 5420",
    layout: "QWERTY US",
    dataQuality: "ready",
    unitCost: 2.35,
    ...over,
  } as unknown as InventoryCatalogItem;
}

function boeking(over: Partial<InventoryTransactionEntry> = {}): InventoryTransactionEntry {
  return {
    id: "t1",
    occurredAt: geleden(2),
    catalogKey: "hangmap-075",
    sku: "NB10172E1NL",
    type: "issue",
    reasonCode: "conversion_usage",
    quantityDelta: -1,
    ...over,
  } as unknown as InventoryTransactionEntry;
}

describe("hardlopers voor Noviply", () => {
  it("telt wat er echt is verbruikt", () => {
    const uit = fastMovers([vel()], [boeking(), boeking({ id: "t2" })], { "hangmap-075": 10 }, nu);
    expect(uit).toHaveLength(1);
    expect(uit[0].used).toBe(2);
    expect(uit[0].stock).toBe(10);
  });

  it("laat het inlezen van de bronlijst buiten beschouwing", () => {
    // Anders wordt een leeggeboekte hangmap de grootste hardloper van de lijst.
    const uit = fastMovers([vel()], [boeking({ reasonCode: "correction" })], {}, nu);
    expect(uit).toEqual([]);
  });

  it("kijkt niet verder terug dan het venster", () => {
    const uit = fastMovers([vel()], [boeking({ occurredAt: geleden(45) })], {}, nu);
    expect(uit).toEqual([]);
  });

  it("laat vellen weg waar niets mee is gebeurd", () => {
    // Een lijst van honderdveertig regels waarvan er tien iets zeggen, leest
    // niemand.
    const uit = fastMovers([vel(), vel({ catalogKey: "hangmap-100", storageNumber: 100 })], [boeking()], {}, nu);
    expect(uit.map((r) => r.storageNumber)).toEqual([75]);
  });

  it("zet het hardst lopende bovenaan", () => {
    const uit = fastMovers(
      [vel(), vel({ catalogKey: "b", storageNumber: 100, sku: "NB2" })],
      [boeking(), boeking({ id: "t2" }), boeking({ id: "t3", catalogKey: "b", sku: "NB2" })],
      {}, nu,
    );
    expect(uit.map((r) => r.storageNumber)).toEqual([75, 100]);
  });

  it("zet bij gelijk verbruik het krapste bovenaan", () => {
    // Daar loop je het eerst tegenaan.
    const uit = fastMovers(
      [vel(), vel({ catalogKey: "b", storageNumber: 100, sku: "NB2" })],
      [boeking(), boeking({ id: "t2", catalogKey: "b", sku: "NB2" })],
      { "hangmap-075": 40, b: 3 }, nu,
    );
    expect(uit.map((r) => r.storageNumber)).toEqual([100, 75]);
  });

  it("houdt de lijst kort", () => {
    const catalogus = Array.from({ length: 30 }, (_, i) =>
      vel({ catalogKey: `k${i}`, storageNumber: i + 1, sku: `NB${i}` }));
    const boekingen = catalogus.map((c, i) =>
      boeking({ id: `t${i}`, catalogKey: c.catalogKey, sku: c.sku }));
    expect(fastMovers(catalogus, boekingen, {}, nu, defaultMoverWindowDays, 10)).toHaveLength(10);
  });
});

describe("hoe lang de voorraad nog meegaat", () => {
  it("rekent het verbruik om naar weken", () => {
    // 30 stuks in 30 dagen is 7 per week; 14 op voorraad is twee weken.
    const weken = weeksOfCover({ used: 30, stock: 14 } as never, 30);
    expect(weken).toBeCloseTo(2, 5);
  });

  it("zegt niets als er niets verbruikt is", () => {
    // Liever niets dan een verzonnen oneindig.
    expect(weeksOfCover({ used: 0, stock: 20 } as never, 30)).toBeNull();
  });
});
