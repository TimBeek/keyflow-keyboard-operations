/**
 * Maakt van de productlijst van Notebook Service een compacte lijst die in de
 * app past.
 *
 * Gebruik: npx tsx scripts/generate-direct-print-scope.mjs <tekstbestand> [uitvoer]
 *
 * De volledige lijst is 12.383 varianten. Wat de werkvloer nodig heeft is veel
 * minder: per product de kenmerkende modelnummers en welke van ónze layouts
 * eruit kunnen komen. De rest — verlichting, trackpoint, talen die wij niet
 * verkopen — hoort in de database, niet in de broekzak van de medewerker.
 *
 * Waarom in de app en niet achter een aanroep: de medewerker staat met een
 * laptop in zijn hand, soms zonder verbinding. Een advies dat dan niet komt is
 * geen advies.
 */
import { readFile, writeFile } from "node:fs/promises";
import {
  generationTokens,
  layoutsFor,
  modelTokens,
  parseDirectPrintCatalogue,
} from "../src/domain/direct-print-catalogue.ts";

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? "src/data/direct-print-scope.generated.ts";
if (!inputPath) {
  console.error("Gebruik: npx tsx scripts/generate-direct-print-scope.mjs <bestand> [uitvoer]");
  process.exit(1);
}

const products = parseDirectPrintCatalogue(await readFile(inputPath, "utf8"));
if (products.length < 50) {
  throw new Error(`Slechts ${products.length} producten gelezen; dat lijkt geen volledige lijst.`);
}

const entries = products.map((product) => ({
  manufacturer: product.manufacturer,
  name: product.sourceName,
  tokens: modelTokens(product.sourceName),
  generations: generationTokens(product.sourceName),
  layouts: layoutsFor(product),
}))
  // Een product zonder kenmerkend modelnummer is nooit te koppelen aan onze
  // catalogus, en zou alleen ruis geven.
  .filter((entry) => entry.tokens.length > 0);

const withoutLayouts = entries.filter((entry) => entry.layouts.length === 0).length;

const generated = `// Gegenereerd uit de productlijst van Notebook Service. Niet handmatig wijzigen.
//
// Per product: de kenmerkende modelnummers om op te koppelen, en welke van onze
// layouts de toetsenbordsprinter eruit kan krijgen. Een lege lijst betekent dat
// ze het model kennen maar geen enkele taal kunnen die wij verkopen.
export type DirectPrintScopeEntry = {
  manufacturer: string;
  name: string;
  tokens: readonly string[];
  generations: readonly string[];
  layouts: readonly string[];
};

export const directPrintScopeCount = ${entries.length};

export const directPrintScope: readonly DirectPrintScopeEntry[] = ${JSON.stringify(entries, null, 1)} as const;
`;

await writeFile(outputPath, generated, "utf8");
console.log(
  `${entries.length} producten weggeschreven naar ${outputPath}`
  + ` (${withoutLayouts} kennen ze wel, maar niet in een taal die wij verkopen).`,
);
