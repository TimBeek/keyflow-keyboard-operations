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

/**
 * Alle regels die bij dit model horen, niet alleen de eerste.
 *
 * Notebook Service voert per uitvoering een regel: dezelfde EliteBook 840 G8
 * staat er elf keer in, per palmrest en per knopindeling. Die uitvoeringen
 * verschillen in welke talen ze eruit krijgen. Wij weten op de werkvloer niet
 * welke uitvoering we in handen hebben — zij zien dat als de laptop bij hen
 * ligt. Namen we alleen de eerste regel, dan hing het antwoord af van de
 * volgorde in hun lijst en werd een laptop naar de dure route gestuurd terwijl
 * een andere uitvoering van precies dat model de taal wél kan.
 */
function findEntries(model: string): DirectPrintScopeEntry[] {
  const wanted = modelTokens(model);
  if (wanted.length === 0) return [];
  const brand = manufacturerOf(model);
  const wantedGenerations = generationTokens(model);

  return directPrintScope.filter((entry) => {
    if (brand && manufacturerKey(entry.manufacturer) !== brand) return false;
    if (!wanted.some((token) => entry.tokens.includes(token))) return false;

    // Noemen beide een generatie, dan moet die kloppen: een T14 G2 is geen T14 G4.
    if (wantedGenerations.length > 0 && entry.generations.length > 0) {
      return wantedGenerations.some((token) => entry.generations.includes(token));
    }
    return true;
  });
}

export function directPrintScopeFor(
  model: string,
  targetLayout: string,
): DirectPrintScopeResult {
  const entries = findEntries(model);
  if (entries.length === 0) {
    return { status: "unknown", productName: "", layouts: [] };
  }

  // QWERTY NL en QWERTY US zijn voor ons hetzelfde vel; die gelijkstelling
  // geldt hier net zo goed.
  const wanted = normalizeLayoutName(targetLayout);
  const kanHet = entries.find((entry) =>
    entry.layouts.some((layout) => normalizeLayoutName(layout) === wanted),
  );

  return {
    status: kanHet ? "supported" : "unsupported",
    productName: (kanHet ?? entries[0]).name,
    layouts: [...new Set(entries.flatMap((entry) => entry.layouts))],
  };
}
