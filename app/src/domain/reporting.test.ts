import { describe, expect, it } from "vitest";
import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import type { ConversionLogEntry } from "./conversion-log";
import type { ConversionMethodId } from "./conversion-policy";
import type { InventoryTransactionEntry, OperationalMethodId } from "./operations";
import {
  bucketConversionDays,
  consumptionTrend,
  conversionTotals,
  conversionsPerDay,
  dayKey,
  daysBetween,
  historyDepthDays,
  importedBaselineUnits,
  methodShares,
  moverRanking,
  periodWindow,
  shiftDayKey,
} from "./reporting";

const today = "2026-07-29";

/** Lokale tijd zonder Z: dan valt de dag niet om door de tijdzone van de runner. */
function conversion(
  day: string,
  method: ConversionMethodId,
  overrides: Partial<ConversionLogEntry> = {},
): ConversionLogEntry {
  return {
    id: `${day}-${method}-${overrides.id ?? "1"}`,
    occurredAt: `${day}T10:00:00`,
    method,
    status: "completed",
    model: "Dell Latitude 5420",
    targetLayout: "AZERTY FR",
    variant: "E1",
    sku: "",
    storageNumber: null,
    orderReference: "",
    actor: "Medewerker",
    ...overrides,
  };
}

function issue(
  day: string,
  units: number,
  overrides: Partial<InventoryTransactionEntry> = {},
): InventoryTransactionEntry {
  return {
    id: `${day}-${units}-${overrides.id ?? "1"}`,
    occurredAt: `${day}T10:00:00`,
    catalogKey: "hangmap-1",
    storageNumber: 1,
    sku: "NB10052E1NL",
    model: "Dell Latitude 5420",
    layout: "QWERTY US",
    type: "issue",
    quantityDelta: -units,
    reasonCode: "conversion_usage",
    actor: "Medewerker",
    ...overrides,
  };
}

const catalogItem = {
  catalogKey: "hangmap-1",
  storageNumber: 1,
  sku: "NB10052E1NL",
  model: "Dell Latitude 5420",
  layout: "QWERTY US",
  dataQuality: "ready",
  modelAliases: [],
  dataQualityIssues: [],
} as unknown as InventoryCatalogItem;

describe("dagsleutels", () => {
  it("telt dagen vooruit en terug over een maandgrens heen", () => {
    expect(shiftDayKey("2026-08-01", -2)).toBe("2026-07-30");
    expect(shiftDayKey("2026-07-29", 3)).toBe("2026-08-01");
    expect(daysBetween("2026-07-29", "2026-08-01")).toBe(3);
  });

  it("geeft een lege sleutel bij een onleesbare datum", () => {
    expect(dayKey("geen datum")).toBe("");
  });
});

describe("periodWindow", () => {
  it("legt de vorige periode direct tegen de huidige aan", () => {
    const window = periodWindow(7, today);

    expect(window.current).toEqual({ start: "2026-07-23", end: "2026-07-29" });
    expect(window.previous).toEqual({ start: "2026-07-16", end: "2026-07-22" });
  });
});

describe("conversionsPerDay", () => {
  it("houdt dagen zonder werk in de reeks, zodat het verloop klopt", () => {
    const days = conversionsPerDay([conversion("2026-07-29", "noviply_sheet")], 7, today);

    expect(days).toHaveLength(7);
    expect(days[0].day).toBe("2026-07-23");
    expect(days[0].total).toBe(0);
    expect(days[6].total).toBe(1);
    expect(days[6].byMethod.noviply_sheet).toBe(1);
  });

  it("telt conversies van buiten de periode niet mee", () => {
    const days = conversionsPerDay([conversion("2026-07-01", "noviply_sheet")], 7, today);

    expect(days.every((day) => day.total === 0)).toBe(true);
  });
});

describe("bucketConversionDays", () => {
  it("vat dagen samen zodra er meer kolommen zijn dan leesbaar", () => {
    const days = conversionsPerDay(
      [conversion("2026-07-29", "noviply_sheet"), conversion("2026-07-28", "direct_reprint")],
      28,
      today,
    );
    const buckets = bucketConversionDays(days, 7);

    expect(buckets).toHaveLength(7);
    expect(buckets.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(2);
    expect(buckets[6].byMethod.noviply_sheet).toBe(1);
    expect(buckets[6].byMethod.direct_reprint).toBe(1);
  });

  it("laat dagen ongemoeid als ze al passen", () => {
    const days = conversionsPerDay([], 7, today);

    expect(bucketConversionDays(days, 26).every((bucket) => bucket.dayCount === 1)).toBe(true);
  });
});

describe("conversionTotals", () => {
  const entries = [
    conversion("2026-07-29", "noviply_sheet"),
    conversion("2026-07-29", "loose_stickers", { id: "2" }),
    conversion("2026-07-28", "printed_sticker", { status: "awaiting_print" }),
    conversion("2026-07-20", "noviply_sheet", { id: "3" }),
  ];

  it("vergelijkt met de vorige periode van gelijke lengte", () => {
    const totals = conversionTotals(entries, 7, today);

    expect(totals.current).toBe(3);
    expect(totals.previous).toBe(1);
    expect(totals.delta).toBe(2);
    expect(totals.deltaPercentage).toBe(200);
  });

  it("middelt over gewerkte dagen, niet over weekenden", () => {
    const totals = conversionTotals(entries, 7, today);

    expect(totals.activeDays).toBe(2);
    expect(totals.perActiveDay).toBeCloseTo(1.5);
  });

  it("houdt wachten op Noviply apart van afgerond", () => {
    const totals = conversionTotals(entries, 7, today);

    expect(totals.completed).toBe(2);
    expect(totals.awaitingPrint).toBe(1);
  });

  it("geeft geen percentage als er niets was om mee te vergelijken", () => {
    const totals = conversionTotals([conversion("2026-07-29", "noviply_sheet")], 7, today);

    expect(totals.previous).toBe(0);
    expect(totals.deltaPercentage).toBeNull();
  });
});

describe("methodShares", () => {
  it("geeft elk van de vier oplossingen terug, ook zonder gebruik", () => {
    const shares = methodShares([conversion("2026-07-29", "noviply_sheet")], 7, today);

    expect(shares).toHaveLength(4);
    expect(shares.find((row) => row.method === "noviply_sheet")?.share).toBe(100);
    expect(shares.find((row) => row.method === "direct_reprint")?.share).toBe(0);
  });

  it("zet het aandeel af tegen de vorige periode", () => {
    const shares = methodShares([
      conversion("2026-07-29", "noviply_sheet"),
      conversion("2026-07-20", "noviply_sheet", { id: "2" }),
      conversion("2026-07-20", "noviply_sheet", { id: "3" }),
    ], 7, today);
    const sheet = shares.find((row) => row.method === "noviply_sheet");

    expect(sheet?.current).toBe(1);
    expect(sheet?.previous).toBe(2);
    expect(sheet?.delta).toBe(-1);
  });
});

describe("consumptionTrend", () => {
  it("telt alleen uitgiftes en vergelijkt met de vorige periode", () => {
    const trend = consumptionTrend([
      issue("2026-07-29", 5),
      issue("2026-07-20", 4, { id: "2" }),
      issue("2026-07-28", 10, { id: "3", type: "receipt", quantityDelta: 10 }),
    ], 7, today);

    expect(trend.current).toBe(5);
    expect(trend.previous).toBe(4);
    expect(trend.deltaPercentage).toBeCloseTo(25);
  });

  it("negeert de samengevoegde beginstand uit de import", () => {
    const trend = consumptionTrend([
      issue("2026-07-29", 5),
      issue("2026-07-28", 400, { id: "baseline", aggregated: true }),
    ], 7, today);

    expect(trend.current).toBe(5);
  });
});

describe("moverRanking", () => {
  it("berekent hoe lang de voorraad bij dit tempo meegaat", () => {
    // Vier weken meten: 28 vellen in 28 dagen is 7 per week, en bij 14 op
    // voorraad gaat dat twee weken mee.
    const vierWeken = Array.from({ length: 28 }, (_, index) =>
      issue(`2026-07-${String(2 + index).padStart(2, "0")}`, 1, { id: `d${index}` }));
    const [row] = moverRanking(vierWeken, [catalogItem], { "hangmap-1": 14 }, 28, "2026-07-29");

    expect(row.used).toBe(28);
    expect(row.stock).toBe(14);
    // 28 vellen over 27 gemeten dagen is 7,26 per week; 14 op voorraad gaat
    // daarmee 1,93 week mee.
    expect(row.weeksOfStock).toBeCloseTo(1.93, 1);
  });

  it("zegt niets over dekking zolang er te kort gemeten is", () => {
    // Vier vellen op één dag zeggen niets over een week. Eerder kwam hier
    // "twee weken toereikend" uit, en op de knop van drie maanden ineens
    // zesentwintig — hetzelfde vel, een ander antwoord.
    const [row] = moverRanking([issue("2026-07-29", 4)], [catalogItem], { "hangmap-1": 8 }, 7, today);

    expect(row.used).toBe(4);
    expect(row.weeksOfStock).toBeNull();
  });

  it("geeft hetzelfde antwoord welke periode je ook kiest", () => {
    const vierWeken = Array.from({ length: 28 }, (_, index) =>
      issue(`2026-07-${String(2 + index).padStart(2, "0")}`, 1, { id: `d${index}` }));
    const dekking = [7, 28, 90].map((dagen) =>
      moverRanking(vierWeken, [catalogItem], { "hangmap-1": 14 }, dagen, "2026-07-29")[0].weeksOfStock ?? 0);

    // Eerder gaf dezelfde hangmap 6,7 / 26,7 / 86,7 weken — dertien keer
    // verschil op één weergavekeuze. Nu liggen ze binnen een tiende van elkaar.
    expect(Math.max(...dekking) / Math.min(...dekking)).toBeLessThan(1.1);
  });

  it("telt het inladen van de bronlijst niet mee als verbruik", () => {
    const [row] = moverRanking(
      [issue("2026-07-29", 400, { reasonCode: "production_source_bootstrap" })],
      [catalogItem],
      { "hangmap-1": 8 },
      7,
      today,
    );

    expect(row.used).toBe(0);
  });

  it("laat de dekking leeg wanneer er niets is verbruikt", () => {
    const [row] = moverRanking([], [catalogItem], { "hangmap-1": 8 }, 7, today);

    expect(row.used).toBe(0);
    expect(row.weeksOfStock).toBeNull();
  });

  it("zet stijging en daling tegenover elkaar", () => {
    const [row] = moverRanking(
      [issue("2026-07-29", 4), issue("2026-07-20", 6, { id: "2" })],
      [catalogItem],
      {},
      7,
      today,
    );

    expect(row.previousUsed).toBe(6);
    expect(row.delta).toBe(-2);
  });
});

describe("historie", () => {
  it("meet hoeveel dagen er zijn opgebouwd", () => {
    expect(historyDepthDays([conversion("2026-07-22", "noviply_sheet")], today)).toBe(7);
    expect(historyDepthDays([], today)).toBe(0);
  });

  it("toont de beginstand uit de import apart", () => {
    expect(importedBaselineUnits([
      issue("2026-07-28", 400, { id: "baseline", aggregated: true }),
      issue("2026-07-29", 5),
    ])).toBe(400);
  });
});

describe("Een laptop waarvan het toetsenbord al goed was", () => {
  it("telt mee als afgehandeld werk", () => {
    // Er gaat geen vel op, maar de laptop is wel door de handen gegaan. Viel
    // hij buiten de telling, dan lijkt er minder gedaan dan er is.
    const entries = [
      conversion("2026-07-29", "none"),
      conversion("2026-07-29", "noviply_sheet", { id: "2" }),
    ];

    const totalen = conversionTotals(entries, 7, today);

    expect(totalen.current).toBe(2);
  });
});
