import { describe, expect, it } from "vitest";
import {
  noviplyStockRows,
  signalLabel,
  rowsByMovement,
  rowsNeedingAttention,
  searchStockRows,
  type NoviplyStockRow,
} from "./noviply-stock";
import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import type { InventoryTransactionEntry } from "./operations";

const nu = new Date("2026-08-07T10:00:00.000Z");
const beleid = { leadTimeDays: 14, safetyWeeks: 2 };

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

/** Verbruik dat echt telt: een conversie, niet een tellingcorrectie. */
function verbruik(dagenGeleden: number, aantal = 1, catalogKey = "k1"): InventoryTransactionEntry {
  return {
    id: `t${dagenGeleden}-${aantal}`,
    sku: "NB10052E1NL",
    catalogKey,
    type: "issue",
    quantityDelta: -aantal,
    reasonCode: "conversion_usage",
    occurredAt: new Date(nu.getTime() - dagenGeleden * 86_400_000).toISOString(),
    actor: "Werkvloer",
  } as InventoryTransactionEntry;
}

/** Genoeg meetdagen, want onder de veertien zegt de app bewust niets. */
function meetreeks(perDag: number, dagen = 40) {
  const reeks: InventoryTransactionEntry[] = [];
  for (let dag = 0; dag < dagen; dag += 1) reeks.push(verbruik(dag, perDag));
  return reeks;
}

function rij(quantities: Record<string, number>, transacties: InventoryTransactionEntry[]) {
  return noviplyStockRows([vel()], transacties, quantities, nu, beleid)[0];
}

describe("het voorraadbeeld van Noviply", () => {
  it("zegt niets zolang er te weinig gemeten is", () => {
    // Twee dagen meten is geen weekverbruik. Liever geen getal dan een verzonnen.
    const uit = rij({ NB10052E1NL: 5 }, [verbruik(0), verbruik(1)]);
    expect(uit.weeklyDemand).toBeNull();
    expect(uit.minimum).toBeNull();
    expect(uit.signal).toBe("unknown");
  });

  it("noemt een lege hangmap zonder meting gewoon leeg", () => {
    expect(rij({ NB10052E1NL: 0 }, []).signal).toBe("empty");
  });

  it("zet een hardloper die onder het minimum zit op 'nu bestellen'", () => {
    // Dit is wat er gevraagd werd: er ligt er nog één en het loopt hard.
    const uit = rij({ NB10052E1NL: 1 }, meetreeks(2));
    expect(uit.fastMover).toBe(true);
    expect(uit.shortfall).toBeGreaterThan(0);
    expect(uit.signal).toBe("order_now");
    expect(uit.orderQuantity).toBeGreaterThan(uit.shortfall);
  });

  it("laat een trage hangmap onder het minimum wél bestellen, maar zonder haast", () => {
    // Drie vellen in ruim vier weken is minder dan één per week.
    const traag = [verbruik(1), verbruik(15), verbruik(30)];
    const uit = rij({ NB10052E1NL: 0 }, traag);
    expect(uit.fastMover).toBe(false);
    expect(uit.signal).toBe("out");
  });

  it("waarschuwt bij een hardloper die nog nét boven het minimum zit", () => {
    // Het minimum is vier weken dekking en de volgende keer kijken is over
    // acht. Daartussenin sta je er nog boven, maar niet lang meer.
    const uit = rij({ NB10052E1NL: 80 }, meetreeks(2));
    expect(uit.shortfall).toBe(0);
    expect(uit.signal).toBe("watch");
  });

  it("laat een ruim gevulde hangmap met rust", () => {
    const uit = rij({ NB10052E1NL: 400 }, meetreeks(2));
    expect(uit.signal).toBe("ok");
    expect(uit.orderQuantity).toBe(0);
  });

  it("telt alleen echt verbruik, geen bronlijst of tellingcorrectie", () => {
    // Het inlezen van de beginvoorraad maakte ooit van een leeggeboekte
    // hangmap de grootste hardloper van de lijst.
    const administratie: InventoryTransactionEntry[] = [{
      ...verbruik(1, 2987),
      reasonCode: "production_source_bootstrap",
      type: "receipt",
      aggregated: true,
    } as InventoryTransactionEntry];
    expect(rij({ NB10052E1NL: 5 }, administratie).used).toBe(0);
  });

  it("zet de landcode achter de layout, anders lijkt alles hetzelfde", () => {
    // 145 van de 148 hangmappen staan op "QWERTY US"; het nummer maakt het onderscheid.
    expect(rij({ NB10052E1NL: 3 }, []).layout).toContain("NL");
  });

  it("geeft de enter-variant in het Engels", () => {
    expect(rij({ NB10052E1NL: 3 }, []).variant).toBe("E1");
  });
});

describe("de twee tabellen", () => {
  const rijen = [
    { storageNumber: 1, used: 0, stock: 9, shortfall: 0, coverWeeks: 9, signal: "ok" },
    { storageNumber: 2, used: 9, stock: 0, shortfall: 4, coverWeeks: 0, signal: "out" },
    { storageNumber: 3, used: 5, stock: 2, shortfall: 3, coverWeeks: 1, signal: "order_now" },
    { storageNumber: 4, used: 2, stock: 8, shortfall: 0, coverWeeks: 5, signal: "watch" },
    { storageNumber: 5, used: 0, stock: 4, shortfall: 0, coverWeeks: null, signal: "unknown" },
  ] as NoviplyStockRow[];

  it("toont in de bestellijst alleen wat aandacht vraagt, met de haast bovenaan", () => {
    expect(rowsNeedingAttention(rijen).map((r) => r.storageNumber)).toEqual([2, 3, 4]);
  });

  it("noemt een vel zonder verbruikscijfer niet 'nog niet gemeten'", () => {
    // Dat kan ook betekenen dat het vel simpelweg stilstaat, en dan is
    // "we hebben nog niet lang genoeg gemeten" een onwaarheid.
    expect(signalLabel("unknown")).toBe("No usage figure");
  });

  it("laat 'nog niet gemeten' uit de bestellijst", () => {
    // Er ligt voorraad; wij weten alleen niet hoe hard het loopt. Dat is geen
    // bestelregel, en zou in de eerste weken de hele kast op de lijst zetten.
    expect(rowsNeedingAttention(rijen).some((r) => r.signal === "unknown")).toBe(false);
  });

  it("zet in de volledige lijst het hardst lopende bovenaan", () => {
    expect(rowsByMovement(rijen).map((r) => r.storageNumber)).toEqual([2, 3, 4, 5, 1]);
  });

  it("laat niets weg uit de volledige lijst, ook niet wat stilstaat", () => {
    // Noviply vroeg juist om alle partnummers, niet om een top tien.
    expect(rowsByMovement(rijen)).toHaveLength(5);
  });
});

describe("zoeken", () => {
  const rijen = [
    { sku: "NB10052E1NL", model: "HP EliteBook 840 G8", layout: "QWERTY US NL", storageNumber: 12 },
    { sku: "NB10088E1FR", model: "Dell Latitude 3310", layout: "AZERTY FR", storageNumber: 38 },
  ] as NoviplyStockRow[];

  it("vindt op artikelnummer", () => {
    expect(searchStockRows(rijen, "10088")).toHaveLength(1);
  });

  it("vindt op model en op hangmapnummer", () => {
    expect(searchStockRows(rijen, "elitebook")).toHaveLength(1);
    expect(searchStockRows(rijen, "38")[0].sku).toBe("NB10088E1FR");
  });

  it("geeft alles terug bij een leeg zoekveld", () => {
    expect(searchStockRows(rijen, "  ")).toHaveLength(2);
  });
});
