import { conversionMethods, type ConversionMethodId } from "./conversion-policy";

/**
 * Bij elk niveau een foto van waar het over gaat.
 *
 * "Vier sterren" zegt een nieuwe medewerker niets, en "Professionele
 * toetsenbordsprint" ook niet. Een foto wel: dít vel ligt in de hangmap, dát
 * komt uit een machine die hier niet staat. Bij één en twee sterren zie je
 * daarom de sticker zelf — die heb je zo in handen. Bij drie en vier de
 * machine die hem maakt; die staat niet op je werkplek, en dat verklaart
 * meteen waarom die twee niet meteen klaar zijn.
 */
export type MethodPhoto = {
  /** Wat er op de foto staat, voor wie hem niet kan zien. */
  alt: string;
  /** Waar je naar kijkt, in één zin. */
  onderschrift: string;
  /** Waar dat wat je ziet vandaan komt. */
  herkomst: string;
  /** Afmetingen van de grote versie; de kleine heeft dezelfde verhouding. */
  breedte: number;
  hoogte: number;
};

const perNiveau: Record<number, MethodPhoto> = {
  1: {
    alt: "Vel met losse zwarte toetsstickers, letter voor letter aan te brengen",
    onderschrift: "Losse stickers, toets voor toets opplakken.",
    herkomst: "Voordelig en dun. Alleen voor laptops die niet veel opbrengen.",
    breedte: 1400,
    hoogte: 563,
  },
  2: {
    alt: "Voorgeprint stickervel met het hele toetsenbord, model en artikelnummer eronder",
    onderschrift: "Eén vel voor het hele toetsenbord.",
    herkomst: "Dit ligt in de hangmappen. Verreweg het meeste werk gaat zo.",
    breedte: 1400,
    hoogte: 609,
  },
  3: {
    alt: "De printer bij Noviply met een rol folie erin",
    onderschrift: "Noviply print dit op folie met sterkere lijm.",
    herkomst: "Ligt niet in de kast — die vraag je aan en komt later binnen.",
    breedte: 1400,
    hoogte: 984,
  },
  4: {
    alt: "Vlakbedprinter die rechtstreeks op een toetsenbord drukt",
    onderschrift: "Inkt op het toetsenbord zelf, geen sticker.",
    herkomst: "Niet meer te verwijderen. Alleen voor laptops die genoeg opbrengen.",
    breedte: 1400,
    hoogte: 1328,
  },
};

export type MethodPhotoBestand = MethodPhoto & {
  niveau: number;
  klein: string;
  groot: string;
};

/** Waar de bestanden staan. Null voor "geen conversie": daar valt niets te zien. */
export function methodPhoto(method: ConversionMethodId, basePath = ""): MethodPhotoBestand | null {
  const niveau = conversionMethods[method].tier;
  const info = perNiveau[niveau];
  if (!info) return null;
  return {
    ...info,
    niveau,
    klein: `${basePath}/methoden/ster${niveau}-klein.webp`,
    groot: `${basePath}/methoden/ster${niveau}-groot.webp`,
  };
}

/** In volgorde van licht naar zwaar; zo staan ze ook in het overzicht. */
export const gefotografeerdeMethodes = [
  "loose_stickers",
  "noviply_sheet",
  "printed_sticker",
  "direct_reprint",
] as const satisfies readonly ConversionMethodId[];

/** Alle vier op een rij, voor het overzicht dat de sterren uitlegt. */
export function allMethodPhotos(basePath = "") {
  return gefotografeerdeMethodes.map((method) => ({
    method,
    naam: conversionMethods[method].name,
    toelichting: conversionMethods[method].note,
    leverancier: conversionMethods[method].supplier,
    ...methodPhoto(method, basePath)!,
  }));
}
