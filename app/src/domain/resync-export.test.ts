import { describe, expect, it } from "vitest";
import {
  normalizeResyncPayload,
  resyncFingerprint,
  resyncPayloadSchema,
  rowsForBatch,
  rowsToResync,
  unknownLanguageCodes,
} from "./resync-export";

/** Precies de lijst uit de opdracht, inclusief de dubbele eerste regel. */
const voorbeeld = [
  { model: "HP ProBook 430 G7", language: "BE", layout: "E1", quantity: 1, ordernummer: "6000016965" },
  { model: "HP ProBook 430 G7", language: "BE", layout: "E1", quantity: 1, ordernummer: "6000016965" },
  { model: "Dell Latitude 7330", language: "BE", layout: "E1", quantity: 1, ordernummer: "6000016967" },
  { model: "Dell Latitude 5320", language: "ES", layout: "E1", quantity: 1, ordernummer: "5000003967" },
  { model: "HP ProBook 440 G5", language: "FR", layout: "E1", quantity: 1, ordernummer: "4000009863" },
];

describe("levering van het ordersysteem", () => {
  it("leest de lijst uit de opdracht", () => {
    const gelezen = resyncPayloadSchema.parse(voorbeeld);
    const verzoek = normalizeResyncPayload(gelezen);
    expect(verzoek.rows).toHaveLength(5);
    expect(verzoek.runDate).toBeUndefined();
    expect(verzoek.batchNumber).toBeUndefined();
  });

  it("vertaalt de landcodes naar de talen die de app kent", () => {
    const rijen = rowsForBatch(resyncPayloadSchema.parse(voorbeeld) as never);
    expect(rijen.map((r) => r.layout)).toEqual([
      "AZERTY BE", "AZERTY BE", "AZERTY BE", "QWERTY ES", "AZERTY FR",
    ]);
    expect(rijen.map((r) => r.variant)).toEqual(["E1", "E1", "E1", "E1", "E1"]);
    expect(rijen.map((r) => r.lineNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(rijen[0].orderReference).toBe("6000016965");
  });

  it("houdt twee identieke regels apart", () => {
    // Twee laptops op dezelfde order zijn twee vellen. Ontdubbelen zou er één
    // van maken en dan komt de tweede laptop een vel tekort.
    const rijen = rowsForBatch(resyncPayloadSchema.parse(voorbeeld) as never);
    expect(rijen).toHaveLength(5);
    expect(rijen[0].orderReference).toBe(rijen[1].orderReference);
    expect(rijen[0].lineNumber).not.toBe(rijen[1].lineNumber);
  });

  it("weigert een onbekende landcode niet, maar meldt hem wel", () => {
    const rijen = resyncPayloadSchema.parse([
      { model: "HP ProBook 450 G8", language: "ZZ", layout: "E2", quantity: 1, ordernummer: "7" },
    ]);
    const verzoek = normalizeResyncPayload(rijen);
    expect(rowsForBatch(verzoek.rows)[0].layout).toBe("");
    expect(rowsForBatch(verzoek.rows)[0].model).toBe("HP ProBook 450 G8");
    expect(unknownLanguageCodes(verzoek.rows)).toEqual(["ZZ"]);
  });

  it("noemt geen enkele code onbekend als ze allemaal kloppen", () => {
    expect(unknownLanguageCodes(normalizeResyncPayload(resyncPayloadSchema.parse(voorbeeld)).rows))
      .toEqual([]);
  });

  it("neemt een ordernummer dat als getal binnenkomt ook aan", () => {
    const gelezen = resyncPayloadSchema.parse([
      { model: "Dell Latitude 5420", language: "NL", layout: "E1", quantity: 2, ordernummer: 6000016965 },
    ]);
    expect(normalizeResyncPayload(gelezen).rows[0].ordernummer).toBe("6000016965");
  });

  it("valt terug op één stuk als het aantal onleesbaar is", () => {
    const gelezen = resyncPayloadSchema.parse([
      { model: "Dell Latitude 5420", language: "NL", layout: "E1", quantity: "twee", ordernummer: "1" },
    ]);
    expect(normalizeResyncPayload(gelezen).rows[0].quantity).toBe(1);
  });

  it("accepteert de vorm met datum en rondenummer eromheen", () => {
    const gelezen = resyncPayloadSchema.parse({
      runDate: "2026-08-01",
      batchNumber: 2,
      source: "Navision",
      rows: voorbeeld,
    });
    const verzoek = normalizeResyncPayload(gelezen);
    expect(verzoek.runDate).toBe("2026-08-01");
    expect(verzoek.batchNumber).toBe(2);
    expect(verzoek.source).toBe("Navision");
    expect(verzoek.rows).toHaveLength(5);
  });

  it("weigert een lege lijst", () => {
    expect(resyncPayloadSchema.safeParse([]).success).toBe(false);
    expect(resyncPayloadSchema.safeParse({ rows: [] }).success).toBe(false);
  });

  it("weigert een regel zonder model", () => {
    expect(resyncPayloadSchema.safeParse([
      { model: "", language: "NL", layout: "E1", quantity: 1, ordernummer: "1" },
    ]).success).toBe(false);
  });

  it("weigert een datum die geen datum is", () => {
    expect(resyncPayloadSchema.safeParse({ runDate: "01-08-2026", rows: voorbeeld }).success).toBe(false);
  });

  describe("vingerafdruk", () => {
    const rijen = normalizeResyncPayload(resyncPayloadSchema.parse(voorbeeld)).rows;

    it("geeft dezelfde lijst hetzelfde getal", () => {
      const opnieuw = normalizeResyncPayload(resyncPayloadSchema.parse(voorbeeld)).rows;
      expect(resyncFingerprint(rijen)).toBe(resyncFingerprint(opnieuw));
    });

    it("geeft een gewijzigde regel een ander getal", () => {
      const anders = rijen.map((r, i) => (i === 0 ? { ...r, quantity: 2 } : r));
      expect(resyncFingerprint(anders)).not.toBe(resyncFingerprint(rijen));
    });

    it("merkt het als een regel wegvalt", () => {
      expect(resyncFingerprint(rijen.slice(0, 4))).not.toBe(resyncFingerprint(rijen));
    });

    it("merkt het als de volgorde omgaat", () => {
      // Andere volgorde is een andere ronde: Noviply werkt hem van boven naar
      // beneden af, dus de volgorde is niet toevallig.
      expect(resyncFingerprint([...rijen].reverse())).not.toBe(resyncFingerprint(rijen));
    });

    it("verwart twee velden niet met elkaar", () => {
      // Zonder scheiding tussen de velden zouden "AB"+"C" en "A"+"BC" hetzelfde
      // opleveren. Deze twee regels zijn echt verschillend en moeten dat blijven.
      const a = resyncFingerprint([{ model: "A", language: "BC", layout: "E1", quantity: 1, ordernummer: "9" }]);
      const b = resyncFingerprint([{ model: "AB", language: "C", layout: "E1", quantity: 1, ordernummer: "9" }]);
      expect(a).not.toBe(b);
    });
  });

  it("kan een ronde terugvertalen naar de vorm waarin hij binnenkwam", () => {
    const terug = rowsToResync([
      { model: "HP ProBook 430 G7", languageCode: "BE", variant: "E1", quantity: 1, orderReference: "6000016965" },
    ]);
    expect(terug[0]).toEqual({
      model: "HP ProBook 430 G7",
      language: "BE",
      layout: "E1",
      quantity: 1,
      ordernummer: "6000016965",
    });
  });
});
