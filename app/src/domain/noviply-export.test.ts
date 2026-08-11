import { describe, expect, it } from "vitest";
import {
  createNoviplyPrintRequestCsv,
  noviplyExportFilename,
} from "./noviply-export";
import type { PrintRequestRecord } from "./print-requests";

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
    expect(noviplyExportFilename("run", "2026-07-29T09:15:00.000Z"))
      .toBe("noviply-run-2026-07-29.csv");
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
