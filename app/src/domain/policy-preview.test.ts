import { describe, expect, it } from "vitest";
import { defaultOperationsPolicy, type OperationsPolicy } from "./operations";
import { policyPreview, ruleFor } from "./policy-preview";

/**
 * Deze tabel is niet alleen een overzicht maar ook het bewerkscherm zelf: wat
 * er staat is wat je aanklikt. Klopt hij niet, dan zet management iets om op
 * grond van een verkeerde belofte.
 */

function withRules(rules: OperationsPolicy["layoutRules"]): OperationsPolicy {
  return { ...defaultOperationsPolicy, layoutRules: rules };
}

function row(policy: OperationsPolicy, layout: string) {
  return policyPreview(policy, [])!.find((entry) => entry.layout === layout)!;
}

describe("de gewone waarderegel", () => {
  it("geeft goedkoop een voorraadvel en duur de toetsenbordsprint", () => {
    const nederlands = row(defaultOperationsPolicy, "QWERTY US");

    expect(nederlands.below.rule).toBeNull();
    expect(nederlands.below.method).toBe("noviply_sheet");
    expect(nederlands.above.method).toBe("direct_reprint");
  });

  it("zet buitenlandse talen onder de grens op de premiumsticker", () => {
    expect(row(defaultOperationsPolicy, "QWERTY IT").below.method).toBe("printed_sticker");
  });
});

describe("een regel per prijsklasse", () => {
  it("raakt alleen de klasse waar hij voor staat", () => {
    // Dit is wat er gevraagd werd: QWERTY NL onder de grens de premiumsticker,
    // en daarboven gewoon laten zoals het was.
    const policy = withRules([
      { layout: "QWERTY NL", band: "below", method: "printed_sticker", note: "" },
    ]);
    const nl = row(policy, "QWERTY NL");

    expect(nl.below.method).toBe("printed_sticker");
    expect(nl.below.rule?.band).toBe("below");
    expect(nl.above.method).toBe("direct_reprint");
    expect(nl.above.rule).toBeNull();
  });

  it("laat een regel zonder klasse voor beide gelden", () => {
    // Zo waren de regels vóór deze splitsing bedoeld; die moeten blijven doen
    // wat ze deden.
    const policy = withRules([{ layout: "QWERTY NL", method: "printed_sticker", note: "" }]);
    const nl = row(policy, "QWERTY NL");

    expect(nl.below.method).toBe("printed_sticker");
    expect(nl.above.method).toBe("printed_sticker");
  });

  it("laat de klasse-eigen regel voorgaan op de regel voor beide", () => {
    const policy = withRules([
      { layout: "QWERTY NL", method: "printed_sticker", note: "" },
      { layout: "QWERTY NL", band: "above", method: "direct_reprint", note: "" },
    ]);

    expect(ruleFor(policy, "QWERTY NL", "above")?.method).toBe("direct_reprint");
    expect(ruleFor(policy, "QWERTY NL", "below")?.method).toBe("printed_sticker");
  });

  it("raakt de andere talen niet", () => {
    const policy = withRules([
      { layout: "QWERTY NL", band: "below", method: "printed_sticker", note: "" },
    ]);

    expect(row(policy, "QWERTY IT").below.rule).toBeNull();
  });
});

describe("wat er gebeurt als de eerste keuze niet kan", () => {
  it("laat zonder opgave zien waar ReKey zelf op uitkomt", () => {
    // QWERTY US onder de grens wil een voorraadvel; is de hangmap leeg, dan
    // koos de standaardvolgorde de toetsenbordsprint. Dat mag je weten.
    const us = row(defaultOperationsPolicy, "QWERTY US");

    expect(us.below.method).toBe("noviply_sheet");
    expect(us.below.ifBlocked).toBe("direct_reprint");
  });

  it("volgt de opgegeven terugval als die is ingevuld", () => {
    // Precies de vraag: gaat het voorraadvel niet, dan de 3-sterrenvariant en
    // niet de toetsenbordsprint.
    const policy = withRules([{
      layout: "QWERTY US",
      band: "below",
      method: "noviply_sheet",
      fallback: "printed_sticker",
      note: "",
    }]);
    const us = row(policy, "QWERTY US");

    expect(us.below.method).toBe("noviply_sheet");
    expect(us.below.ifBlocked).toBe("printed_sticker");
  });

  it("gebruikt de terugval niet zolang de eerste keuze wel kan", () => {
    const policy = withRules([{
      layout: "QWERTY IT",
      band: "below",
      method: "printed_sticker",
      fallback: "loose_stickers",
      note: "",
    }]);

    expect(row(policy, "QWERTY IT").below.method).toBe("printed_sticker");
  });
});

describe("talen die op hetzelfde neerkomen", () => {
  it("laat zien dat QWERTY US meebeweegt met de NL-regel", () => {
    // NL wordt ook als QWERTY US geprint, dus de motor pakt dezelfde regel.
    // Zonder dit zou de tabel doen alsof QWERTY US vrij is, en zet je twee
    // regels neer die elkaar tegenspreken.
    const policy = withRules([
      { layout: "QWERTY NL", band: "below", method: "printed_sticker", note: "" },
    ]);
    const us = row(policy, "QWERTY US");

    expect(us.below.rule).not.toBeNull();
    expect(us.below.from).toBe("QWERTY NL");
    expect(us.below.method).toBe("printed_sticker");
  });
});

describe("de rest van het beleid", () => {
  it("laat een uitgezette methode niet in de uitkomst opduiken", () => {
    const uit = policyPreview({
      ...defaultOperationsPolicy,
      methodEnabled: { ...defaultOperationsPolicy.methodEnabled, direct_reprint: false },
    }, []);

    expect(uit.every((entry) => entry.above.method !== "direct_reprint")).toBe(true);
  });

  it("beweegt mee met een andere waardegrens", () => {
    const hoog = policyPreview({ ...defaultOperationsPolicy, thresholdEur: 900 }, []);

    expect(hoog.find((entry) => entry.layout === "QWERTY US")?.above.method)
      .toBe("direct_reprint");
  });

  it("neemt de toelichting mee die de medewerker te zien krijgt", () => {
    const policy = withRules([
      { layout: "QWERTY NL", band: "below", method: "printed_sticker", note: "Afspraak met Noviply" },
    ]);

    expect(row(policy, "QWERTY NL").below.rule?.note).toBe("Afspraak met Noviply");
  });
});
