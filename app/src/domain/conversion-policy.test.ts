import { describe, expect, it } from "vitest";
import { recommendConversion, type ConversionPolicyInput } from "./conversion-policy";

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
