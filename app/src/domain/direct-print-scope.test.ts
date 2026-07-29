import { describe, expect, it } from "vitest";
import { directPrintScopeFor } from "./direct-print-scope";

/**
 * Deze test draait op de echte lijst van Notebook Service. Verandert die lijst,
 * dan hoort deze test mee te veranderen — dat is de bedoeling: het is precies
 * de grens waar de werkvloer op vertrouwt.
 */
describe("wat de toetsenbordsprinter aankan", () => {
  it("herkent een model dat de gevraagde taal aankan", () => {
    const result = directPrintScopeFor("Lenovo ThinkPad T480", "QWERTZ DE");

    expect(result.status).toBe("supported");
    expect(result.productName).toContain("T480");
  });

  it("rekent QWERTY NL en QWERTY US als hetzelfde vel", () => {
    // De Dell 5420 staat er met US maar zonder NL. Voor ons is dat hetzelfde,
    // net als bij de hangmappen.
    const nl = directPrintScopeFor("Dell Latitude 5420", "QWERTY NL");
    const us = directPrintScopeFor("Dell Latitude 5420", "QWERTY US");

    expect(nl.status).toBe("supported");
    expect(us.status).toBe("supported");
  });

  it("zegt nee wanneer het model er wel staat maar de taal niet", () => {
    const result = directPrintScopeFor("HP EliteBook 850 G7", "QWERTY NL");

    expect(result.status).toBe("unsupported");
    expect(result.layouts.length).toBeGreaterThan(0);
  });

  it("zegt onbekend in plaats van nee bij een model dat er niet in staat", () => {
    // Onbekend is geen nee: blokkeren op iets wat we niet terugvinden zou de
    // werkvloer tegenhouden om iets wat misschien prima kan.
    const result = directPrintScopeFor("Verzonnen Laptop 9999", "QWERTZ DE");

    expect(result.status).toBe("unknown");
    expect(result.layouts).toEqual([]);
  });

  it("koppelt niet op alleen een generatie", () => {
    const result = directPrintScopeFor("HP EliteBook 850 G7", "QWERTY IT");

    expect(result.productName).toContain("850");
    expect(result.productName).not.toBe("470 G7 (Palmrest)");
  });

  it("geeft onbekend voor een naam zonder modelnummer", () => {
    expect(directPrintScopeFor("Laptop", "QWERTZ DE").status).toBe("unknown");
  });
});
