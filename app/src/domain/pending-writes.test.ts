import { describe, expect, it } from "vitest";
import {
  addPendingWrite,
  pendingWriteLimit,
  pendingWritesMessage,
  readPendingWrites,
  removePendingWrite,
  type PendingWrite,
} from "./pending-writes";

const write = (id: string): PendingWrite => ({
  kind: "mutation",
  id,
  payload: { sku: "NB10052E1NL" },
});

describe("wachtrij voor handelingen zonder verbinding", () => {
  it("bewaart een handeling zodat de medewerker door kan", () => {
    expect(addPendingWrite([], write("a"))).toHaveLength(1);
  });

  it("zet dezelfde handeling niet twee keer in de rij", () => {
    const queue = addPendingWrite([write("a")], write("a"));

    expect(queue).toHaveLength(1);
  });

  it("haalt een geslaagde handeling eruit", () => {
    expect(removePendingWrite([write("a"), write("b")], "a")).toEqual([write("b")]);
  });

  it("laat de rij niet eindeloos groeien", () => {
    let queue: PendingWrite[] = [];
    for (let index = 0; index < pendingWriteLimit + 10; index += 1) {
      queue = addPendingWrite(queue, write(`w${index}`));
    }

    expect(queue).toHaveLength(pendingWriteLimit);
    // De nieuwste blijven staan: die zijn het meest waard om alsnog te sturen.
    expect(queue[queue.length - 1].id).toBe(`w${pendingWriteLimit + 9}`);
  });
});

describe("readPendingWrites", () => {
  it("leest een bewaarde rij terug", () => {
    expect(readPendingWrites(JSON.stringify([write("a")]))).toHaveLength(1);
  });

  it("geeft een lege rij bij onleesbare opslag in plaats van te blijven hangen", () => {
    expect(readPendingWrites("{kapot")).toEqual([]);
    expect(readPendingWrites(null)).toEqual([]);
    expect(readPendingWrites(JSON.stringify({ geen: "lijst" }))).toEqual([]);
  });

  it("laat regels vallen die niet kloppen, en houdt de rest", () => {
    const raw = JSON.stringify([write("a"), { kind: "onzin" }, null, write("b")]);

    expect(readPendingWrites(raw).map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("pendingWritesMessage", () => {
  it("zwijgt als er niets wacht", () => {
    expect(pendingWritesMessage(0)).toBe("");
  });

  it("telt in gewone taal", () => {
    expect(pendingWritesMessage(1)).toContain("1 handeling");
    expect(pendingWritesMessage(3)).toContain("3 handelingen");
  });
});

describe("Wat er na een paginaherlading overblijft", () => {
  it("houdt een apart gelegde laptop vast", () => {
    // Deze soort ontbrak in de lijst, waardoor de laptop uit de wachtrij viel
    // bij het herladen — terwijl hij wel apart op de werkbank stond.
    const bewaard = JSON.stringify([
      { kind: "runWaitlist", id: "wachtronde-1", payload: { orderReference: "1859" } },
    ]);

    expect(readPendingWrites(bewaard)).toHaveLength(1);
  });

  it("gooit onbekende soorten wel weg", () => {
    const bewaard = JSON.stringify([{ kind: "verzonnen", id: "x", payload: {} }]);

    expect(readPendingWrites(bewaard)).toHaveLength(0);
  });
});
