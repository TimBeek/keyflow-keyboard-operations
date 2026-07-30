import { describe, expect, it } from "vitest";
import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import { attentionByKind, attentionItems, type AttentionInput } from "./attention";
import type { PrintBatch } from "./print-batch";
import type { PrintRequestRecord } from "./print-requests";
import type { StickerVerificationReport } from "./sticker-verification";

/**
 * Problemen ontstonden op vier plekken en werden op vier plekken bewaard. Wie
 * moest weten wat er vandaag misloopt had vier schermen nodig.
 */

const leeg: AttentionInput = {
  verificationReports: [],
  printRequests: [],
  printBatches: [],
  catalog: [],
  quantities: {},
};

function report(overrides: Partial<StickerVerificationReport> = {}): StickerVerificationReport {
  return {
    id: "v1",
    occurredAt: "2026-07-30T10:00:00.000Z",
    orderReference: "000100001",
    sku: "NB10172E1NL",
    storageNumber: 75,
    model: "Dell Latitude 5420",
    targetLayout: "QWERTY NL",
    variant: "E1",
    outcome: "scrapped",
    failureReason: "wrong_layout",
    actor: "Medewerker",
    ...overrides,
  };
}

function request(overrides: Partial<PrintRequestRecord> = {}): PrintRequestRecord {
  return {
    id: "a1",
    brand: "HP",
    model: "HP ProBook 430 G8",
    layout: "AZERTY BE",
    variant: "E1",
    orderReference: "000100002",
    reason: "",
    requestedAt: "2026-07-30T09:00:00.000Z",
    requestedBy: "Medewerker",
    status: "not_printable",
    handledAt: "2026-07-30T11:00:00.000Z",
    handledBy: "Noviply",
    note: "Model staat niet in onze lijst",
    quantity: 1,
    ...overrides,
  };
}

function batch(overrides: Partial<PrintBatch> = {}): PrintBatch {
  return {
    id: "b1",
    runDate: "2026-07-30",
    batchNumber: 2,
    fileName: "batch-2-30-07-2026.xlsx",
    uploadedAt: "2026-07-30T08:00:00.000Z",
    uploadedBy: "Tim Beek",
    seenAt: null,
    deletedAt: null,
    rows: [
      {
        id: "r1", lineNumber: 1, model: "Lenovo B50-80", languageCode: "BE",
        layout: "AZERTY BE", variant: "E1", quantity: 1, orderReference: "000100003",
        status: "not_printable", note: "Vel scheurt",
        handledAt: "2026-07-30T12:00:00.000Z", handledBy: "Noviply",
      },
      {
        id: "r2", lineNumber: 2, model: "HP EliteBook 840", languageCode: "XX",
        layout: "", variant: "E1", quantity: 1, orderReference: "000100004",
        status: "open", note: "", handledAt: null, handledBy: null,
      },
    ],
    ...overrides,
  };
}

const hangmap = {
  catalogKey: "hangmap-131",
  storageNumber: 131,
  sku: "NB10209E1NL",
  model: "Fujitsu Lifebook E5410",
  layout: "QWERTY US",
  dataQuality: "ready",
  stock: 0,
} as unknown as InventoryCatalogItem;

describe("attentionItems", () => {
  it("meldt een vel dat niet paste", () => {
    const items = attentionItems({ ...leeg, verificationReports: [report()] });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "sheet_mismatch",
      title: "Dell Latitude 5420 · hangmap 75",
      orderReference: "000100001",
    });
  });

  it("laat een geslaagde controle weg", () => {
    // Wat goed ging hoeft niemand te zien.
    const items = attentionItems({
      ...leeg,
      verificationReports: [report({ outcome: "passed", failureReason: undefined })],
    });

    expect(items).toHaveLength(0);
  });

  it("meldt wat Noviply niet kan printen, uit een aanvraag én uit een ronde", () => {
    const items = attentionItems({ ...leeg, printRequests: [request()], printBatches: [batch()] });
    const kanNiet = items.filter((item) => item.kind === "cannot_print");

    expect(kanNiet).toHaveLength(2);
    expect(kanNiet.map((item) => item.orderReference)).toContain("000100002");
    expect(kanNiet.map((item) => item.orderReference)).toContain("000100003");
  });

  it("neemt de reden mee, want daar kan de werkvloer iets mee", () => {
    const items = attentionItems({ ...leeg, printRequests: [request()] });

    expect(items[0].detail).toBe("Model staat niet in onze lijst");
  });

  it("zegt het ook als er geen reden is opgegeven", () => {
    const items = attentionItems({ ...leeg, printRequests: [request({ note: "" })] });

    expect(items[0].detail).toBe("Geen reden opgegeven.");
  });

  it("meldt een lege hangmap", () => {
    const items = attentionItems({ ...leeg, catalog: [hangmap], quantities: {} });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "empty_folder", title: "Hangmap 131 · Fujitsu Lifebook E5410" });
  });

  it("meldt een hangmap niet zodra er weer iets in ligt", () => {
    const items = attentionItems({ ...leeg, catalog: [hangmap], quantities: { "hangmap-131": 4 } });

    expect(items).toHaveLength(0);
  });

  it("laat een geblokkeerde hangmap erbuiten", () => {
    // Die is nooit operationeel geweest; leeg is daar geen probleem maar de stand.
    const geblokkeerd = { ...hangmap, dataQuality: "blocked" } as InventoryCatalogItem;

    expect(attentionItems({ ...leeg, catalog: [geblokkeerd] })).toHaveLength(0);
  });

  it("meldt een taalcode die de app niet kent", () => {
    const items = attentionItems({ ...leeg, printBatches: [batch()] });
    const taal = items.filter((item) => item.kind === "unknown_language");

    expect(taal).toHaveLength(1);
    expect(taal[0].title).toContain("XX");
    expect(taal[0].detail).toContain("Batch 2 · 30-07");
  });

  it("kijkt niet meer naar een ronde die uit de lijst is gehaald", () => {
    const uitLijst = batch({ deletedAt: "2026-08-01T09:00:00.000Z" });
    const taal = attentionItems({ ...leeg, printBatches: [uitLijst] })
      .filter((item) => item.kind === "unknown_language");

    expect(taal).toHaveLength(0);
  });

  it("zet het meest recente bovenaan", () => {
    const items = attentionItems({
      ...leeg,
      verificationReports: [report()],
      printRequests: [request()],
      printBatches: [batch()],
    });

    expect(items[0].occurredAt).toBe("2026-07-30T12:00:00.000Z");
  });
});

describe("attentionByKind", () => {
  it("groepeert zodat elk soort zijn eigen kopje krijgt", () => {
    const per = attentionByKind(attentionItems({
      ...leeg,
      verificationReports: [report()],
      printRequests: [request()],
      catalog: [hangmap],
    }));

    expect([...per.keys()].sort()).toEqual(["cannot_print", "empty_folder", "sheet_mismatch"]);
    expect(per.get("empty_folder")).toHaveLength(1);
  });
});
