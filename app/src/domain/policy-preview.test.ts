import { describe, expect, it } from "vitest";
import { defaultOperationsPolicy, type OperationsPolicy } from "./operations";
import { policyPreview } from "./policy-preview";

/**
 * Deze tabel is het antwoord op "wat gebeurt er als ik dit omzet". Klopt hij
 * niet, dan zet management iets om op grond van een verkeerde belofte.
 */

function withRules(rules: OperationsPolicy["layoutRules"]): OperationsPolicy {
  return { ...defaultOperationsPolicy, layoutRules: rules };
}

function row(policy: OperationsPolicy, layout: string) {
  return policyPreview(policy, [])!.find((entry) => entry.layout === layout)!;
}

describe("policyPreview", () => {
  it("laat de gewone waarderegel zien: goedkoop een vel, duur de printer", () => {
    const nederlands = row(defaultOperationsPolicy, "QWERTY US");

    expect(nederlands.source).toBe("value");
    expect(nederlands.below).toBe("noviply_sheet");
    expect(nederlands.above).toBe("direct_reprint");
  });

  it("zet buitenlandse talen onder de grens op de premiumsticker", () => {
    const italiaans = row(defaultOperationsPolicy, "QWERTY IT");

    expect(italiaans.below).toBe("printed_sticker");
  });

  it("laat een uitzondering vóór de waarderegel gaan, ook bij een dure laptop", () => {
    // Dit is het geval uit de vraag: QWERTY NL altijd met de premiumsticker,
    // ook al zou de waarde iets anders kiezen.
    const policy = withRules([{ layout: "QWERTY NL", method: "printed_sticker", note: "" }]);
    const nl = row(policy, "QWERTY NL");

    expect(nl.source).toBe("exception");
    expect(nl.below).toBe("printed_sticker");
    expect(nl.above).toBe("printed_sticker");
  });

  it("laat zien dat QWERTY US meebeweegt met de NL-regel", () => {
    // NL wordt ook als QWERTY US geprint, dus de motor pakt dezelfde regel.
    // Zonder dit stond er "verkoopwaarde" terwijl er wel degelijk een
    // uitzondering gold, en dan zet je hem om zonder te weten wat je raakt.
    const policy = withRules([{ layout: "QWERTY NL", method: "printed_sticker", note: "" }]);
    const us = row(policy, "QWERTY US");

    expect(us.source).toBe("exception");
    expect(us.exceptionFrom).toBe("QWERTY NL");
    expect(us.below).toBe("printed_sticker");
  });

  it("raakt de andere talen niet als er één uitzondering staat", () => {
    const policy = withRules([{ layout: "QWERTY NL", method: "printed_sticker", note: "" }]);

    expect(row(policy, "QWERTY IT").source).toBe("value");
  });

  it("neemt de toelichting mee die de medewerker te zien krijgt", () => {
    const policy = withRules([
      { layout: "QWERTY NL", method: "printed_sticker", note: "Afspraak met Noviply" },
    ]);

    expect(row(policy, "QWERTY NL").note).toBe("Afspraak met Noviply");
  });

  it("laat een uitgezette methode niet in de uitkomst opduiken", () => {
    // Losse stickers staan uit; die mogen nergens als advies verschijnen.
    const uit = policyPreview({
      ...defaultOperationsPolicy,
      methodEnabled: { ...defaultOperationsPolicy.methodEnabled, direct_reprint: false },
    }, []);

    expect(uit.every((entry) => entry.above !== "direct_reprint")).toBe(true);
  });

  it("beweegt mee met een andere waardegrens", () => {
    // De voorbeelden liggen honderd euro onder en boven de grens; verschuift de
    // grens, dan verschuiven ze mee en blijft de tabel kloppen.
    const hoog = policyPreview({ ...defaultOperationsPolicy, thresholdEur: 900 }, []);

    expect(hoog.find((entry) => entry.layout === "QWERTY US")?.above).toBe("direct_reprint");
  });
});
