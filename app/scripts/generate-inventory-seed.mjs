import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readExcelFile from "read-excel-file/node";

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? "src/data/inventory-source.generated.ts";
const jsonOutputPath = process.argv[4] ?? "db/seed/inventory-source.json";

if (!inputPath) {
  console.error(
    "Gebruik: npm run inventory:seed -- <pad-naar-xlsx> [typescript-uitvoer] [json-uitvoer]",
  );
  process.exit(1);
}

const resolvedInput = path.resolve(inputPath);
/**
 * De bron komt soms als Excel en soms als CSV-export van hetzelfde blad. Beide
 * geven dezelfde kolommen; alleen het lezen verschilt.
 */
const isCsv = resolvedInput.toLowerCase().endsWith(".csv");
const resolvedOutput = path.resolve(outputPath);
const resolvedJsonOutput = path.resolve(jsonOutputPath);
const QUOTE = '"';
const COMMA = ",";
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

/** Komma's en regeleinden binnen aanhalingstekens horen bij de cel. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const endRow = () => { row.push(cell); cell = ""; rows.push(row); row = []; };

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

let sourceRows;
let sheetName = "Productie";
if (isCsv) {
  sourceRows = parseCsv(await readFile(resolvedInput, "utf8"));
} else {
  const workbook = await readExcelFile(resolvedInput);
  const production = workbook.find(({ sheet }) => sheet.trim().toLowerCase() === "productie");
  if (!production) {
    throw new Error("Werkblad 'Productie' ontbreekt.");
  }
  sourceRows = production.data;
  sheetName = production.sheet;
}

const rows = sourceRows
  .slice(2)
  .filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""))
  .map((row, index) => ({
    sourceRow: index + 3,
    storageNumber: integer(row[0], `Hangmapnummer op rij ${index + 3}`),
    model: text(row[1]),
    stock: integer(row[2], `Voorraad op rij ${index + 3}`),
    layout: text(row[3]),
    sku: text(row[4]),
    linkedModels: text(row[5]),
    notes: text(row[6]),
  }));

const storageNumbers = new Set(rows.map(({ storageNumber }) => storageNumber));
const totalQuantity = rows.reduce((sum, row) => sum + row.stock, 0);

if (storageNumbers.size !== rows.length) {
  throw new Error("De Productie-lijst bevat dubbele hangmapnummers.");
}
if (rows.length === 0) {
  throw new Error("De Productie-lijst is leeg.");
}
if (rows.some(({ stock }) => stock < 0)) {
  throw new Error("De Productie-lijst bevat een negatieve voorraad.");
}

/**
 * Hier stond de eis dat het er precies 148 regels en 3218 vellen moesten zijn.
 * Dat was een momentopname van één bestand: elke bijgewerkte voorraadlijst zou
 * de import laten mislukken. De structuur wordt nog wél gecontroleerd, en de
 * gevonden aantallen komen in beeld zodat een mens ze kan nakijken.
 */
console.log(`Gelezen: ${rows.length} hangmappen, ${totalQuantity} vellen.`);

const sourceHash = createHash("sha256")
  .update(await readFile(resolvedInput))
  .digest("hex");

const generated = `// Gegenereerd uit de gecontroleerde Excelbron. Niet handmatig wijzigen.
export type InventorySourceRow = {
  sourceRow: number;
  storageNumber: number;
  model: string;
  stock: number;
  layout: string;
  sku: string;
  linkedModels: string;
  notes: string;
};

export const inventorySourceMetadata = ${JSON.stringify({
  fileName: path.basename(resolvedInput),
  sheet: sheetName,
  sha256: sourceHash,
  rowCount: rows.length,
  totalQuantity,
}, null, 2)} as const;

export const inventorySourceRows: readonly InventorySourceRow[] = ${JSON.stringify(rows, null, 2)};
`;

const metadata = {
  fileName: path.basename(resolvedInput),
  sheet: sheetName,
  sha256: sourceHash,
  rowCount: rows.length,
  totalQuantity,
};

await mkdir(path.dirname(resolvedOutput), { recursive: true });
await mkdir(path.dirname(resolvedJsonOutput), { recursive: true });
await writeFile(resolvedOutput, generated, "utf8");
await writeFile(
  resolvedJsonOutput,
  `${JSON.stringify({ metadata, rows }, null, 2)}\n`,
  "utf8",
);
console.log(
  `Inventarisbron gegenereerd: ${rows.length} hangmappen, ${totalQuantity} vellen, `
  + `SHA-256 ${sourceHash}; TypeScript en JSON zijn bijgewerkt.`,
);

function text(value) {
  return value === null || value === undefined
    ? ""
    : String(value).trim().replace(/\s+/g, " ");
}

function integer(value, label) {
  // Excel levert een getal, een CSV-export levert dezelfde waarde als tekst.
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} is ongeldig: ${value ?? "leeg"}.`);
  }
  return parsed;
}
