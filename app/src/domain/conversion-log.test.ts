import { describe, expect, it } from "vitest";
import {
  ConversionLogError,
  createConversionLogEntry,
  type ConversionLogInput,
} from "./conversion-log";

const metadata = {
  id: "log-1",
  occurredAt: "2026-07-29T09:00:00.000Z",
  actor: "Medewerker",
};

const baseInput: ConversionLogInput = {
  method: "loose_stickers",
  status: "completed",
  model: "Dell Latitude 5420",
  targetLayout: "AZERTY FR",
};

describe("createConversionLogEntry", () => {
  it("legt ook een conversie zonder voorraadgevolg vast", () => {
    const entry = createConversionLogEntry(baseInput, metadata);

    expect(entry.method).toBe("loose_stickers");
    expect(entry.sku).toBe("");
    expect(entry.storageNumber).toBeNull();
    expect(entry.actor).toBe("Medewerker");
  });

  it("bewaart hangmap en artikelnummer wanneer er wel een vel is gebruikt", () => {
    const entry = createConversionLogEntry({
      ...baseInput,
      method: "noviply_sheet",
      sku: " nb10052e1nl ",
      storageNumber: 1,
      variant: "E1",
      orderReference: " 1859 ",
    }, metadata);

    expect(entry.sku).toBe("NB10052E1NL");
    expect(entry.storageNumber).toBe(1);
    expect(entry.orderReference).toBe("1859");
  });

  it("houdt een aanvraag bij Noviply apart van een afgeronde conversie", () => {
    const entry = createConversionLogEntry(
      { ...baseInput, method: "printed_sticker", status: "awaiting_print" },
      metadata,
    );

    expect(entry.status).toBe("awaiting_print");
  });

  it("weigert een conversie zonder model", () => {
    expect(() => createConversionLogEntry({ ...baseInput, model: "  " }, metadata))
      .toThrow(ConversionLogError);
  });

  it("weigert een conversie zonder uitvoerder", () => {
    expect(() => createConversionLogEntry(baseInput, { ...metadata, actor: " " }))
      .toThrow(ConversionLogError);
  });
});
