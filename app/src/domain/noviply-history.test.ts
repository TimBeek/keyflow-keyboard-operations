import { describe, expect, it } from "vitest";
import {
  historyTotals,
  noviplyHistory,
  searchNoviplyHistory,
} from "./noviply-history";
import type { PrintBatch } from "./print-batch";
import type { PrintRequestRecord } from "./print-requests";

/**
 * De geschiedenis toonde alleen de losse aanvragen. Sinds de rondes hier worden
 * ingelezen is dat het kleinste deel van het werk, en stonden de vellen uit een
 * ronde nergens terug te vinden.
 */

function request(overrides: Partial<PrintRequestRecord> = {}): PrintRequestRecord {
  return {
    id: "a1",
    brand: "Dell",
    model: "Dell Latitude 5420",
    layout: "QWERTY IT",
    variant: "E1",
    orderReference: "000097555",
    reason: "",
    trackpoint: "unknown" as const,
    requestedAt: "2026-07-29T09:00:00.000Z",
    requestedBy: "Medewerker",
    status: "printed",
    handledAt: "2026-07-29T16:17:00.000Z",
    handledBy: "Noviply",
    note: "",
    quantity: 1,
    ...overrides,
  };
}

function batch(): PrintBatch {
  return {
    id: "b1",
    runDate: "2026-07-30",
    batchNumber: 2,
    fileName: "batch-2-30-07-2026.xlsx",
    uploadedAt: "2026-07-30T10:28:00.000Z",
    uploadedBy: "Tim Beek",
    deletedAt: null,
    seenAt: "2026-07-30T10:30:00.000Z",
    rows: [
      {
        id: "r1", lineNumber: 1, model: "HP ProBook 430 G8", languageCode: "BE",
        layout: "AZERTY BE", variant: "E1", quantity: 2, orderReference: "000099263",
        status: "printed", note: "", handledAt: "2026-07-30T12:35:00.000Z", handledBy: "Noviply",
      },
      {
        id: "r2", lineNumber: 2, model: "Lenovo B50-80", languageCode: "BE",
        layout: "AZERTY BE", variant: "E1", quantity: 1, orderReference: "000099288",
        status: "not_printable", note: "Model niet in onze lijst",
        handledAt: "2026-07-30T12:36:00.000Z", handledBy: "Noviply",
      },
      {
        id: "r3", lineNumber: 3, model: "Dell Latitude 5310", languageCode: "NL",
        layout: "QWERTY NL", variant: "E1", quantity: 1, orderReference: "000099276",
        status: "open", note: "", handledAt: null, handledBy: null,
      },
    ],
  };
}

describe("noviplyHistory", () => {
  it("brengt losse aanvragen en rondes in één lijst", () => {
    const geschiedenis = noviplyHistory([request()], [batch()]);

    expect(geschiedenis).toHaveLength(3);
    expect(geschiedenis.map((entry) => entry.source)).toContain("run");
    expect(geschiedenis.map((entry) => entry.source)).toContain("request");
  });

  it("laat wat nog openstaat eruit", () => {
    // Alleen afgehandeld hoort in de geschiedenis; open werk staat in de ronde.
    const geschiedenis = noviplyHistory([], [batch()]);

    expect(geschiedenis.map((entry) => entry.orderReference)).not.toContain("000099276");
  });

  it("zet het laatst afgehandelde bovenaan", () => {
    const geschiedenis = noviplyHistory([request()], [batch()]);

    expect(geschiedenis[0].handledAt).toBe("2026-07-30T12:36:00.000Z");
    expect(geschiedenis[geschiedenis.length - 1].orderReference).toBe("000097555");
  });

  it("zegt uit welke ronde een regel komt", () => {
    const uitRonde = noviplyHistory([], [batch()]).find((e) => e.orderReference === "000099263");

    expect(uitRonde?.sourceLabel).toBe("Batch 2 · 30-07");
    expect(uitRonde?.brand).toBe("HP");
    expect(uitRonde?.quantity).toBe(2);
  });

  it("neemt de reden mee waarom iets niet kon", () => {
    const geblokkeerd = noviplyHistory([], [batch()]).find((e) => e.outcome === "not_printable");

    expect(geblokkeerd?.note).toBe("Model niet in onze lijst");
  });

  it("houdt de regels van een ronde die uit de lijst is gehaald", () => {
    // Dit was de fout: de geschiedenis werd afgeleid uit de rondelijst, dus
    // verdween een ronde uit de lijst, dan verdwenen de ordernummers en
    // specificaties van werk dat wél was gedaan mee.
    const uitLijst = { ...batch(), deletedAt: "2026-08-01T09:00:00.000Z" };
    const geschiedenis = noviplyHistory([], [uitLijst]);

    expect(geschiedenis).toHaveLength(2);
    expect(geschiedenis.map((entry) => entry.orderReference))
      .toEqual(["000099288", "000099263"]);
    expect(geschiedenis[1].sourceLabel).toBe("Batch 2 · 30-07");
  });

  it("valt terug op de landcode als de taal onbekend is", () => {
    const eigen = batch();
    eigen.rows[0] = { ...eigen.rows[0], layout: "", languageCode: "XX" };

    const regel = noviplyHistory([], [eigen])
      .find((entry) => entry.orderReference === "000099263");

    expect(regel?.layout).toBe("XX");
  });
});

describe("searchNoviplyHistory", () => {
  const alles = noviplyHistory([request()], [batch()]);

  it("vindt op ordernummer", () => {
    expect(searchNoviplyHistory(alles, "000099263")).toHaveLength(1);
  });

  it("vindt op een stuk van het model", () => {
    expect(searchNoviplyHistory(alles, "probook").map((e) => e.orderReference))
      .toEqual(["000099263"]);
  });

  it("vindt op de ronde", () => {
    expect(searchNoviplyHistory(alles, "batch 2")).toHaveLength(2);
  });

  it("eist dat alle woorden voorkomen", () => {
    // "5420 printed" hoort niet alles met een van beide op te leveren.
    expect(searchNoviplyHistory(alles, "latitude printed").map((e) => e.orderReference))
      .toEqual(["000097555"]);
  });

  it("geeft alles terug bij een lege zoekopdracht", () => {
    expect(searchNoviplyHistory(alles, "   ")).toHaveLength(alles.length);
  });

  it("let niet op hoofdletters", () => {
    expect(searchNoviplyHistory(alles, "AZERTY be")).toHaveLength(2);
  });

  it("vindt op wat er niet kon", () => {
    expect(searchNoviplyHistory(alles, "kan niet").map((e) => e.orderReference))
      .toEqual(["000099288"]);
  });
});

describe("historyTotals", () => {
  it("telt vellen en niet alleen regels", () => {
    const totalen = historyTotals(noviplyHistory([request()], [batch()]));

    expect(totalen.lines).toBe(3);
    expect(totalen.sheets).toBe(4);
    expect(totalen.printed).toBe(2);
    expect(totalen.blocked).toBe(1);
  });
});
