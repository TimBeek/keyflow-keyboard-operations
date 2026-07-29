/**
 * Zet de laptopdatabase om in een lijst die de werkvloer kan doorzoeken.
 *
 * Gebruik: node scripts/generate-laptop-models.mjs <pad-naar-csv> [uitvoer]
 *
 * Van de drieëntwintig kolommen is er bijna niets bruikbaar voor stickers.
 * Processor, geheugen en gewicht zeggen niets over een toetsenbord. Wat wel
 * telt: de naam (om op te zoeken), en of er een numeriek deel op zit — dat
 * verandert de indeling van het toetsenbord en dus welke sticker past.
 */
import { readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? "src/data/laptop-models.generated.ts";
if (!inputPath) {
  console.error("Gebruik: node scripts/generate-laptop-models.mjs <csv> [uitvoer]");
  process.exit(1);
}

const QUOTE = '"';
const COMMA = ",";
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

/**
 * De aansluitingenkolom bevat komma's én regeleinden binnen aanhalingstekens.
 * Per regel knippen breekt daarop: dan schuiven alle kolommen op en belandt
 * "1x USB4 40Gbps" in de modelkolom. Daarom het hele bestand in één keer, met
 * de aanhalingstekens als leidraad.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === QUOTE) {
        if (text[index + 1] === QUOTE) { cell += QUOTE; index += 1; }
        else inQuotes = false;
      } else cell += char;
      continue;
    }
    if (char === QUOTE) { inQuotes = true; continue; }
    if (char === COMMA) { row.push(cell); cell = ""; continue; }
    if (char === CR) continue;
    if (char === LF) { endRow(); continue; }
    cell += char;
  }
  endRow();
  return rows;
}

const rows = parseCsv(await readFile(inputPath, "utf8"));
const header = rows[0].map((cell) => cell.trim());
const modelIndex = header.indexOf("Model");
const numpadIndex = header.indexOf("Numeriek keypad");
if (modelIndex === -1) throw new Error("Kolom 'Model' ontbreekt.");

const byName = new Map();
for (const cells of rows.slice(1)) {
  const name = (cells[modelIndex] ?? "").trim();
  if (!name) continue;

  // De bron schrijft Y of N — niet het Nederlandse J. Alles anders betekent
  // "niet ingevuld", en dat is iets anders dan "nee".
  const flag = (cells[numpadIndex] ?? "").trim().toUpperCase();
  const numpad = numpadIndex === -1 || !["Y", "J", "N"].includes(flag)
    ? null
    : flag !== "N";

  // Hetzelfde model staat er meerdere keren in, per processorvariant. Voor een
  // toetsenbord maakt dat niets uit. Spreken die regels elkaar tegen over het
  // numerieke deel, dan weten we het niet zeker.
  if (!byName.has(name)) byName.set(name, numpad);
  else if (byName.get(name) !== numpad) byName.set(name, null);
}

const models = [...byName.entries()]
  .map(([name, numpad]) => ({ name, numpad }))
  .sort((left, right) => left.name.localeCompare(right.name, "nl"));

const withNumpad = models.filter((model) => model.numpad === true).length;
const withoutNumpad = models.filter((model) => model.numpad === false).length;

const generated = `// Gegenereerd uit de laptopdatabase. Niet handmatig wijzigen.
//
// Alleen wat een toetsenbord raakt: de naam om op te zoeken, en of er een
// numeriek deel op zit. Null betekent dat de bron het niet eenduidig zegt.
export type LaptopModelEntry = {
  name: string;
  numpad: boolean | null;
};

export const laptopModelCount = ${models.length};

export const laptopModels: readonly LaptopModelEntry[] = ${JSON.stringify(models, null, 2)} as const;
`;

await writeFile(outputPath, generated, "utf8");
console.log(
  `${models.length} modellen weggeschreven naar ${outputPath}`
  + ` (${withNumpad} met numeriek deel, ${withoutNumpad} zonder,`
  + ` ${models.length - withNumpad - withoutNumpad} onbekend).`,
);
