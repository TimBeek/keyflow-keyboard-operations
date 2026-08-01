import { describe, expect, it } from "vitest";
import {
  PrintBatchError,
  activeBatches,
  batchDateLabel,
  batchIsDone,
  batchLabel,
  batchNumberFromFileName,
  batchRowForOrder,
  batchRunDate,
  batchRunName,
  batchSheetCount,
  completedBatches,
  layoutForBatchCode,
  listedBatches,
  openBatchRows,
  parsePrintBatch,
  type PrintBatch,
  unknownLanguageRows,
  unseenBatches,
} from "./print-batch";

/** Zoals het bestand er werkelijk uitkomt: datum, koprij, regels, lege staart. */
const echteVorm: unknown[][] = [
  [new Date(2026, 6, 30), null, null, null, null],
  ["Model", "Language", "Layout", "Quantity", "Ordernummer"],
  ["HP ProBook 430 G8", "BE", "E1", 1, "000099263"],
  ["HP EliteBook 840 G8", "ES", "E1", 1, "000099293"],
  ["Dell Latitude 5420", "NL", "E1", 2, "000099278"],
  ["", "", "", "", ""],
  [null, null, null, null, null],
];

describe("parsePrintBatch", () => {
  it("leest datum en regels en laat de lege staart weg", () => {
    const batch = parsePrintBatch(echteVorm);

    expect(batch.runDate).toBe("2026-07-30");
    expect(batch.rows).toHaveLength(3);
    expect(batch.rows[0]).toMatchObject({
      lineNumber: 1,
      model: "HP ProBook 430 G8",
      languageCode: "BE",
      layout: "AZERTY BE",
      variant: "E1",
      quantity: 1,
      orderReference: "000099263",
    });
  });

  it("neemt een aantal groter dan één over", () => {
    expect(parsePrintBatch(echteVorm).rows[2].quantity).toBe(2);
  });

  it("loopt stuk als de koprij verandert", () => {
    // Anders levert een verschoven export stil een lijst met de verkeerde
    // kolommen op, en dat merkt niemand tot Noviply het verkeerde print.
    const verschoven = [
      echteVorm[0],
      ["Model", "Taal", "Layout", "Aantal", "Order"],
      echteVorm[2],
    ];

    expect(() => parsePrintBatch(verschoven)).toThrow(PrintBatchError);
  });

  it("volgt de koprij en niet de kolomvolgorde", () => {
    const anders = [
      echteVorm[0],
      ["Ordernummer", "Model", "Quantity", "Language", "Layout"],
      ["000099999", "Dell Latitude 5310", 3, "NL", "E2"],
    ];
    const batch = parsePrintBatch(anders);

    expect(batch.rows[0]).toMatchObject({
      model: "Dell Latitude 5310",
      orderReference: "000099999",
      quantity: 3,
      languageCode: "NL",
      variant: "E2",
    });
  });

  it("weigert een bestand zonder regels", () => {
    expect(() => parsePrintBatch([
      echteVorm[0],
      echteVorm[1],
      ["", "", "", "", ""],
    ])).toThrow(PrintBatchError);
  });

  it("weigert een onleesbare datum", () => {
    expect(() => parsePrintBatch([["gisteren"], echteVorm[1], echteVorm[2]]))
      .toThrow(PrintBatchError);
  });
});

describe("batchRunDate", () => {
  it("begrijpt de Nederlandse notatie uit de csv", () => {
    expect(batchRunDate("30-7-2026")).toBe("2026-07-30");
    expect(batchRunDate("1-1-2027")).toBe("2027-01-01");
  });

  it("begrijpt een echte datum uit de xlsx", () => {
    expect(batchRunDate(new Date(2026, 11, 5))).toBe("2026-12-05");
  });
});

describe("batchNumberFromFileName", () => {
  it("haalt het rondenummer uit de bestandsnaam", () => {
    expect(batchNumberFromFileName("batch-2-30-07-2026.xlsx")).toBe(2);
    expect(batchNumberFromFileName("Batch 1 30-07-2026.csv")).toBe(1);
  });

  it("geeft niets terug als het er niet in staat", () => {
    // Dan hoort iemand het zelf te zeggen in plaats van dat we gokken.
    expect(batchNumberFromFileName("orders-30-07-2026.xlsx")).toBeNull();
  });
});

describe("layoutForBatchCode", () => {
  it("zet de landcode om naar een taal die de app kent", () => {
    expect(layoutForBatchCode("nl")).toBe("QWERTY NL");
    expect(layoutForBatchCode(" BE ")).toBe("AZERTY BE");
  });

  it("geeft leeg terug bij een onbekende code", () => {
    expect(layoutForBatchCode("XX")).toBe("");
  });
});

/* ---------- wat de schermen ervan willen weten ---------- */

function batch(overrides: Partial<PrintBatch> = {}): PrintBatch {
  return {
    id: "b1",
    runDate: "2026-07-30",
    batchNumber: 2,
    fileName: "batch-2-30-07-2026.xlsx",
    uploadedAt: "2026-07-30T10:28:00.000Z",
    uploadedBy: "Tim Beek",
    deletedAt: null,
    seenAt: null,
    rows: [
      {
        id: "r1", lineNumber: 1, model: "Dell Latitude 5420", languageCode: "NL",
        layout: "QWERTY NL", variant: "E1", quantity: 2, orderReference: "000099278",
        status: "open", note: "", handledAt: null, handledBy: null,
      },
      {
        id: "r2", lineNumber: 2, model: "HP ProBook 430 G8", languageCode: "XX",
        layout: "", variant: "E1", quantity: 1, orderReference: "000099263",
        status: "printed", note: "", handledAt: "2026-07-30T12:40:00.000Z", handledBy: "Noviply",
      },
    ],
    ...overrides,
  };
}

describe("tellingen", () => {
  it("telt vellen en niet regels", () => {
    expect(batchSheetCount(batch())).toBe(3);
  });

  it("telt wat er nog open staat", () => {
    expect(openBatchRows(batch())).toBe(1);
  });

  it("markeert regels waarvan de taal onbekend is", () => {
    expect(unknownLanguageRows(batch()).map((row) => row.orderReference)).toEqual(["000099263"]);
  });
});

describe("voltooid of niet", () => {
  it("noemt een ronde voltooid als er niets meer openstaat", () => {
    const af = batch({
      rows: batch().rows.map((row) => ({
        ...row, status: "printed" as const,
        handledAt: "2026-07-30T12:40:00.000Z", handledBy: "Noviply",
      })),
    });

    expect(batchIsDone(af)).toBe(true);
    expect(batchIsDone(batch())).toBe(false);
  });

  it("scheidt wat loopt van wat af is", () => {
    const af = batch({
      id: "b0",
      rows: batch().rows.map((row) => ({
        ...row, status: "printed" as const,
        handledAt: "2026-07-30T12:40:00.000Z", handledBy: "Noviply",
      })),
    });

    expect(activeBatches([batch(), af]).map((b) => b.id)).toEqual(["b1"]);
    expect(completedBatches([batch(), af]).map((b) => b.id)).toEqual(["b0"]);
  });

  it("noemt een ronde zonder regels niet voltooid", () => {
    // Anders zou een leeg geval stilletjes als afgehandeld gelden.
    expect(batchIsDone(batch({ rows: [] }))).toBe(false);
  });
});

describe("uit de lijst gehaald", () => {
  it("verdwijnt uit de rondelijst", () => {
    const uitLijst = batch({ id: "weg", deletedAt: "2026-08-01T09:00:00.000Z" });

    expect(listedBatches([batch(), uitLijst]).map((b) => b.id)).toEqual(["b1"]);
    expect(activeBatches([uitLijst])).toHaveLength(0);
    expect(completedBatches([uitLijst])).toHaveLength(0);
  });

  it("levert ook geen melding meer op", () => {
    // Een ronde die niet meer in de lijst staat hoort niet om aandacht te vragen.
    const uitLijst = batch({ deletedAt: "2026-08-01T09:00:00.000Z", seenAt: null });

    expect(unseenBatches([uitLijst])).toHaveLength(0);
  });
});

describe("unseenBatches", () => {
  it("geeft de rondes die Noviply nog niet heeft geopend", () => {
    const gezien = batch({ id: "b0", seenAt: "2026-07-30T09:05:00.000Z" });

    expect(unseenBatches([batch(), gezien]).map((b) => b.id)).toEqual(["b1"]);
  });
});

describe("batchRowForOrder", () => {
  it("bevestigt dat een apart gelegde laptop in een ronde staat", () => {
    // Dit was anders twee lijsten naast elkaar leggen met de hand.
    const gevonden = batchRowForOrder([batch()], "000099278");

    expect(gevonden?.batch.batchNumber).toBe(2);
    expect(gevonden?.row.model).toBe("Dell Latitude 5420");
  });

  it("geeft niets terug voor een order die er niet in staat", () => {
    expect(batchRowForOrder([batch()], "000012345")).toBeNull();
    expect(batchRowForOrder([batch()], "  ")).toBeNull();
  });
});

describe("hoe een ronde heet", () => {
  it("zegt ochtend en middag in plaats van een nummer", () => {
    expect(batchRunName(1)).toBe("Ochtendronde");
    expect(batchRunName(2)).toBe("Middagronde");
    expect(batchRunName(1, "en")).toBe("Morning run");
    expect(batchRunName(2, "en")).toBe("Afternoon run");
  });

  it("noemt een derde ronde een extra ronde", () => {
    // Er komen er twee per dag. Een derde is een uitzondering en hoort niet
    // "avondronde" te heten, want dat is hij niet.
    expect(batchRunName(3)).toBe("Extra ronde 3");
    expect(batchRunName(3, "en")).toBe("Extra run 3");
  });

  it("schrijft de maand uit", () => {
    // 01-08 is hier 1 augustus en in een ander land 8 januari. Noviply zit in
    // een ander land.
    expect(batchDateLabel("2026-08-01", "nl")).toBe("1 aug");
    expect(batchDateLabel("2026-08-01", "en")).toBe("1 Aug");
    expect(batchDateLabel("2026-12-24", "en")).toBe("24 Dec");
  });

  it("hangt niet aan de klok", () => {
    // Zonder jaartal blijft dit label hetzelfde, ook volgend jaar. Anders zou
    // deze test op 1 januari omvallen zonder dat er iets veranderd is.
    expect(batchDateLabel("2025-08-01", "en")).toBe("1 Aug");
  });

  it("zet naam en datum samen", () => {
    const ronde = { runDate: "2026-08-01", batchNumber: 2 };
    expect(batchLabel(ronde, "en")).toBe("Afternoon run · 1 Aug");
    expect(batchLabel(ronde)).toBe("Middagronde · 1 aug");
  });

  it("valt terug op de ruwe datum als die niet te lezen is", () => {
    expect(batchDateLabel("onzin", "en")).toBe("onzin");
  });
});
