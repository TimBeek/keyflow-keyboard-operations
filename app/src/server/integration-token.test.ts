import { describe, expect, it } from "vitest";
import { checkIntegrationToken, tokenFromRequest } from "./integration-token";

const sleutel = "3f9c1a77e0b24d5e8a6c12b4f7d0e935";
const omgeving = { REKEY_RESYNC_TOKEN: sleutel };

function verzoek(headers: Record<string, string> = {}) {
  return new Request("https://rekey.test/api/resync-export-noviply", {
    method: "POST",
    headers,
  });
}

describe("de sleutel van de koppeling", () => {
  it("leest hem uit Authorization: Bearer", () => {
    expect(tokenFromRequest(verzoek({ authorization: `Bearer ${sleutel}` }))).toBe(sleutel);
  });

  it("leest hem ook uit X-ReKey-Token", () => {
    expect(tokenFromRequest(verzoek({ "x-rekey-token": sleutel }))).toBe(sleutel);
  });

  it("trekt zich niets aan van hoofdletters in het woord Bearer", () => {
    expect(tokenFromRequest(verzoek({ authorization: `bearer ${sleutel}` }))).toBe(sleutel);
  });

  it("laat de juiste sleutel door", () => {
    expect(checkIntegrationToken(verzoek({ authorization: `Bearer ${sleutel}` }), omgeving))
      .toEqual({ ok: true });
  });

  it("weigert een verkeerde sleutel", () => {
    const uit = checkIntegrationToken(verzoek({ authorization: "Bearer fout" }), omgeving);
    expect(uit.ok).toBe(false);
    expect(uit.ok === false && uit.status).toBe(401);
  });

  it("weigert een sleutel die er bijna is", () => {
    const bijna = sleutel.slice(0, -1) + "0";
    const uit = checkIntegrationToken(verzoek({ authorization: `Bearer ${bijna}` }), omgeving);
    expect(uit.ok).toBe(false);
  });

  it("weigert een verzoek zonder sleutel", () => {
    const uit = checkIntegrationToken(verzoek(), omgeving);
    expect(uit.ok).toBe(false);
    expect(uit.ok === false && uit.status).toBe(401);
  });

  it("gaat op slot als er geen sleutel is ingesteld", () => {
    // Dit is het belangrijkste geval: een route die zonder sleutel iedereen
    // binnenlaat merk je pas als het te laat is.
    const uit = checkIntegrationToken(verzoek({ authorization: `Bearer ${sleutel}` }), {});
    expect(uit.ok).toBe(false);
    expect(uit.ok === false && uit.status).toBe(503);
  });

  it("gaat ook op slot bij een lege sleutel", () => {
    const uit = checkIntegrationToken(verzoek({ authorization: "Bearer " }), { REKEY_RESYNC_TOKEN: "   " });
    expect(uit.ok).toBe(false);
    expect(uit.ok === false && uit.status).toBe(503);
  });

  it("weigert een ingestelde sleutel die te kort is", () => {
    const kort = "geheim";
    const uit = checkIntegrationToken(verzoek({ authorization: `Bearer ${kort}` }), {
      REKEY_RESYNC_TOKEN: kort,
    });
    expect(uit.ok).toBe(false);
    expect(uit.ok === false && uit.status).toBe(503);
  });

  it("neemt een sleutel van zestien willekeurige tekens aan", () => {
    // Kort maar willekeurig is geen zwakke sleutel; de ondergrens is er tegen
    // een woord, niet tegen lengte op zich.
    const zestien = "aZ3kQ9mN2pR7tV5x";
    expect(checkIntegrationToken(verzoek({ authorization: `Bearer ${zestien}` }), {
      REKEY_RESYNC_TOKEN: zestien,
    })).toEqual({ ok: true });
  });

  it("valt niet om over een sleutel van een andere lengte", () => {
    // timingSafeEqual gooit als de buffers verschillen in lengte; daarom wordt
    // er eerst gehasht. Zonder die hash zou dit een 500 geven.
    expect(() => checkIntegrationToken(verzoek({ authorization: "Bearer x" }), omgeving)).not.toThrow();
  });
});
