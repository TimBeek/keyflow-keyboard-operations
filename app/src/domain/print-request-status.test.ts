import { describe, expect, it } from "vitest";
import type { PrintRequestRecord } from "./print-requests";
import {
  oldestOpen,
  openCount,
  reminderAfterHours,
  waitingTooLong,
  groupPrintRequests,
  isFresh,
  printRequestHeadline,
} from "./print-request-status";

const now = new Date("2026-07-29T17:00:00.000Z");

function request(
  id: string,
  status: PrintRequestRecord["status"],
  handledHoursAgo: number | null = null,
): PrintRequestRecord {
  return {
    id,
    brand: "Dell",
    model: `Dell Latitude ${id}`,
    layout: "QWERTZ DE",
    variant: "E1",
    orderReference: id,
    reason: "",
    requestedAt: "2026-07-29T09:00:00.000Z",
    requestedBy: "Medewerker",
    status,
    handledAt: handledHoursAgo === null
      ? null
      : new Date(now.getTime() - handledHoursAgo * 3_600_000).toISOString(),
    handledBy: handledHoursAgo === null ? null : "Noviply",
    quantity: 1,
    note: "",
  };
}

describe("groupPrintRequests", () => {
  it("scheidt klaar, wachtend en geblokkeerd", () => {
    const groups = groupPrintRequests([
      request("1", "printed", 1),
      request("2", "requested"),
      request("3", "not_printable", 2),
    ]);

    expect(groups.ready.map((r) => r.id)).toEqual(["1"]);
    expect(groups.waiting.map((r) => r.id)).toEqual(["2"]);
    expect(groups.blocked.map((r) => r.id)).toEqual(["3"]);
  });

  it("zet het laatst afgehandelde bovenaan", () => {
    const groups = groupPrintRequests([
      request("oud", "printed", 5),
      request("nieuw", "printed", 1),
    ]);

    expect(groups.ready[0].id).toBe("nieuw");
  });
});

describe("wat er nog bij Noviply staat", () => {
  it("telt alleen wat nog openstaat", () => {
    // Dat is het getal dat de werkvloer wil zien: "ik heb er zoveel uitstaan".
    const requests = [
      request("wacht1", "requested"),
      request("wacht2", "requested"),
      request("klaar", "printed", 1),
      request("kan niet", "not_printable", 1),
    ];

    expect(openCount(requests)).toBe(2);
  });

  it("valt weg zodra alles is afgehandeld", () => {
    expect(openCount([request("klaar", "printed", 1)])).toBe(0);
  });

  it("rekent een aanvraag zonder afhandeling niet als nieuw", () => {
    expect(isFresh(request("1", "requested"), now)).toBe(false);
  });

  it("valt niet om over een onleesbaar tijdstip", () => {
    const broken = { ...request("1", "printed", 1), handledAt: "geen datum" };

    expect(isFresh(broken, now)).toBe(false);
  });
});

describe("printRequestHeadline", () => {
  it("zet wat opgehaald kan worden bovenaan", () => {
    const groups = groupPrintRequests([request("1", "printed", 1), request("2", "requested")]);

    expect(printRequestHeadline(groups)).toContain("ligt klaar");
  });

  it("noemt een blokkade als er niets klaarligt", () => {
    const groups = groupPrintRequests([request("1", "not_printable", 1)]);

    expect(printRequestHeadline(groups)).toContain("kan niet geprint");
  });

  it("zwijgt netjes als er niets openstaat", () => {
    expect(printRequestHeadline(groupPrintRequests([]))).toContain("niets open");
  });
});

describe("herinneren aan Noviply", () => {
  it("zwijgt zolang er niets te lang wacht", () => {
    // De vaste requestedAt in de hulpfunctie ligt uren terug; hier hoort een
    // aanvraag van net.
    const net = { ...request("net", "requested"), requestedAt: now.toISOString() };

    expect(waitingTooLong([net], now)).toBe(false);
    expect(waitingTooLong([], now)).toBe(false);
  });

  it("slaat aan zodra de oudste aanvraag te lang staat", () => {
    const oud = {
      ...request("oud", "requested"),
      requestedAt: new Date(now.getTime() - (reminderAfterHours + 1) * 3_600_000).toISOString(),
    };

    expect(waitingTooLong([oud], now)).toBe(true);
    expect(oldestOpen([oud])?.id).toBe("oud");
  });

  it("kijkt naar de oudste, niet naar de nieuwste", () => {
    const oud = {
      ...request("oud", "requested"),
      requestedAt: new Date(now.getTime() - (reminderAfterHours + 2) * 3_600_000).toISOString(),
    };
    const nieuw = { ...request("nieuw", "requested"), requestedAt: now.toISOString() };

    expect(waitingTooLong([nieuw, oud], now)).toBe(true);
    expect(oldestOpen([nieuw, oud])?.id).toBe("oud");
  });

  it("negeert een afgehandelde aanvraag die lang geleden is gedaan", () => {
    const oud = {
      ...request("oud", "printed", 1),
      requestedAt: new Date(now.getTime() - 99 * 3_600_000).toISOString(),
    };

    expect(waitingTooLong([oud], now)).toBe(false);
  });
});
