import { describe, expect, it } from "vitest";
import { createConversionLogEntry, type ConversionLogEntry } from "./conversion-log";
import { createNoviplyPrintRequestCsv } from "./noviply-export";
import { createPrintRequest } from "./print-requests";
import { conversionTotals, conversionsPerDay, methodShares } from "./reporting";
import { createRunWaitlistEntry } from "./run-waitlist";

/**
 * Eén ordernummer kan meerdere laptops zijn. Overal waar dat getal wegvalt
 * gaat er iets stil mis: Noviply print er één in plaats van drie, de voorraad
 * blijft te hoog staan, of de rapportage telt drie laptops als één.
 */

const now = new Date(2026, 6, 30, 11, 0, 0, 0);

describe("een aanvraag bij Noviply", () => {
  it("neemt het aantal mee", () => {
    const request = createPrintRequest({
      model: "Dell Latitude 5420",
      layout: "QWERTY IT",
      variant: "E1",
      orderReference: "000097612",
      reason: "",
      trackpoint: "unknown" as const,
      quantity: 3,
    }, { id: "1", requestedAt: now.toISOString(), requestedBy: "Medewerker" });

    expect(request.quantity).toBe(3);
  });

  it("staat op één als er niets is ingevuld", () => {
    const request = createPrintRequest({
      model: "Dell Latitude 5420",
      layout: "QWERTY IT",
      variant: "E1",
      orderReference: "000097612",
      reason: "",
      trackpoint: "unknown" as const,
    }, { id: "1", requestedAt: now.toISOString(), requestedBy: "Medewerker" });

    expect(request.quantity).toBe(1);
  });

  it("zet het aantal in het bestand dat Noviply overneemt", () => {
    // Zonder deze kolom typen zij één vel over waar er drie moesten komen.
    const csv = createNoviplyPrintRequestCsv([{
      id: "1",
      brand: "Dell",
      model: "Dell Latitude 5420",
      layout: "QWERTY IT",
      variant: "E1",
      orderReference: "000097612",
      reason: "",
      trackpoint: "unknown" as const,
      requestedAt: now.toISOString(),
      requestedBy: "Medewerker",
      status: "requested",
      handledAt: null,
      handledBy: null,
      note: "",
      quantity: 3,
    }]);

    expect(csv).toContain("Sheets");
    expect(csv).toContain(";3;");
  });
});

describe("wachten op de printronde", () => {
  it("onthoudt om hoeveel laptops het gaat", () => {
    const entry = createRunWaitlistEntry({
      model: "Dell Latitude 5420",
      layout: "QWERTY IT",
      variant: "E1",
      orderReference: "000097612",
      quantity: 4,
      expectedRunAt: new Date(2026, 6, 30, 12, 30).toISOString(),
      expectedRunLabel: "12:30",
    }, "Medewerker", now);

    expect(entry.quantity).toBe(4);
  });
});

describe("de rapportage", () => {
  function conversion(quantity: number | undefined, id: string): ConversionLogEntry {
    return createConversionLogEntry({
      method: "noviply_sheet",
      status: "completed",
      model: "Dell Latitude 5420",
      targetLayout: "QWERTY IT",
      orderReference: id,
      quantity,
    }, { id, occurredAt: now.toISOString(), actor: "Medewerker" });
  }

  it("telt laptops en niet het aantal keer dat er geboekt is", () => {
    // Twee regels van drie is zes laptops, niet twee.
    const totals = conversionTotals([conversion(3, "a"), conversion(3, "b")], 7, "2026-07-30");

    expect(totals.current).toBe(6);
    expect(totals.completed).toBe(6);
  });

  it("rekent een regel zonder aantal als één", () => {
    // Alles wat vóór dit veld is geboekt heeft geen aantal.
    const totals = conversionTotals([conversion(undefined, "oud")], 7, "2026-07-30");

    expect(totals.current).toBe(1);
  });

  it("telt de dagstaat in laptops", () => {
    const days = conversionsPerDay([conversion(5, "a")], 1, "2026-07-30");

    expect(days[0].total).toBe(5);
    expect(days[0].byMethod.noviply_sheet).toBe(5);
  });

  it("houdt de verdeling over methodes op laptops", () => {
    const shares = methodShares([conversion(9, "a")], 7, "2026-07-30");
    const sheet = shares.find((row) => row.method === "noviply_sheet");

    expect(sheet?.current).toBe(9);
    expect(sheet?.share).toBe(100);
  });
});
