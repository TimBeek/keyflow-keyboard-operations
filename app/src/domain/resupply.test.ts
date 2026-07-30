import { describe, expect, it } from "vitest";
import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import type { InventoryTransactionEntry } from "./operations";
import {
  calculateResupplyLevel,
  measuredHistoryDays,
  minimumHistoryDays,
  resupplyLeadTimeDays,
  resupplyReady,
  resupplySafetyStockWeeks,
} from "./resupply";

const today = "2026-07-29";

const item = {
  catalogKey: "hangmap-075",
  storageNumber: 75,
  sku: "NB10172E1NL",
  model: "Dell Latitude 5420",
  layout: "QWERTY US",
  dataQuality: "ready",
} as unknown as InventoryCatalogItem;

function issue(day: string, units: number, extra: Partial<InventoryTransactionEntry> = {}) {
  return {
    id: `${day}-${units}-${extra.id ?? ""}`,
    occurredAt: `${day}T10:00:00`,
    catalogKey: "hangmap-075",
    storageNumber: 75,
    sku: "NB10172E1NL",
    model: "Dell Latitude 5420",
    layout: "QWERTY US",
    type: "issue",
    quantityDelta: -units,
    reasonCode: "conversion_usage",
    actor: "Medewerker",
    ...extra,
  } as InventoryTransactionEntry;
}

describe("measuredHistoryDays", () => {
  it("telt vanaf de oudste echte boeking", () => {
    expect(measuredHistoryDays([issue("2026-07-01", 1)], today)).toBe(28);
  });

  it("telt de samengevoegde importregel niet mee", () => {
    expect(measuredHistoryDays(
      [issue("2026-01-01", 400, { id: "baseline", aggregated: true })],
      today,
    )).toBe(0);
  });
});

describe("resupplyReady", () => {
  it("houdt bijbestellen dicht zolang er niets te meten valt", () => {
    // Zonder dit zou Noviply bij de start 139 regels "geen minimum" zien; dat
    // leest als een storing in plaats van als "we zijn net begonnen".
    expect(resupplyReady([], today)).toBe(false);
    expect(resupplyReady([issue("2026-07-28", 3)], today)).toBe(false);
  });

  it("gaat vanzelf open zodra er genoeg dagen gewerkt is", () => {
    const eersteDag = "2026-07-01";

    expect(measuredHistoryDays([issue(eersteDag, 3)], today))
      .toBeGreaterThanOrEqual(minimumHistoryDays);
    expect(resupplyReady([issue(eersteDag, 3)], today)).toBe(true);
  });

  it("laat de importregel het niet vroeger openzetten", () => {
    const alleenImport = [issue("2026-01-01", 400, { id: "baseline", aggregated: true })];

    expect(resupplyReady(alleenImport, today)).toBe(false);
  });
});

describe("calculateResupplyLevel", () => {
  it("geeft geen minimum zolang er te weinig gemeten is", () => {
    // Eén drukke dag zou anders het minimum de lucht in jagen.
    const level = calculateResupplyLevel([issue("2026-07-28", 12)], item, 20, today, 1);

    expect(level).toBeNull();
    expect(minimumHistoryDays).toBe(14);
  });

  it("rekent met de langste levertijd plus een week reserve", () => {
    // 28 dagen historie, 40 vellen verbruikt = 10 per week.
    const transactions = [issue("2026-07-05", 20), issue("2026-07-20", 20, { id: "2" })];
    const level = calculateResupplyLevel(transactions, item, 12, today, 28);

    expect(level?.weeklyDemand).toBeCloseTo(10);
    // 10 per week × (14/7 + 1) = 30
    expect(level?.minimum).toBe(
      Math.ceil(10 * (resupplyLeadTimeDays / 7 + resupplySafetyStockWeeks)),
    );
    expect(level?.minimum).toBe(30);
    expect(level?.shortfall).toBe(18);
    expect(level?.weeksOfStock).toBeCloseTo(1.2);
  });

  it("laat het minimum meestijgen met een hangmap die harder gaat lopen", () => {
    const rustig = calculateResupplyLevel([issue("2026-07-10", 14)], item, 50, today, 28);
    const druk = calculateResupplyLevel([issue("2026-07-10", 56)], item, 50, today, 28);

    expect(rustig!.minimum).toBeLessThan(druk!.minimum);
  });

  it("meldt geen tekort wanneer de voorraad ruim genoeg is", () => {
    const level = calculateResupplyLevel([issue("2026-07-10", 40)], item, 200, today, 28);

    expect(level?.shortfall).toBe(0);
  });

  it("geeft geen minimum voor een hangmap waar niets uit gaat", () => {
    const level = calculateResupplyLevel([issue("2026-07-10", 40, {
      catalogKey: "hangmap-001", sku: "NB10052E1NL",
    })], item, 20, today, 28);

    expect(level).toBeNull();
  });

  it("kijkt niet verder terug dan het meetvenster", () => {
    const oud = issue("2026-01-01", 500, { id: "oud" });
    const recent = issue("2026-07-20", 8, { id: "recent" });
    const level = calculateResupplyLevel([oud, recent], item, 20, today, 210);

    // Alleen de laatste acht weken tellen: 8 vellen over 56 dagen = 1 per week.
    expect(level?.weeklyDemand).toBeCloseTo(1);
  });
});
