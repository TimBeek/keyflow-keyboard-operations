/**
 * Kan de toetsenbordsprinter in Roemenië dít model in déze taal?
 *
 * Er zijn drie antwoorden, en het verschil doet ertoe:
 *
 *  - "ja"        — het model staat in hun lijst met deze taal erbij
 *  - "nee"       — het model staat erin, maar zonder deze taal
 *  - "onbekend"  — het model staat niet in hun lijst
 *
 * Onbekend is geen nee. Blokkeren op een model dat we simpelweg niet
 * terugvinden zou de werkvloer tegenhouden om iets wat misschien prima kan.
 */

import {
  directPrintScope,
  type DirectPrintScopeEntry,
} from "@/data/direct-print-scope.generated";
import {
  generationTokens,
  manufacturerOf,
  modelTokens,
} from "./direct-print-catalogue";
import { normalizeLayoutName } from "./keyboard-layouts";

const manufacturerKey = (value: string) => manufacturerOf(value) || value.trim().toLowerCase();

export type DirectPrintScopeResult = {
  status: "supported" | "unsupported" | "unknown";
  /** De regel bij Notebook Service, om over terug te kunnen praten. */
  productName: string;
  layouts: string[];
};

function findEntry(model: string): DirectPrintScopeEntry | null {
  const wanted = modelTokens(model);
  if (wanted.length === 0) return null;
  const brand = manufacturerOf(model);
  const wantedGenerations = generationTokens(model);

  for (const entry of directPrintScope) {
    if (brand && manufacturerKey(entry.manufacturer) !== brand) continue;
    if (!wanted.some((token) => entry.tokens.includes(token))) continue;

    // Noemen beide een generatie, dan moet die kloppen: een T14 G2 is geen T14 G4.
    if (wantedGenerations.length > 0 && entry.generations.length > 0) {
      if (!wantedGenerations.some((token) => entry.generations.includes(token))) continue;
    }
    return entry;
  }
  return null;
}

export function directPrintScopeFor(
  model: string,
  targetLayout: string,
): DirectPrintScopeResult {
  const entry = findEntry(model);
  if (!entry) {
    return { status: "unknown", productName: "", layouts: [] };
  }

  // QWERTY NL en QWERTY US zijn voor ons hetzelfde vel; die gelijkstelling
  // geldt hier net zo goed.
  const wanted = normalizeLayoutName(targetLayout);
  const supported = entry.layouts.some((layout) => normalizeLayoutName(layout) === wanted);

  return {
    status: supported ? "supported" : "unsupported",
    productName: entry.name,
    layouts: [...entry.layouts],
  };
}
