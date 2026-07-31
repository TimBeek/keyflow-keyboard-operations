import { describe, expect, it } from "vitest";
import {
  modelKey,
  noviplyBlockedFor,
  reasonBlocksFuture,
  scopeForReason,
  type NoviplyUnavailableRecord,
} from "./noviply-availability";

function regel(overrides: Partial<NoviplyUnavailableRecord>): NoviplyUnavailableRecord {
  return {
    id: "1",
    model: "HP ProBook 430 G3",
    modelKey: modelKey("HP ProBook 430 G3"),
    layout: "",
    reason: "model_unknown",
    note: "",
    recordedAt: "2026-07-31T10:00:00.000Z",
    recordedBy: "Noviply",
    ...overrides,
  };
}

describe("Wat Noviply niet kan printen", () => {
  it("blokkeert het hele model als ze het model niet hebben", () => {
    const regels = [regel({})];

    expect(noviplyBlockedFor(regels, "HP ProBook 430 G3", "QWERTY ES")).not.toBeNull();
    // Ook in een andere taal: ze hebben het toetsenbord van dit model niet.
    expect(noviplyBlockedFor(regels, "HP ProBook 430 G3", "AZERTY FR")).not.toBeNull();
  });

  it("blokkeert alleen die ene taal als het model wél bekend is", () => {
    const regels = [regel({ reason: "layout_unknown", layout: "QWERTY ES" })];

    expect(noviplyBlockedFor(regels, "HP ProBook 430 G3", "QWERTY ES")).not.toBeNull();
    expect(noviplyBlockedFor(regels, "HP ProBook 430 G3", "AZERTY FR")).toBeNull();
  });

  it("raakt andere modellen niet", () => {
    const regels = [regel({})];

    expect(noviplyBlockedFor(regels, "HP ProBook 430 G5", "QWERTY ES")).toBeNull();
  });

  it("trekt zich niets aan van hoofdletters of extra spaties", () => {
    const regels = [regel({})];

    expect(noviplyBlockedFor(regels, "hp  probook 430 g3", "qwerty es")).not.toBeNull();
  });

  it("laat een eenmalige tegenvaller het advies niet sturen", () => {
    // "Het materiaal is op" is morgen voorbij; dat hoort de volgende laptop niet
    // de dure route in te sturen.
    expect(reasonBlocksFuture("temporary")).toBe(false);
    expect(reasonBlocksFuture("model_unknown")).toBe(true);
    expect(reasonBlocksFuture("layout_unknown")).toBe(true);
  });

  it("legt een onbekend model zonder taal vast, en een onbekende taal mét", () => {
    expect(scopeForReason("model_unknown", "QWERTY ES")).toBe("");
    expect(scopeForReason("layout_unknown", "QWERTY ES")).toBe("QWERTY ES");
  });

  it("zegt niets bij een leeg model", () => {
    expect(noviplyBlockedFor([regel({})], "", "QWERTY ES")).toBeNull();
  });
});
