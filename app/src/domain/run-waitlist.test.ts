import { describe, expect, it } from "vitest";
import {
  RunWaitlistError,
  createRunWaitlistEntry,
  groupRunWaitlist,
  waitingForRunCount,
  type RunWaitlistEntry,
} from "./run-waitlist";

const now = new Date(2026, 6, 30, 11, 0, 0, 0);
const middagronde = new Date(2026, 6, 30, 12, 30, 0, 0);

function entry(overrides: Partial<RunWaitlistEntry> = {}): RunWaitlistEntry {
  return {
    id: "1",
    model: "Dell Latitude 5420",
    layout: "QWERTY IT",
    variant: "E1",
    orderReference: "000097612",
    quantity: 1,
    expectedRunAt: middagronde.toISOString(),
    expectedRunLabel: "12:30",
  trackpoint: "unknown" as const,
    createdAt: now.toISOString(),
    createdBy: "Medewerker",
    status: "waiting",
    settledAt: null,
    settledBy: null,
    ...overrides,
  };
}

describe("createRunWaitlistEntry", () => {
  it("legt vast waar de laptop op wacht", () => {
    const created = createRunWaitlistEntry({
      model: " Dell Latitude 5420 ",
      layout: "QWERTY IT",
      variant: "E1",
      orderReference: " 000097612 ",
      quantity: 1,
      expectedRunAt: middagronde.toISOString(),
      expectedRunLabel: "12:30",
    }, "Medewerker", now);

    expect(created).toMatchObject({
      model: "Dell Latitude 5420",
      orderReference: "000097612",
      expectedRunLabel: "12:30",
      status: "waiting",
    });
  });

  it("weigert zonder ordernummer", () => {
    // Anders staat er straks een laptop op de kar die niemand kan thuisbrengen.
    expect(() => createRunWaitlistEntry({
      model: "Dell Latitude 5420",
      layout: "QWERTY IT",
      variant: "E1",
      orderReference: "   ",
      quantity: 1,
      expectedRunAt: middagronde.toISOString(),
      expectedRunLabel: "12:30",
    }, "Medewerker", now)).toThrow(RunWaitlistError);
  });

  it("weigert een ronde die geen tijdstip is", () => {
    expect(() => createRunWaitlistEntry({
      model: "Dell Latitude 5420",
      layout: "QWERTY IT",
      variant: "E1",
      orderReference: "000097612",
      quantity: 1,
      expectedRunAt: "straks",
      expectedRunLabel: "12:30",
    }, "Medewerker", now)).toThrow(RunWaitlistError);
  });
});

describe("groupRunWaitlist", () => {
  it("houdt stil wat nog moet komen", () => {
    const groups = groupRunWaitlist([entry()], now);

    expect(groups.pending).toHaveLength(1);
    expect(groups.due).toHaveLength(0);
  });

  it("vraagt erom zodra de ronde geweest is", () => {
    const groups = groupRunWaitlist([entry()], new Date(2026, 6, 30, 12, 45));

    expect(groups.due.map((row) => row.orderReference)).toEqual(["000097612"]);
  });

  it("laat afgehandelde laptops eruit", () => {
    const groups = groupRunWaitlist([
      entry({ id: "a", status: "collected", settledAt: now.toISOString(), settledBy: "Medewerker" }),
      entry({ id: "b", status: "escalated", settledAt: now.toISOString(), settledBy: "Medewerker" }),
    ], new Date(2026, 6, 30, 13));

    expect(groups.due).toHaveLength(0);
    expect(groups.pending).toHaveLength(0);
  });

  it("zet de oudste ronde bovenaan", () => {
    const ochtend = entry({
      id: "ochtend",
      orderReference: "000097600",
      expectedRunAt: new Date(2026, 6, 30, 9).toISOString(),
    });
    const groups = groupRunWaitlist([entry(), ochtend], new Date(2026, 6, 30, 13));

    expect(groups.due[0].orderReference).toBe("000097600");
  });
});

describe("waitingForRunCount", () => {
  it("telt alleen wat nog apart staat", () => {
    expect(waitingForRunCount([
      entry({ id: "a" }),
      entry({ id: "b", status: "collected", settledAt: now.toISOString(), settledBy: "X" }),
    ])).toBe(1);
  });
});
