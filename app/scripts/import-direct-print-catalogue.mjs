/**
 * Leest de productlijst van Notebook Service in en zet hem in de database.
 *
 * Gebruik: node scripts/import-direct-print-catalogue.mjs <pad-naar-tekstbestand>
 *
 * De import vervangt de vorige lijst in één transactie: half ingelezen zou
 * betekenen dat een taal onterecht als onmogelijk geldt, en dan krijgt de
 * werkvloer een advies dat niet klopt.
 */
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Gebruik: node scripts/import-direct-print-catalogue.mjs <bestand>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL ontbreekt.");
  process.exit(1);
}

// Draaien via tsx, zodat het TypeScript-domein hergebruikt kan worden:
//   npx tsx scripts/import-direct-print-catalogue.mjs <bestand>
const { parseDirectPrintCatalogue } = await import("../src/domain/direct-print-catalogue.ts");

const text = await readFile(inputPath, "utf8");
const products = parseDirectPrintCatalogue(text);
const variantCount = products.reduce((sum, product) => sum + product.variants.length, 0);

if (products.length < 50) {
  throw new Error(`Slechts ${products.length} producten gelezen; dat lijkt geen volledige lijst.`);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require" });
try {
  await sql.begin(async (tx) => {
    await tx`delete from direct_print_variants`;
    await tx`delete from direct_print_products`;

    for (const product of products) {
      const [row] = await tx`
        insert into direct_print_products (manufacturer, source_name, normalized_name, form_factor)
        values (${product.manufacturer}, ${product.sourceName},
                ${product.normalizedName}, ${product.formFactor})
        on conflict (manufacturer, source_name) do update set imported_at = now()
        returning id
      `;
      for (const variant of product.variants) {
        await tx`
          insert into direct_print_variants
            (product_id, source_layout, keyflow_layout, converts_from, backlit, trackpoint)
          values (${row.id}, ${variant.sourceLayout}, ${variant.keyflowLayout},
                  ${variant.convertsFrom}, ${variant.backlit}, ${variant.trackpoint})
          on conflict do nothing
        `;
      }
    }
  });
  console.log(`Ingelezen: ${products.length} producten, ${variantCount} varianten.`);
} finally {
  await sql.end();
}
