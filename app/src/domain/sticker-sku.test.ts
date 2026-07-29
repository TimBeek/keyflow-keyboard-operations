import { describe, expect, it } from "vitest";
import {
  displayStickerSku,
  isValidStickerSku,
  missingSkuLabel,
  validateStickerSkuInput,
} from "./sticker-sku";

describe("artikelnummer van een stickervel", () => {
  it("herkent een geldig nummer", () => {
    expect(isValidStickerSku("NB10052E1NL")).toBe(true);
    expect(isValidStickerSku(" nb10043e1de ")).toBe(true);
  });

  it("toont rommel uit de import nooit als nummer", () => {
    expect(displayStickerSku(",,,,,,,,,,")).toBe(missingSkuLabel);
    expect(displayStickerSku("")).toBe(missingSkuLabel);
    expect(displayStickerSku("   ")).toBe(missingSkuLabel);
  });

  it("bewaart een handmatig nummer in hoofdletters", () => {
    expect(validateStickerSkuInput(" nb10052e1nl ")).toBe("NB10052E1NL");
  });

  it("weigert een nummer dat niet klopt, met uitleg", () => {
    expect(() => validateStickerSkuInput("12345")).toThrow(/NB10052E1NL/);
    expect(() => validateStickerSkuInput("")).toThrow(/Vul een artikelnummer in/);
  });
});
