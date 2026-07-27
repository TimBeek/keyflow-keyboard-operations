import readExcelFile from "read-excel-file/node";
import path from "node:path";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Gebruik: npm run import:analyze -- <pad-naar-xlsx>");
  process.exit(1);
}

const resolvedPath = path.resolve(inputPath);
const sheets = await readExcelFile(resolvedPath);
const production = sheets.find(({ sheet }) => sheet.trim().toLowerCase() === "productie");

if (!production) {
  console.error("Werkblad 'Productie' ontbreekt.");
  process.exit(1);
}

const rows = production.data
  .slice(2)
  .filter((row) => row.some((cell) => cell !== null))
  .map((row, index) => ({
    sourceRow: index + 3,
    storageNumber: row[0],
    model: cleanText(row[1]),
    quantity: row[2],
    layout: cleanText(row[3]),
    sku: cleanText(row[4]),
    linkedModels: cleanText(row[5]),
    notes: cleanText(row[6]),
  }));

const issues = [];
const skuRows = new Map();
const modelRows = new Map();
const storageNumberRows = new Map();

for (const row of rows) {
  if (!Number.isInteger(row.storageNumber) || row.storageNumber <= 0) {
    issues.push(issue("error", row.sourceRow, "storageNumber", `Ongeldig hangmapnummer: ${row.storageNumber}`));
  }
  if (!Number.isInteger(row.quantity) || row.quantity < 0) {
    issues.push(issue("error", row.sourceRow, "quantity", `Ongeldig aantal: ${row.quantity}`));
  }
  if (!row.sku || !/^NB\d+E\d+(NL|FR|DE)$/i.test(row.sku)) {
    issues.push(issue("error", row.sourceRow, "sku", `Ontbrekend of afwijkend artikelnummer: ${row.sku || "leeg"}`));
  }
  if (!["QWERTY US", "AZERTY FR", "QWERTZ DE"].includes(row.layout)) {
    issues.push(issue("warning", row.sourceRow, "layout", `Onbekende layout: ${row.layout || "leeg"}`));
  }
  if (!row.linkedModels || ["geen gevonden", "-", "\\", "0", "a"].includes(row.linkedModels.toLowerCase())) {
    issues.push(issue("warning", row.sourceRow, "linkedModels", "Compatibiliteit ontbreekt of bevat een placeholder."));
  }
  addIndex(skuRows, row.sku, row.sourceRow);
  addIndex(modelRows, normalize(row.model), row.sourceRow);
  if (Number.isInteger(row.storageNumber)) addIndex(storageNumberRows, String(row.storageNumber), row.sourceRow);
}

for (const [sku, sourceRows] of skuRows) {
  if (sku && sourceRows.length > 1) {
    issues.push(issue("review", sourceRows[0], "sku", `Dubbel artikelnummer ${sku} op rijen ${sourceRows.join(", ")}.`));
  }
}
for (const [model, sourceRows] of modelRows) {
  if (model && sourceRows.length > 1) {
    issues.push(issue("review", sourceRows[0], "model", `Dubbele modelnaam na normalisatie op rijen ${sourceRows.join(", ")}.`));
  }
}
for (const [storageNumber, sourceRows] of storageNumberRows) {
  if (sourceRows.length > 1) {
    issues.push(issue("review", sourceRows[0], "storageNumber", `Hangmapnummer ${storageNumber} wordt gebruikt op rijen ${sourceRows.join(", ")}.`));
  }
}

const result = {
  source: resolvedPath,
  sheets: sheets.map(({ sheet, data }) => ({ name: sheet, rows: data.length })),
  summary: {
    records: rows.length,
    totalQuantity: rows.reduce((sum, row) => sum + (Number.isInteger(row.quantity) ? row.quantity : 0), 0),
    errors: issues.filter(({ severity }) => severity === "error").length,
    warnings: issues.filter(({ severity }) => severity === "warning").length,
    reviews: issues.filter(({ severity }) => severity === "review").length,
  },
  issues,
};

console.log(JSON.stringify(result, null, 2));

function cleanText(value) {
  return value === null || value === undefined ? "" : String(value).trim().replace(/\s+/g, " ");
}

function normalize(value) {
  return cleanText(value).toLowerCase();
}

function addIndex(index, key, row) {
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(row);
}

function issue(severity, row, field, message) {
  return { severity, row, field, message };
}
