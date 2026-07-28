import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readExcelFile from "read-excel-file/node";

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? "src/data/inventory-source.generated.ts";

if (!inputPath) {
  console.error("Gebruik: npm run inventory:seed -- <pad-naar-xlsx> [uitvoerbestand]");
  process.exit(1);
}

const resolvedInput = path.resolve(inputPath);
const resolvedOutput = path.resolve(outputPath);
const workbook = await readExcelFile(resolvedInput);
const production = workbook.find(({ sheet }) => sheet.trim().toLowerCase() === "productie");

if (!production) {
  throw new Error("Werkblad 'Productie' ontbreekt.");
}

const rows = production.data
  .slice(2)
  .filter((row) => row.some((cell) => cell !== null))
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
if (rows.length !== 148 || totalQuantity !== 3218) {
  throw new Error(
    `Onverwachte broninhoud: ${rows.length} regels en ${totalQuantity} vellen; verwacht 148 en 3218.`,
  );
}

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
  sheet: production.sheet,
  sha256: sourceHash,
  rowCount: rows.length,
  totalQuantity,
}, null, 2)} as const;

export const inventorySourceRows: readonly InventorySourceRow[] = ${JSON.stringify(rows, null, 2)};
`;

await writeFile(resolvedOutput, generated, "utf8");
console.log(
  `Inventarisbron gegenereerd: ${rows.length} hangmappen, ${totalQuantity} vellen, SHA-256 ${sourceHash}.`,
);

function text(value) {
  return value === null || value === undefined
    ? ""
    : String(value).trim().replace(/\s+/g, " ");
}

function integer(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} is ongeldig: ${value ?? "leeg"}.`);
  }
  return value;
}
