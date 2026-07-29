import { describe, expect, it } from "vitest";
import { recommendConversion } from "./conversion-policy";

const base = {
  thresholdEur: 300,
  // Bewust niet QWERTY US: dat telt als dezelfde taal als QWERTY NL, en dan
  // adviseert de motor terecht "geen conversie".
  currentLayout: "AZERTY FR",
  targetLayout: "QWERTY NL",
  workload: "normal" as const,
  available: {
    loose_stickers: false,
    noviply_sheet: true,
    printed_sticker: true,
    direct_reprint: true,
  },
  compatible: {
    loose_stickers: true,
    noviply_sheet: true,
    printed_sticker: true,
    direct_reprint: true,
  },
};

describe("uitzondering per doeltaal", () => {
  it("gaat voor op de waarderegel", () => {
    // Een laptop van 500 euro zou normaal een toetsenbordsprint krijgen.
    const zonder = recommendConversion({ ...base, saleValueEur: 500 });
    const met = recommendConversion({
      ...base,
      saleValueEur: 500,
      layoutRules: [{ layout: "QWERTY NL", method: "printed_sticker", note: "" }],
    });

    expect(zonder.primary).toBe("direct_reprint");
    expect(met.primary).toBe("printed_sticker");
    expect(met.policy.rule).toBe("layout_rule");
  });

  it("raakt andere talen niet", () => {
    const result = recommendConversion({
      ...base,
      targetLayout: "QWERTZ DE",
      saleValueEur: 500,
      layoutRules: [{ layout: "QWERTY NL", method: "printed_sticker", note: "" }],
    });

    expect(result.primary).toBe("direct_reprint");
  });

  it("rekent QWERTY NL en QWERTY US als dezelfde taal", () => {
    const result = recommendConversion({
      ...base,
      targetLayout: "QWERTY US",
      saleValueEur: 500,
      layoutRules: [{ layout: "QWERTY NL", method: "printed_sticker", note: "" }],
    });

    expect(result.primary).toBe("printed_sticker");
  });

  it("toont de eigen toelichting als die er is", () => {
    const result = recommendConversion({
      ...base,
      saleValueEur: 500,
      layoutRules: [{
        layout: "QWERTY NL",
        method: "printed_sticker",
        note: "Nederlandse klanten klagen over losse stickers.",
      }],
    });

    expect(result.reason).toBe("Nederlandse klanten klagen over losse stickers.");
  });

  it("valt terug op het gewone advies als de ingestelde methode niet kan", () => {
    // Uitgeschakelde methode: de regel mag geen advies opleveren dat niet
    // uitvoerbaar is.
    const result = recommendConversion({
      ...base,
      saleValueEur: 500,
      available: { ...base.available, printed_sticker: false },
      layoutRules: [{ layout: "QWERTY NL", method: "printed_sticker", note: "" }],
    });

    expect(result.primary).toBe("direct_reprint");
    expect(result.warnings.join(" ")).toContain("niet beschikbaar");
  });
});
