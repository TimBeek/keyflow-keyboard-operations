import { describe, expect, it } from "vitest";
import {
  effectiveThreshold,
  recommendConversion,
  type ConversionPolicyInput,
} from "./conversion-policy";

const base: ConversionPolicyInput = {
  saleValueEur: 250,
  thresholdEur: 300,
  currentLayout: "AZERTY FR",
  targetLayout: "QWERTY US",
  workload: "normal",
  available: {
    loose_stickers: true,
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

describe("recommendConversion", () => {
  it("advises no conversion when layouts already match", () => {
    const result = recommendConversion({ ...base, currentLayout: "qwerty   us" });
    expect(result.primary).toBe("none");
    expect(result.policy.rule).toBe("layout_already_matches");
  });

  it("advises direct reprint at the configured premium threshold", () => {
    const result = recommendConversion({ ...base, saleValueEur: 300 });
    expect(result.primary).toBe("direct_reprint");
    expect(result.policy.rule).toBe("premium_value");
  });

  it("uses the employee value-band label in the explanation", () => {
    const result = recommendConversion({
      ...base,
      saleValueEur: 300,
      saleValueLabel: "€300 – €399",
    });
    expect(result.reason).toContain("klasse €300 – €399");
  });

  it("advises the stronger printed sticker for a foreign layout below threshold", () => {
    const result = recommendConversion({ ...base, targetLayout: "QWERTZ DE" });
    expect(result.primary).toBe("printed_sticker");
    expect(result.warnings.join(" ")).toContain("First-time-right");
  });

  it("advises the old Noviply sheet for QWERTY US below threshold", () => {
    const result = recommendConversion(base);
    expect(result.primary).toBe("noviply_sheet");
  });

  it("uses the next suitable fallback and explains why", () => {
    const result = recommendConversion({
      ...base,
      saleValueEur: 450,
      available: { ...base.available, direct_reprint: false },
    });
    expect(result.primary).toBe("printed_sticker");
    expect(result.warnings[0]).toContain("niet beschikbaar");
  });

  it("blocks the order when no method is usable", () => {
    const result = recommendConversion({
      ...base,
      available: {
        loose_stickers: false,
        noviply_sheet: false,
        printed_sticker: false,
        direct_reprint: false,
      },
    });
    expect(result.primary).toBe("none");
    expect(result.policy.rule).toBe("no_usable_method");
  });
});

describe("werkdruk verschuift de prijsgrens", () => {
  it("laat de grens staan op normaal", () => {
    expect(effectiveThreshold(300, "normal")).toBe(300);
  });

  it("verlaagt hem als het rustig is, zodat er meer prints gedaan worden", () => {
    expect(effectiveThreshold(300, "quiet")).toBe(200);
  });

  it("verhoogt hem als het druk is, zodat het werk zich verdeelt", () => {
    expect(effectiveThreshold(300, "busy")).toBe(400);
    expect(effectiveThreshold(300, "critical")).toBe(500);
  });

  it("zakt nooit onder de honderd euro", () => {
    // Anders zou bij een lage grens élke laptop de duurste behandeling krijgen,
    // ook een die dertig euro opbrengt.
    expect(effectiveThreshold(150, "quiet")).toBe(100);
    expect(effectiveThreshold(100, "quiet")).toBe(100);
  });

  it("laat een laptop van €250 bij rustig wél door de printer gaan", () => {
    const rustig = recommendConversion({
      saleValueEur: 250,
      thresholdEur: 300,
      workload: "quiet",
      currentLayout: "QWERTY US",
      targetLayout: "AZERTY BE",
      available: { loose_stickers: true, noviply_sheet: true, printed_sticker: true, direct_reprint: true },
      compatible: { loose_stickers: true, noviply_sheet: true, printed_sticker: true, direct_reprint: true },
    });
    expect(rustig.primary).toBe("direct_reprint");
    expect(rustig.policy.thresholdEur).toBe(200);
  });

  it("en bij druk niet", () => {
    const druk = recommendConversion({
      saleValueEur: 350,
      thresholdEur: 300,
      workload: "busy",
      currentLayout: "QWERTY US",
      targetLayout: "AZERTY BE",
      available: { loose_stickers: true, noviply_sheet: true, printed_sticker: true, direct_reprint: true },
      compatible: { loose_stickers: true, noviply_sheet: true, printed_sticker: true, direct_reprint: true },
    });
    // €350 lag boven de ingestelde €300, maar onder de verschoven €400.
    expect(druk.primary).not.toBe("direct_reprint");
    expect(druk.policy.thresholdEur).toBe(400);
  });

  it("zegt in de waarschuwing wat er precies verschoven is", () => {
    const uit = recommendConversion({
      saleValueEur: 350, thresholdEur: 300, workload: "busy",
      currentLayout: "QWERTY US", targetLayout: "AZERTY BE",
      available: { loose_stickers: true, noviply_sheet: true, printed_sticker: true, direct_reprint: true },
      compatible: { loose_stickers: true, noviply_sheet: true, printed_sticker: true, direct_reprint: true },
    });
    expect(uit.warnings.join(" ")).toMatch(/Druk/);
    expect(uit.warnings.join(" ")).toMatch(/400/);
  });
});
