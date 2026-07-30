import { describe, expect, it } from "vitest";
import {
  defaultPrintRunTimes,
  isPrintRunTime,
  nextPrintRun,
  runHasPassed,
} from "./print-runs";

/** Lokale tijd, want de werkvloer kijkt op de klok aan de muur. */
function at(hours: number, minutes = 0) {
  return new Date(2026, 6, 30, hours, minutes, 0, 0);
}

describe("nextPrintRun", () => {
  it("wijst 's ochtends naar de ochtendronde", () => {
    expect(nextPrintRun(at(7, 45), defaultPrintRunTimes)).toMatchObject({
      label: "09:00",
      which: "morning",
    });
  });

  it("wijst tussen de rondes naar de middagronde", () => {
    // Dit is het geval waar het om begonnen was: order van vanochtend 10:00,
    // klaargemaakt om 11:00, komt om 12:30 mee.
    expect(nextPrintRun(at(11), defaultPrintRunTimes)).toMatchObject({
      label: "12:30",
      which: "afternoon",
    });
  });

  it("zegt niets meer zodra beide rondes geweest zijn", () => {
    // "Komt morgenochtend wel" helpt iemand met een laptop in zijn hand niet.
    expect(nextPrintRun(at(14), defaultPrintRunTimes)).toBeNull();
  });

  it("telt een ronde die precies nu loopt niet meer mee", () => {
    expect(nextPrintRun(at(12, 30), defaultPrintRunTimes)).toBeNull();
  });

  it("valt niet om over een onleesbare tijd", () => {
    expect(nextPrintRun(at(7), { morning: "kwart over acht", afternoon: "12:30" }))
      .toMatchObject({ label: "12:30" });
    expect(nextPrintRun(at(7), { morning: "geen", afternoon: "geen" })).toBeNull();
  });

  it("houdt de volgorde aan die is ingesteld, niet de namen", () => {
    // Wie de middagronde vóór de ochtendronde zet, krijgt gewoon de eerste.
    const omgedraaid = { morning: "13:00", afternoon: "10:00" };

    expect(nextPrintRun(at(9), omgedraaid)).toMatchObject({ label: "10:00" });
  });
});

describe("runHasPassed", () => {
  it("is pas waar als het tijdstip voorbij is", () => {
    const ronde = at(12, 30).toISOString();

    expect(runHasPassed(ronde, at(12, 29))).toBe(false);
    expect(runHasPassed(ronde, at(12, 31))).toBe(true);
  });

  it("laat een kapot tijdstip niet als 'geweest' gelden", () => {
    // Anders zou de werkvloer gevraagd worden naar een ronde die nooit liep.
    expect(runHasPassed("geen datum", at(23))).toBe(false);
  });
});

describe("isPrintRunTime", () => {
  it("accepteert een kloktijd en weigert de rest", () => {
    expect(isPrintRunTime("09:00")).toBe(true);
    expect(isPrintRunTime("12:30")).toBe(true);
    expect(isPrintRunTime("24:00")).toBe(false);
    expect(isPrintRunTime("9:00")).toBe(false);
    expect(isPrintRunTime("half een")).toBe(false);
  });
});
