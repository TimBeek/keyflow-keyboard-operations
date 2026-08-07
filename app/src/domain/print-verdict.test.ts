import { describe, expect, it } from "vitest";
import {
  printVerdictFor,
  printVerdictIndex,
  printVerdicts,
} from "./print-verdict";
import type { PrintBatch } from "./print-batch";
import type { PrintRequestRecord } from "./print-requests";
import type { NoviplyUnavailableRecord } from "./noviply-availability";

function ronde(rows: Partial<PrintBatch["rows"][number]>[], overrides: Partial<PrintBatch> = {}): PrintBatch {
  return {
    id: "b1",
    batchNumber: 1,
    runDate: "2026-08-05",
    uploadedAt: "2026-08-05T07:00:00.000Z",
    uploadedBy: "Ordersysteem",
    source: "resync",
    fileName: "",
    deletedAt: null,
    seenAt: null,
    settledAt: null,
    ...overrides,
    rows: rows.map((row, index) => ({
      id: `r${index}`,
      model: "HP ProBook 440 G4",
      languageCode: "BE",
      layout: "AZERTY BE",
      variant: "E1",
      quantity: 1,
      orderReference: `600000${index}`,
      status: "not_printable",
      note: "Don't have it",
      handledAt: "2026-08-05T09:00:00.000Z",
      handledBy: "Noviply",
      ...row,
    })) as PrintBatch["rows"],
  } as PrintBatch;
}

function aanvraag(overrides: Partial<PrintRequestRecord> = {}): PrintRequestRecord {
  return {
    id: "q1",
    brand: "HP",
    model: "HP EliteBook 840 G5",
    layout: "QWERTY PT",
    variant: "E1",
    quantity: 1,
    orderReference: "6000017117",
    status: "not_printable",
    note: "was double in the list",
    requestedAt: "2026-08-06T13:00:00.000Z",
    requestedBy: "Werkvloer",
    handledAt: "2026-08-06T13:21:00.000Z",
    handledBy: "Noviply",
    ...overrides,
  } as PrintRequestRecord;
}

function blokkade(overrides: Partial<NoviplyUnavailableRecord> = {}): NoviplyUnavailableRecord {
  return {
    id: "blk1",
    model: "Lenovo B50-80",
    modelKey: "lenovo b50 80",
    layout: "",
    reason: "model_unknown",
    note: "wij hebben dit toetsenbord niet",
    recordedAt: "2026-08-06T14:52:00.000Z",
    recordedBy: "Noviply",
    ...overrides,
  };
}

describe("alles wat Noviply niet kon printen", () => {
  it("brengt rondes, aanvragen en blokkades op één lijst", () => {
    const lijst = printVerdicts([ronde([{}])], [aanvraag()], [blokkade()]);
    expect(lijst.map((oordeel) => oordeel.model).sort()).toEqual([
      "HP EliteBook 840 G5", "HP ProBook 440 G4", "Lenovo B50-80",
    ]);
  });

  it("voegt dezelfde laptop in dezelfde taal samen, met alle orders erbij", () => {
    // Dit is wat de aandachtslijst onleesbaar maakte: vier keer dezelfde zin,
    // waarbij alleen in het grijze onderregeltje stond wat er anders was.
    const lijst = printVerdicts([ronde([{}, {}, {}])], [], []);
    expect(lijst).toHaveLength(1);
    expect(lijst[0].orders).toEqual(["6000000", "6000001", "6000002"]);
  });

  it("houdt verschillende talen van hetzelfde model uit elkaar", () => {
    const lijst = printVerdicts([
      ronde([
        { id: "a", languageCode: "BE", layout: "AZERTY BE" },
        { id: "b", languageCode: "FR", layout: "AZERTY FR" },
      ]),
    ], [], []);
    expect(lijst).toHaveLength(2);
  });

  it("laat een afkeuring vervallen zodra hetzelfde later wél is geprint", () => {
    const lijst = printVerdicts([
      ronde([
        { id: "oud", status: "not_printable", handledAt: "2026-08-01T09:00:00.000Z" },
        { id: "nieuw", status: "printed", handledAt: "2026-08-05T09:00:00.000Z" },
      ]),
    ], [], []);
    expect(lijst).toHaveLength(0);
  });

  it("laat een blokkade juist niet vervallen door een latere geslaagde print", () => {
    // Een blokkade is een uitspraak over morgen; die gaat er alleen af doordat
    // iemand zegt dat het weer kan.
    const lijst = printVerdicts(
      [ronde([{ status: "printed", handledAt: "2026-08-07T09:00:00.000Z" }])],
      [],
      [blokkade({ model: "HP ProBook 440 G4", modelKey: "hp probook 440 g4" })],
    );
    expect(lijst).toHaveLength(1);
    expect(lijst[0].blockId).toBe("blk1");
  });

  it("telt ook rondes mee die uit de lijst zijn gehaald", () => {
    // Een ronde weghalen is je werklijst opruimen, geen verklaring dat het
    // toch printbaar was.
    const lijst = printVerdicts([ronde([{}], { deletedAt: "2026-08-06T10:00:00.000Z" })], [], []);
    expect(lijst).toHaveLength(1);
  });

  it("zet wat het advies stilzet bovenaan", () => {
    const lijst = printVerdicts([ronde([{}])], [], [blokkade()]);
    expect(lijst[0].blockId).toBe("blk1");
    expect(lijst[1].blockId).toBeNull();
  });

  it("telt een ingetrokken aanvraag niet mee", () => {
    // Die trekt de werkvloer zelf in omdat de laptop al af was; Noviply heeft
    // hem nooit gezien. Als afkeuring tellen zet een verzonnen regel op hun
    // scherm.
    const lijst = printVerdicts([], [aanvraag({ status: "cancelled", note: "" })], []);
    expect(lijst).toHaveLength(0);
  });

  it("laat een ingetrokken aanvraag een echte afkeuring niet verdringen", () => {
    // De intrekking is het nieuwst en zou anders de reden overschrijven.
    const lijst = printVerdicts([], [
      aanvraag({ id: "oud", note: "we do not have this", handledAt: "2026-08-01T09:00:00.000Z" }),
      aanvraag({ id: "nieuw", status: "cancelled", note: "", handledAt: "2026-08-06T09:00:00.000Z" }),
    ], []);
    expect(lijst).toHaveLength(1);
    expect(lijst[0].note).toBe("we do not have this");
  });

  it("negeert regels die nog openstaan", () => {
    const lijst = printVerdicts([ronde([{ status: "open", handledAt: null }])], [], []);
    expect(lijst).toHaveLength(0);
  });
});

describe("wat weten wij over dit model in deze taal", () => {
  it("vindt een blokkade op precies deze taal", () => {
    const index = printVerdictIndex(printVerdicts([], [], [
      blokkade({ model: "Dell Latitude 5320", modelKey: "dell latitude 5320", layout: "QWERTY ES" }),
    ]));
    expect(printVerdictFor(index, "Dell Latitude 5320", "QWERTY ES")?.blockId).toBe("blk1");
    expect(printVerdictFor(index, "Dell Latitude 5320", "AZERTY BE")).toBeNull();
  });

  it("laat een blokkade zonder taal voor elke taal gelden", () => {
    // "Wij hebben dit toetsenbord niet" gaat over het model, niet over één taal.
    const index = printVerdictIndex(printVerdicts([], [], [blokkade()]));
    expect(printVerdictFor(index, "Lenovo B50-80", "AZERTY FR")?.blockId).toBe("blk1");
    expect(printVerdictFor(index, "Lenovo B50-80", "QWERTY NL")?.blockId).toBe("blk1");
  });

  it("trekt zich niets aan van hoofdletters en leestekens in de modelnaam", () => {
    const index = printVerdictIndex(printVerdicts([ronde([{}])], [], []));
    expect(printVerdictFor(index, "hp  probook 440-g4", "AZERTY BE")).not.toBeNull();
  });

  it("verwart een langere modelnaam niet met een kortere", () => {
    // De oude koppeling zocht met startsWith; een blokkade op "HP ProBook 450 G1"
    // pakte daardoor ook "HP ProBook 450 G10".
    const index = printVerdictIndex(printVerdicts([], [], [
      blokkade({ model: "HP ProBook 450 G1", modelKey: "hp probook 450 g1" }),
    ]));
    expect(printVerdictFor(index, "HP ProBook 450 G10", "AZERTY BE")).toBeNull();
  });

  it("laat een lopende taalblokkade voorgaan op een oude modelbrede mededeling", () => {
    // Modelbreed ging altijd voor, ook als het maar een mededeling was — en
    // verborg dan de blokkade die er wél toe doet.
    const index = printVerdictIndex(printVerdicts(
      [ronde([{ id: "los", languageCode: "", layout: "" }])],
      [],
      [blokkade({ model: "HP ProBook 440 G4", modelKey: "hp probook 440 g4", layout: "AZERTY BE" })],
    ));
    expect(printVerdictFor(index, "HP ProBook 440 G4", "AZERTY BE")?.blockId).toBe("blk1");
  });

  it("zwijgt over een taal die niet is afgekeurd", () => {
    const index = printVerdictIndex(printVerdicts([ronde([{}])], [], []));
    expect(printVerdictFor(index, "HP ProBook 440 G4", "QWERTY NL")).toBeNull();
  });
});
