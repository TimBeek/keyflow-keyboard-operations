import { describe, expect, it } from "vitest";
import {
  areStickerVerificationChecksComplete,
  createEmptyStickerVerificationChecks,
  stickerVerificationFailureLabel,
} from "./sticker-verification";

describe("Noviply-pakcontrole", () => {
  it("blokkeert afboeken zolang niet alle controles zijn bevestigd", () => {
    const checks = createEmptyStickerVerificationChecks();
    checks.storage = true;
    checks.sku = true;
    checks.layout = true;
    checks.variant = true;

    expect(areStickerVerificationChecksComplete(checks)).toBe(false);
  });

  it("staat doorgaan pas toe na locatie, SKU, layout, variant en positionering", () => {
    const checks = createEmptyStickerVerificationChecks();
    Object.keys(checks).forEach((key) => {
      checks[key as keyof typeof checks] = true;
    });

    expect(areStickerVerificationChecksComplete(checks)).toBe(true);
  });

  it("geeft E1/E2-afwijkingen een herkenbaar managementlabel", () => {
    expect(stickerVerificationFailureLabel("wrong_variant")).toBe("E1/E2-variant wijkt af");
  });
});
