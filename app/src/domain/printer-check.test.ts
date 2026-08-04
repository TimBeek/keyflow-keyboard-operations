import { describe, expect, it } from "vitest";
import {
  answerValidMinutes,
  latestAnswered,
  openCheck,
  printingNow,
  questionValidMinutes,
  readyToPrint,
  type PrinterCheckRecord,
} from "./printer-check";

const nu = new Date("2026-08-03T13:00:00.000Z");
const geleden = (minuten: number) =>
  new Date(nu.getTime() - minuten * 60_000).toISOString();

function check(overrides: Partial<PrinterCheckRecord> = {}): PrinterCheckRecord {
  return {
    id: "c1",
    askedAt: geleden(2),
    askedBy: "Noviply",
    status: "pending",
    answeredAt: null,
    answeredBy: null,
    answerNote: "",
    closedAt: null,
    ...overrides,
  } as PrinterCheckRecord;
}

describe("de vraag aan de werkvloer", () => {
  it("staat open zolang er kort geleden is gevraagd", () => {
    expect(openCheck([check()], nu)?.id).toBe("c1");
  });

  it("vervalt als er te lang geen antwoord komt", () => {
    // Anders blijft er "wachten op de werkvloer" staan terwijl daar allang
    // niemand meer naar kijkt, en kan Noviply niet opnieuw vragen.
    expect(openCheck([check({ askedAt: geleden(questionValidMinutes + 1) })], nu)).toBeNull();
  });

  it("blijft staan tot precies die grens", () => {
    expect(openCheck([check({ askedAt: geleden(questionValidMinutes - 1) })], nu)).not.toBeNull();
  });
});

describe("het antwoord van de werkvloer", () => {
  const beantwoord = (minutenGeleden: number, status: "ready" | "blocked" = "ready") =>
    check({
      status,
      askedAt: geleden(minutenGeleden + 1),
      answeredAt: geleden(minutenGeleden),
      answeredBy: "Medewerker",
    });

  it("geldt vlak na het antwoord", () => {
    expect(readyToPrint([beantwoord(1)], nu)?.id).toBe("c1");
  });

  it("vervalt na een half uur", () => {
    // "De printer staat klaar" was waar toen iemand keek. Die printer staat in
    // een ruimte waar mensen langslopen; na een half uur is het een gok.
    expect(readyToPrint([beantwoord(answerValidMinutes + 1)], nu)).toBeNull();
    expect(latestAnswered([beantwoord(answerValidMinutes + 1)], nu)).toBeNull();
  });

  it("geldt tot vlak vóór die grens", () => {
    expect(readyToPrint([beantwoord(answerValidMinutes - 1)], nu)?.id).toBe("c1");
  });

  it("laat ook een oud 'niet klaar' vervallen", () => {
    // Anders blijft er staan dat de printer stuk is terwijl hij al lang weer
    // draait.
    expect(latestAnswered([beantwoord(answerValidMinutes + 5, "blocked")], nu)).toBeNull();
  });

  it("vervalt meteen zodra Noviply is gaan printen", () => {
    const geprint = { ...beantwoord(1), closedAt: geleden(0) };
    expect(readyToPrint([geprint], nu)).toBeNull();
  });

  it("pakt het nieuwste antwoord als er meerdere zijn", () => {
    const oud = { ...beantwoord(20), id: "oud" };
    const nieuw = { ...beantwoord(2), id: "nieuw" };
    expect(latestAnswered([oud, nieuw], nu)?.id).toBe("nieuw");
  });
});

describe("noviply print nu", () => {
  it("blijft kort staan en verdwijnt daarna", () => {
    const net = check({ status: "ready", answeredAt: geleden(10), closedAt: geleden(1) });
    const lang = check({ status: "ready", answeredAt: geleden(60), closedAt: geleden(30) });
    expect(printingNow([net], nu)).not.toBeNull();
    expect(printingNow([lang], nu)).toBeNull();
  });
});
