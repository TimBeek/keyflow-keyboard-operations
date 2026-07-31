import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { conversionMethodIds, conversionMethods } from "./conversion-policy";
import { allMethodPhotos, gefotografeerdeMethodes, methodPhoto } from "./method-photos";

const publiek = join(process.cwd(), "public");

describe("foto's bij de niveaus", () => {
  it("heeft voor elke methode die werk oplevert een foto", () => {
    for (const method of conversionMethodIds) {
      const foto = methodPhoto(method);
      if (method === "none") {
        // Niets omzetten, niets te zien.
        expect(foto).toBeNull();
      } else {
        expect(foto, method).not.toBeNull();
        expect(foto!.niveau).toBe(conversionMethods[method].tier);
      }
    }
  });

  it("verwijst naar bestanden die er ook echt staan", () => {
    // Een kapot plaatje op de werkvloer is erger dan geen plaatje: dan denkt
    // iemand dat de app stuk is. Daarom hier nagekeken in plaats van in de
    // browser.
    for (const foto of allMethodPhotos()) {
      for (const pad of [foto.klein, foto.groot]) {
        const opSchijf = join(publiek, pad);
        expect(existsSync(opSchijf), pad).toBe(true);
        // Een leeg of half weggeschreven bestand laadt net zo hard niet.
        expect(statSync(opSchijf).size, pad).toBeGreaterThan(2000);
      }
    }
  });

  it("houdt de kleine versie klein genoeg om over 4G te laden", () => {
    for (const foto of allMethodPhotos()) {
      const bytes = statSync(join(publiek, foto.klein)).size;
      expect(bytes, foto.klein).toBeLessThan(40 * 1024);
    }
  });

  it("zet de niveaus op volgorde van licht naar zwaar", () => {
    const niveaus = gefotografeerdeMethodes.map((m) => conversionMethods[m].tier);
    expect(niveaus).toEqual([1, 2, 3, 4]);
  });

  it("laat het basispad meelopen, zodat het ook op een subpad werkt", () => {
    const foto = methodPhoto("noviply_sheet", "/rekey");
    expect(foto!.groot).toBe("/rekey/methoden/ster2-groot.webp");
  });

  it("beschrijft elke foto voor wie hem niet kan zien", () => {
    for (const foto of allMethodPhotos()) {
      expect(foto.alt.length, foto.method).toBeGreaterThan(20);
      expect(foto.onderschrift.length, foto.method).toBeGreaterThan(20);
      expect(foto.herkomst.length, foto.method).toBeGreaterThan(20);
    }
  });
});
