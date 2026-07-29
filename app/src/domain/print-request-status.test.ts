import { describe, expect, it } from "vitest";
import type { PrintRequestRecord } from "./print-requests";
import {
  attentionCount,
  freshHours,
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

describe("wat om aandacht vraagt", () => {
  it("telt alleen wat kortgeleden is afgehandeld", () => {
    const requests = [
      request("vers", "printed", 1),
      request("oud", "printed", freshHours + 1),
      request("wacht", "requested"),
    ];

    expect(attentionCount(requests, now)).toBe(1);
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
