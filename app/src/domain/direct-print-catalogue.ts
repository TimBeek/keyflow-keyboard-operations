/**
 * De productlijst van Notebook Service in Roemenië, zoals hun systeem hem
 * uitspuugt. De vorm is:
 *
 *     #51 - Lenovo
 *     ThinkPad T480 A485 (Laptop)
 *     DE - Backlit - Trackpoint
 *     US-to-NL - Normal - Trackpoint
 *
 * Dus: fabrikant, dan een model, dan alle stickervarianten daaronder. "US-to-NL"
 * betekent van een US-toetsenbord naar Nederlands — precies wat wij doen —
 * tegenover een kaal "NL", dat een bestaand NL-toetsenbord opnieuw print.
 */

export type DirectPrintVariant = {
  sourceLayout: string;
  keyflowLayout: string;
  convertsFrom: string;
  backlit: boolean;
  trackpoint: boolean;
};

export type DirectPrintProduct = {
  manufacturer: string;
  sourceName: string;
  normalizedName: string;
  formFactor: string;
  variants: DirectPrintVariant[];
};

/**
 * Hun codes naast onze layoutnamen. Wat hier niet in staat kunnen zij wél
 * printen, maar verkopen wij niet — dat blijft leeg in plaats van dat we het
 * ergens naartoe duwen.
 */
const layoutByCode: Record<string, string> = {
  NL: "QWERTY NL",
  BE: "AZERTY BE",
  DE: "QWERTZ DE",
  ES: "QWERTY ES",
  IT: "QWERTY IT",
  FR: "AZERTY FR",
  PT: "QWERTY PT",
  "UK-ENG": "QWERTY UK",
  UK: "QWERTY UK",
  "US ENG": "QWERTY US",
  US: "QWERTY US",
  "SE-FI": "QWERTY SE/FI",
  DK: "QWERTY DK",
  NO: "QWERTY NO",
  PL: "QWERTY PL",
};

const formFactorPattern = /\(([^)]*)\)\s*$/;

export function normalizeProductName(value: string) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * "US-to-NL - Backlit - Trackpoint" uit elkaar halen. Onbekende vormen leveren
 * null op in plaats van een gok: een verkeerd gelezen regel zou een taal
 * toestaan die niet kan.
 */
export function parseVariantLine(line: string): DirectPrintVariant | null {
  const parts = line.split(" - ").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const [rawLayout, ...rest] = parts;
  const flags = rest.join(" ").toLowerCase();
  // "Backlit" en "Normal" sluiten elkaar uit; alles anders is geen variantregel.
  const backlit = flags.includes("backlit");
  if (!backlit && !flags.includes("normal")) return null;

  const upper = rawLayout.toUpperCase();
  const conversion = upper.match(/^(.+?)-TO-(.+)$/);
  const targetCode = (conversion ? conversion[2] : upper)
    // "NL (Version 2)" en "PT-C (<>)" zijn varianten van dezelfde taal. Eerst
    // het haakje weg en dan pas het achtervoegsel, anders blijft er een spatie
    // tussen staan en valt "PT-C " niet meer op "-C".
    .replace(/\(.*\)/, "")
    .trim()
    .replace(/-C$/, "")
    .trim();

  return {
    sourceLayout: rawLayout,
    keyflowLayout: layoutByCode[targetCode] ?? "",
    convertsFrom: conversion ? layoutByCode[conversion[1].trim()] ?? "" : "",
    backlit,
    trackpoint: flags.includes("trackpoint") && !flags.includes("no trackpoint"),
  };
}

export function parseDirectPrintCatalogue(text: string): DirectPrintProduct[] {
  const products: DirectPrintProduct[] = [];
  let manufacturer = "";
  let current: DirectPrintProduct | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.toLowerCase().startsWith("list of products")) continue;

    // "#51 - Lenovo" begint een nieuwe fabrikant.
    const heading = line.match(/^#\d+\s*-\s*(.+)$/);
    if (heading) {
      manufacturer = heading[1].trim();
      current = null;
      continue;
    }

    const variant = parseVariantLine(line);
    if (variant && current) {
      current.variants.push(variant);
      continue;
    }

    // Geen variantregel en geen kop: dan is het een modelnaam. Een model zonder
    // varianten blijft bewust staan — dat betekent "kennen ze, kunnen ze niets".
    current = {
      manufacturer,
      sourceName: line,
      normalizedName: normalizeProductName(line),
      formFactor: line.match(formFactorPattern)?.[1]?.trim() ?? "",
      variants: [],
    };
    products.push(current);
  }

  return products;
}

/** Welke van onze layouts dit product aankan. */
export function layoutsFor(product: DirectPrintProduct) {
  return [...new Set(
    product.variants.map((variant) => variant.keyflowLayout).filter(Boolean),
  )];
}

/* ---------- koppelen aan onze eigen modelnamen ---------- */

/**
 * Roemenië schrijft Dell als kale nummers op één regel — "5320 5420 5430 6220"
 * — en Lenovo als "ThinkPad T480 A485". Onze catalogus zegt "Dell Latitude
 * 5420". Matchen op de hele naam werkt dus niet; matchen op het modelnummer wel.
 *
 * Een sterk kenmerk is een woord met een cijfer erin: 5420, T480, X1. Woorden
 * als "latitude" of "laptop" zeggen niets — die staan bij honderden regels.
 */
export function strongTokens(value: string) {
  return normalizeProductName(value)
    .split(" ")
    .filter((token) => token.length >= 2 && /\d/.test(token));
}

/**
 * "G7" is een generatie, geen model: de HP EliteBook 850 G7 en de HP 470 G7
 * delen dat achtervoegsel en zijn totaal verschillende toestellen. Matchen op
 * alleen de generatie koppelde ze aan elkaar, en dan zou een taal worden
 * toegestaan die dit toestel niet aankan.
 */
const generationPattern = /^(g|gen|v|type|mk)\d+$/;

export function modelTokens(value: string) {
  return strongTokens(value).filter((token) => !generationPattern.test(token));
}

export function generationTokens(value: string) {
  return strongTokens(value).filter((token) => generationPattern.test(token));
}

const manufacturerAliases: Record<string, string> = {
  lenovo: "lenovo",
  thinkpad: "lenovo",
  ideapad: "lenovo",
  thinkbook: "lenovo",
  hp: "hp",
  elitebook: "hp",
  probook: "hp",
  zbook: "hp",
  dell: "dell",
  latitude: "dell",
  precision: "dell",
  inspiron: "dell",
  fujitsu: "fujitsu",
  lifebook: "fujitsu",
  celsius: "fujitsu",
  toshiba: "toshiba",
  acer: "acer",
  asus: "asus",
  apple: "apple",
  macbook: "apple",
};

/** Welk merk hoort bij deze modelnaam, ook als het merk er niet in staat. */
export function manufacturerOf(model: string) {
  for (const word of normalizeProductName(model).split(" ")) {
    const brand = manufacturerAliases[word];
    if (brand) return brand;
  }
  return "";
}

export type DirectPrintMatch = {
  product: DirectPrintProduct;
  matchedOn: string;
};

/**
 * Zoekt het product van Notebook Service dat bij dit laptopmodel hoort. Geen
 * merkoverlap betekent geen match: "5420" bestaat bij Dell én bij anderen, en
 * een verkeerde match zou een taal toestaan die dit toestel niet aankan.
 */
export function matchDirectPrintProduct(
  model: string,
  products: DirectPrintProduct[],
): DirectPrintMatch | null {
  const wanted = modelTokens(model);
  if (wanted.length === 0) return null;
  const brand = manufacturerOf(model);
  const wantedGenerations = generationTokens(model);

  for (const product of products) {
    if (brand && manufacturerAliases[product.manufacturer.toLowerCase()] !== brand) continue;

    const available = new Set(modelTokens(product.sourceName));
    const hit = wanted.find((token) => available.has(token));
    if (!hit) continue;

    // Noemen beide een generatie, dan moet die ook kloppen: een T14 G2 is geen
    // T14 G4.
    const theirGenerations = generationTokens(product.sourceName);
    if (wantedGenerations.length > 0 && theirGenerations.length > 0) {
      if (!wantedGenerations.some((token) => theirGenerations.includes(token))) continue;
    }

    return { product, matchedOn: hit };
  }
  return null;
}
