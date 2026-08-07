import { describe, expect, it } from "vitest";
import {
  createNoviplyPrintRequestCsv,
  createNoviplyStockCsv,
  createPartNumberCsv,
  noviplyExportFilename,
} from "./noviply-export";
import type { NoviplyStockRow } from "./noviply-stock";
import type { PrintRequestRecord } from "./print-requests";

const stockRow: NoviplyStockRow = {
  catalogKey: "k75",
  storageNumber: 75,
  model: "Dell Latitude 5420",
  sku: "NB10172E1NL",
  ownNumber: false,
  sharedNumber: false,
  compatibleModels: 4,
  layout: "QWERTY US NL",
  variant: "E1",
  note: "",
  stock: 2,
  used: 12,
  weeklyDemand: 3.25,
  minimum: 10,
  shortfall: 8,
  coverWeeks: 0.6,
  orderQuantity: 24,
  fastMover: true,
  signal: "order_now",
};

const request: PrintRequestRecord = {
  id: "req-1",
  brand: "Dell",
  model: "Dell Latitude 5420",
  layout: "QWERTZ DE",
  variant: "E1",
  orderReference: "1906",
  reason: "Not ready during the morning run.",
  trackpoint: "unknown" as const,
  requestedAt: "2026-07-29T09:15:00.000Z",
  requestedBy: "Medewerker",
  status: "printed",
  handledAt: "2026-07-29T14:20:00.000Z",
  handledBy: "Noviply",
  quantity: 1,
  note: "",
};

describe("createNoviplyStockCsv", () => {
  it("schrijft een puntkomma-bestand met kop en regel", () => {
    const csv = createNoviplyStockCsv([stockRow]);
    const [header, row] = csv.trimEnd().split(String.fromCharCode(13, 10));

    expect(header).toContain('"Folder";"Part number"');
    expect(header).toContain('"Order";"Status"');
    expect(row).toBe(
      '75;"NB10172E1NL";"Dell Latitude 5420";"QWERTY US NL";3,3;2;10;0,6;24;"Order now"',
    );
  });

  it("laat een vak leeg waar niets te zeggen valt", () => {
    // Een nul zou "niets nodig" betekenen, en daar wordt op besteld.
    const csv = createNoviplyStockCsv([{
      ...stockRow, weeklyDemand: null, minimum: null, coverWeeks: null,
      orderQuantity: 0, fastMover: false, signal: "unknown",
    }]);

    expect(csv).toContain('"No usage figure"');
    // Geen nul in de bestelkolom: dat leest als "niets nodig".
    expect(csv).toContain(';"";2;"";"";"";');
  });

  it("noemt een ontbrekend artikelnummer bij naam in plaats van rommel te tonen", () => {
    expect(createNoviplyStockCsv([{ ...stockRow, sku: ",,,,,," }]))
      .toContain("Geen artikelnummer");
  });

  it("begint met een BOM, anders leest Excel de accenten verkeerd", () => {
    expect(createNoviplyStockCsv([stockRow]).charCodeAt(0)).toBe(0xfeff);
  });
});

describe("createPartNumberCsv", () => {
  it("neemt alles mee wat Noviply over een nummer moet weten", () => {
    const csv = createPartNumberCsv([{ ...stockRow, ownNumber: true, sharedNumber: true }]);
    const [header, row] = csv.trimEnd().split(String.fromCharCode(13, 10));

    expect(header).toContain('"Own number";"Shared"');
    expect(header).toContain('"Fits models"');
    expect(row).toContain('"yes";"yes"');
  });

  it("laat ook een vel zien dat stilstaat", () => {
    // Zij vroegen om alle partnummers, niet om een top tien.
    expect(createPartNumberCsv([{ ...stockRow, used: 0, weeklyDemand: null }]))
      .toContain("NB10172E1NL");
  });
});

describe("createNoviplyPrintRequestCsv", () => {
  it("neemt ook de afgehandelde regels mee, met wie en wanneer", () => {
    const csv = createNoviplyPrintRequestCsv([request]);

    expect(csv).toContain('"Printed"');
    expect(csv).toContain('"Noviply"');
    expect(csv).toContain("2026-07-29T14:20:00.000Z");
  });

  it("laat een lege afhandeling leeg in plaats van null", () => {
    const csv = createNoviplyPrintRequestCsv([
      { ...request, status: "requested", handledAt: null, handledBy: null },
    ]);

    expect(csv).not.toContain("null");
  });

  it("voert een cel die op een formule lijkt niet uit", () => {
    const csv = createNoviplyPrintRequestCsv([
      { ...request, note: "=1+1" },
    ]);

    expect(csv).toContain(`"'=1+1"`);
  });

  it("houdt een aanhalingsteken in een notitie heel", () => {
    const csv = createNoviplyPrintRequestCsv([
      { ...request, note: 'Layout "DE" klopt niet' },
    ]);

    expect(csv).toContain('"Layout ""DE"" klopt niet"');
  });
});

describe("noviplyExportFilename", () => {
  it("zet de datum in de naam zodat sorteren op naam werkt", () => {
    expect(noviplyExportFilename("stock", "2026-07-29T09:15:00.000Z"))
      .toBe("noviply-stock-2026-07-29.csv");
  });
});

describe("Trackpoint in het bestand voor Noviply", () => {
  it("staat als eigen kolom in de aanvraagexport", () => {
    // Noviply ziet de laptop niet. Zonder deze kolom maken ze het vel voor een
    // toetsenbord zonder trackpoint, terwijl de indeling anders is.
    const csv = createNoviplyPrintRequestCsv([
      { ...request, trackpoint: "yes" },
      { ...request, id: "2", trackpoint: "no" },
      { ...request, id: "3", trackpoint: "unknown" },
    ]);
    const regels = csv.split("\r\n");

    expect(regels[0]).toContain("Trackpoint");
    expect(regels[1]).toContain("Yes");
    expect(regels[2]).toContain("No");
    expect(regels[3]).toContain("Not stated");
  });
});
