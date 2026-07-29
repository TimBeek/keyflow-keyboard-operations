import { describe, expect, it } from "vitest";
import {
  createNoviplyPrintRequestCsv,
  createNoviplyStockCsv,
  noviplyExportFilename,
  type NoviplyStockRow,
} from "./noviply-export";
import type { PrintRequestRecord } from "./print-requests";

const stockRow: NoviplyStockRow = {
  storageNumber: 75,
  model: "Dell Latitude 5420",
  sku: "NB10172E1NL",
  layout: "QWERTY US NL",
  stock: 2,
  threshold: 10,
  shortfall: 8,
};

const request: PrintRequestRecord = {
  id: "req-1",
  brand: "Dell",
  model: "Dell Latitude 5420",
  layout: "QWERTZ DE",
  variant: "E1",
  orderReference: "1906",
  reason: "Not ready during the morning run.",
  requestedAt: "2026-07-29T09:15:00.000Z",
  requestedBy: "Medewerker",
  status: "printed",
  handledAt: "2026-07-29T14:20:00.000Z",
  handledBy: "Noviply",
  note: "",
};

describe("createNoviplyStockCsv", () => {
  it("schrijft een puntkomma-bestand met kop en regel", () => {
    const csv = createNoviplyStockCsv([stockRow]);
    const [header, row] = csv.trimEnd().split("\r\n");

    expect(header).toContain('"Folder";"Part number"');
    expect(row).toBe('75;"NB10172E1NL";"Dell Latitude 5420";"QWERTY US NL";2;10;8;"Below minimum"');
  });

  it("markeert een regel op peil als OK en telt geen negatief tekort", () => {
    const csv = createNoviplyStockCsv([{ ...stockRow, stock: 40, shortfall: -30 }]);

    expect(csv).toContain(';0;"OK"');
    expect(csv).not.toContain("-30");
  });

  it("noemt een ontbrekend artikelnummer bij naam in plaats van rommel te tonen", () => {
    const csv = createNoviplyStockCsv([{ ...stockRow, sku: ",,,,,," }]);

    expect(csv).toContain("Geen artikelnummer");
  });

  it("begint met een BOM, anders leest Excel de accenten verkeerd", () => {
    expect(createNoviplyStockCsv([stockRow]).charCodeAt(0)).toBe(0xfeff);
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
