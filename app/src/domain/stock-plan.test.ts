import { describe, expect, it } from "vitest";
import {
  byMovement,
  nextSort,
  sortRows,
  confidenceFor,
  defaultStockPolicy,
  fastMovers,
  idleRows,
  measuredDays,
  poissonRange,
  searchRows,
  stockPlan,
  stockSummary,
  toOrder,
  type StockPlanRow,
} from "./stock-plan";
import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import type { InventoryTransactionEntry } from "./operations";

const nu = new Date("2026-08-11T10:00:00.000Z");

function vel(overrides: Partial<InventoryCatalogItem> = {}): InventoryCatalogItem {
  return {
    catalogKey: "k1",
    sourceRow: 1,
    model: "HP EliteBook 840 G8",
    modelAliases: [],
    sku: "NB10052E1NL",
    stockKey: "NB10052E1NL",
    ownNumber: false,
    sharedNumber: false,
    layout: "QWERTY US",
    stock: 0,
    reserved: 0,
    averageWeeklyDemand: 0,
    leadTimeDays: 0,
    safetyStockWeeks: 0,
    location: "Hangmappenwagen",
    storageNumber: 12,
    supplier: "Noviply",
    unitCost: 0,
    compatibleModels: 3,
    dataQuality: "ready",
    dataQualityIssues: [],
    ...overrides,
  } as InventoryCatalogItem;
}

function verbruik(dagenGeleden: number, aantal = 1, catalogKey = "k1"): InventoryTransactionEntry {
  return {
    id: `t${catalogKey}-${dagenGeleden}-${aantal}`,
    sku: "NB10052E1NL",
    catalogKey,
    type: "issue",
    quantityDelta: -aantal,
    reasonCode: "conversion_usage",
    occurredAt: new Date(nu.getTime() - dagenGeleden * 86_400_000).toISOString(),
    actor: "Werkvloer",
  } as InventoryTransactionEntry;
}

/** Eén vel per dag over een aantal dagen. */
function reeks(dagen: number, perDag = 1, catalogKey = "k1") {
  const uit: InventoryTransactionEntry[] = [];
  for (let dag = 1; dag <= dagen; dag += 1) uit.push(verbruik(dag, perDag, catalogKey));
  return uit;
}

function rij(stock: number, transacties: InventoryTransactionEntry[]) {
  return stockPlan([vel()], transacties, { NB10052E1NL: stock }, nu)[0];
}

describe("de band rond een telling", () => {
  it("is breed bij een handvol vellen en smaller bij veel", () => {
    // Van vijf geziene vellen loopt het echte tempo ergens tussen twee en twaalf.
    // Dat is precies waarom er geen decimaal op het scherm hoort.
    const weinig = poissonRange(5);
    expect(weinig.low).toBeGreaterThan(1);
    expect(weinig.low).toBeLessThan(2.5);
    expect(weinig.high).toBeGreaterThan(10);

    const veel = poissonRange(100);
    const breedteWeinig = (weinig.high - weinig.low) / 5;
    const breedteVeel = (veel.high - veel.low) / 100;
    expect(breedteVeel).toBeLessThan(breedteWeinig);
  });

  it("geeft bij nul waarnemingen geen nul-bovengrens", () => {
    // Niets gezien betekent niet dat het nooit gebruikt wordt.
    expect(poissonRange(0).low).toBe(0);
    expect(poissonRange(0).high).toBeGreaterThan(3);
  });

  it("noemt een cijfer pas gemeten als er genoeg vellen onder zitten", () => {
    expect(confidenceFor(0)).toBe("none");
    expect(confidenceFor(2)).toBe("none");
    expect(confidenceFor(5)).toBe("rough");
    expect(confidenceFor(15)).toBe("estimate");
    expect(confidenceFor(40)).toBe("measured");
  });
});

describe("het verbruik omrekenen", () => {
  it("telt alleen echt verbruik, geen bronlijst of tellingcorrectie", () => {
    // Het inlezen van de beginvoorraad maakte ooit van een leeggeboekte
    // hangmap de grootste hardloper van de lijst.
    const administratie = [{
      ...verbruik(1, 2987),
      reasonCode: "production_source_bootstrap",
      type: "receipt",
      quantityDelta: 2987,
    } as InventoryTransactionEntry];
    expect(rij(20, administratie).used).toBe(0);
  });

  it("laat de laatste twee weken dubbel tellen", () => {
    // Het aandeel werk dat via een vel gaat liep in drie weken van 17 naar 100
    // procent. Het hele venster gelijk wegen bestelt te weinig.
    const recentDruk = [...reeks(10, 2), ...reeks(40, 0).slice(0, 0), ...reeks(40).slice(20)];
    const gelijkmatig = reeks(40, 1);
    const a = rij(50, recentDruk);
    const b = rij(50, gelijkmatig);
    expect(a.perWeek).toBeGreaterThan(b.perWeek ?? 0);
  });

  it("deelt niet door acht weken als er pas tien dagen gemeten is", () => {
    // Anders lijkt alles stil te staan zolang de app kort draait.
    const uit = rij(20, reeks(10, 2));
    expect(uit.used).toBe(20);
    // 20 vellen in tien dagen is ruim 10 per week, niet 20/8 = 2,5.
    expect(uit.perWeek).toBeGreaterThan(9);
  });

  it("legt de band om het getal heen, niet ernaast", () => {
    // Hier ging het mis: de band werd door een andere noemer gedeeld dan het
    // puntgetal, en dan staat er "12 per week" met een band van 16 tot 37.
    for (const dagen of [5, 13, 30, 56]) {
      for (const perDag of [1, 2, 5]) {
        const uit = rij(50, reeks(dagen, perDag));
        expect(uit.perWeekLow).toBeLessThanOrEqual(uit.perWeek ?? 0);
        expect(uit.perWeekHigh).toBeGreaterThanOrEqual(uit.perWeek ?? 0);
      }
    }
  });

  it("geeft geen verbruikscijfer als er niets is gebruikt", () => {
    const uit = rij(20, []);
    expect(uit.perWeek).toBeNull();
    expect(uit.used).toBe(0);
    expect(uit.status).toBe("idle");
  });
});

describe("wanneer er besteld moet worden", () => {
  it("zet een lege hangmap bovenaan, ook zonder verbruikscijfer", () => {
    expect(rij(0, []).status).toBe("out");
  });

  it("noemt het kritiek als het leeg is voordat een bestelling binnen kan zijn", () => {
    // Levertijd elf dagen is ruim zeven werkdagen; met twee vellen per dag en
    // vier op voorraad haal je dat niet.
    const uit = rij(4, reeks(14, 2));
    expect(uit.status).toBe("critical");
    expect(uit.suggested).toBeGreaterThan(0);
  });

  it("zet een hangmap onder het bestelpunt op bestellen", () => {
    const uit = rij(20, reeks(14, 1));
    expect(uit.reorderPoint).not.toBeNull();
    expect(uit.stock).toBeLessThanOrEqual(uit.reorderPoint ?? 0);
    expect(uit.status).toBe("order");
  });

  it("laat een ruim gevulde hangmap met rust en stelt niets voor", () => {
    const uit = rij(400, reeks(14, 1));
    expect(uit.status).toBe("ok");
    expect(uit.suggested).toBe(0);
  });

  it("legt een marge boven op het verwachte verbruik tijdens de levertijd", () => {
    // Zonder marge grijp je de helft van de keren mis: het verwachte verbruik
    // is een gemiddelde, en de helft van de tijd ligt het er boven.
    const uit = rij(50, reeks(14, 1));
    const zonderMarge = ((uit.perWeek ?? 0) / 7)
      * (defaultStockPolicy.leadTimeDays + defaultStockPolicy.safetyDays);
    expect(uit.reorderPoint).toBeGreaterThan(zonderMarge);
    // Maar niet het dubbele; dan tel je de onzekerheid twee keer.
    expect(uit.reorderPoint).toBeLessThan(zonderMarge * 2);
  });

  it("houdt het bestelniveau in verhouding tot het weekverbruik", () => {
    // Zeven vellen per week hoort geen voorraad van drie maanden op te leveren.
    const uit = rij(50, reeks(14, 1));
    const wekenDekking = (uit.orderUpTo ?? 0) / (uit.perWeek ?? 1);
    expect(wekenDekking).toBeGreaterThan(3);
    expect(wekenDekking).toBeLessThan(7);
  });

  it("vult aan tot boven het bestelpunt, niet tot precies het bestelpunt", () => {
    // Bestel je tot het bestelpunt, dan sta je bij het eerstvolgende vel weer
    // onder de grens.
    const uit = rij(1, reeks(14, 2));
    expect(uit.orderUpTo).toBeGreaterThan(uit.reorderPoint ?? 0);
    expect(uit.suggested).toBe((uit.orderUpTo ?? 0) - 1);
  });

  it("zegt over hoeveel werkdagen er uiterlijk besteld moet zijn", () => {
    const uit = rij(60, reeks(14, 1));
    expect(uit.orderWithinDays).not.toBeNull();
    expect(uit.orderWithinDays).toBeGreaterThan(0);
    expect(uit.workingDaysLeft).toBeGreaterThan(uit.orderWithinDays ?? 0);
  });

  it("geeft een negatieve besteltermijn als het al te laat is", () => {
    const uit = rij(5, reeks(14, 2));
    expect(uit.orderWithinDays).toBeLessThanOrEqual(0);
  });
});

describe("de lijsten", () => {
  const rijen = [
    { catalogKey: "a", storageNumber: 1, used: 40, stock: 0, suggested: 30, status: "out", orderWithinDays: -5 },
    { catalogKey: "b", storageNumber: 2, used: 20, stock: 2, suggested: 18, status: "critical", orderWithinDays: -1 },
    { catalogKey: "c", storageNumber: 3, used: 10, stock: 9, suggested: 6, status: "order", orderWithinDays: 2 },
    { catalogKey: "d", storageNumber: 4, used: 5, stock: 40, suggested: 0, status: "watch", orderWithinDays: 12 },
    { catalogKey: "e", storageNumber: 5, used: 0, stock: 86, suggested: 0, status: "idle", orderWithinDays: null },
    { catalogKey: "f", storageNumber: 6, used: 0, stock: 12, suggested: 0, status: "idle", orderWithinDays: null },
    { catalogKey: "g", storageNumber: 7, used: 0, stock: 0, suggested: 0, status: "out", orderWithinDays: null },
  ] as StockPlanRow[];

  it("zet op de bestellijst alleen wat echt besteld moet worden", () => {
    expect(toOrder(rijen).map((r) => r.catalogKey)).toEqual(["a", "g", "b", "c"]);
  });

  it("laat een lege hangmap zonder verbruikscijfer toch zien", () => {
    // We weten niet hoeveel er moet komen, maar leeg is leeg. Hem weglaten
    // omdat er geen getal is, is precies hoe je een gat overslaat.
    expect(toOrder(rijen).some((r) => r.catalogKey === "g")).toBe(true);
  });

  it("zet daar de meeste haast bovenaan", () => {
    expect(toOrder(rijen)[0].catalogKey).toBe("a");
  });

  it("laat stilstaande voorraad niet op de bestellijst komen", () => {
    // 112 hangmappen zonder verbruik zouden de zes regels die ertoe doen
    // onzichtbaar maken.
    expect(toOrder(rijen).some((r) => r.status === "idle")).toBe(false);
  });

  it("deelt de hardlopers in naar hun aandeel, niet naar hun plek op de lijst", () => {
    const movers = fastMovers(rijen);
    expect(movers.map((m) => m.catalogKey)).toEqual(["a", "b", "c", "d"]);
    expect(movers[0].klasse).toBe("A");
    expect(movers[0].share).toBeCloseTo(40 / 75, 3);
    expect(movers[movers.length - 1].cumulative).toBeCloseTo(1, 6);
  });

  it("legt de streep op wat er vóór een vel al is opgeteld", () => {
    // Dezelfde regel als calculateAbcAnalysis elders in de app. Met de andere
    // lezing — kijken naar het totaal inclusief het vel zelf — kan hetzelfde
    // vel op twee schermen in twee verschillende klassen vallen.
    const movers = fastMovers(rijen);
    expect(movers.map((m) => m.klasse)).toEqual(["A", "A", "B", "B"]);
    // c staat op precies 80% cumulatief vóór zichzelf, en valt daarmee buiten A.
    expect(movers.find((m) => m.catalogKey === "c")?.klasse).toBe("B");
  });

  it("zet alles in C zodra de grenzen op nul staan", () => {
    expect(fastMovers(rijen, 0, 0).every((m) => m.klasse === "C")).toBe(true);
  });

  it("zet bij wat stilstaat het meest vastgehouden bovenaan", () => {
    expect(idleRows(rijen).map((r) => r.catalogKey)).toEqual(["e", "f", "g"]);
  });

  it("laat in de volledige lijst niets weg", () => {
    expect(byMovement(rijen)).toHaveLength(7);
    expect(byMovement(rijen)[0].catalogKey).toBe("a");
  });

  it("vat samen wat er te doen is", () => {
    const samen = stockSummary(rijen, 13.4);
    expect(samen.linesToOrder).toBe(4);
    expect(samen.sheetsToOrder).toBe(54);
    expect(samen.out).toBe(2);
    expect(samen.idle).toBe(2);
    expect(samen.idleSheets).toBe(98);
    expect(samen.soonestOrderWithinDays).toBe(-5);
    expect(samen.measuredDays).toBe(13);
  });
});

describe("zoeken", () => {
  const rijen = [
    { sku: "NB10052E1NL", model: "HP EliteBook 840 G8", layout: "QWERTY US NL", storageNumber: 12 },
    { sku: "NB10088E1FR", model: "Dell Latitude 3310", layout: "AZERTY FR", storageNumber: 38 },
  ] as StockPlanRow[];

  it("vindt op artikelnummer, model en hangmap", () => {
    expect(searchRows(rijen, "10088")).toHaveLength(1);
    expect(searchRows(rijen, "elitebook")).toHaveLength(1);
    expect(searchRows(rijen, "38")[0].sku).toBe("NB10088E1FR");
    expect(searchRows(rijen, "  ")).toHaveLength(2);
  });
});

describe("hoe lang er is gemeten", () => {
  it("telt vanaf de eerste echte verbruiksboeking", () => {
    expect(Math.round(measuredDays(reeks(13), nu))).toBe(13);
  });

  it("is nul zolang er niets is geboekt", () => {
    expect(measuredDays([], nu)).toBe(0);
  });
});

describe("zelf sorteren", () => {
  const rijen = [
    { sku: "b", stock: 5, perWeek: 2 },
    { sku: "a", stock: 40, perWeek: null },
    { sku: "c", stock: 0, perWeek: 9 },
  ] as StockPlanRow[];

  it("zet oplopend het laagste bovenaan", () => {
    expect(sortRows(rijen, "asc", (r) => r.stock).map((r) => r.stock)).toEqual([0, 5, 40]);
  });

  it("draait om bij aflopend", () => {
    expect(sortRows(rijen, "desc", (r) => r.stock).map((r) => r.stock)).toEqual([40, 5, 0]);
  });

  it("houdt lege waarden onderaan, welke kant je ook op sorteert", () => {
    // Anders staat de lijst bij elke sortering vol streepjes bovenin en zie je
    // juist niet waar het om gaat.
    expect(sortRows(rijen, "asc", (r) => r.perWeek).map((r) => r.perWeek)).toEqual([2, 9, null]);
    expect(sortRows(rijen, "desc", (r) => r.perWeek).map((r) => r.perWeek)).toEqual([9, 2, null]);
  });

  it("sorteert tekst op zijn Nederlands", () => {
    expect(sortRows(rijen, "asc", (r) => r.sku).map((r) => r.sku)).toEqual(["a", "b", "c"]);
  });

  it("laat de meegegeven lijst met rust", () => {
    const kopie = [...rijen];
    sortRows(rijen, "desc", (r) => r.stock);
    expect(rijen).toEqual(kopie);
  });

  it("gaat van oplopend naar aflopend naar de standaardvolgorde", () => {
    // Zonder die derde stand kun je "meeste haast bovenaan" niet meer
    // terugkrijgen zonder de pagina te herladen.
    let stand = nextSort(null, "stock");
    expect(stand).toEqual({ key: "stock", direction: "asc" });
    stand = nextSort(stand, "stock");
    expect(stand).toEqual({ key: "stock", direction: "desc" });
    stand = nextSort(stand, "stock");
    expect(stand).toBeNull();
  });

  it("begint opnieuw bij een andere kolom", () => {
    expect(nextSort({ key: "stock", direction: "desc" }, "sku"))
      .toEqual({ key: "sku", direction: "asc" });
  });
});
