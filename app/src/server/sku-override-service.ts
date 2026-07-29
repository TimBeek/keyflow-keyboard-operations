import "server-only";
import { z } from "zod";
import { stickerSkuPattern, StickerSkuError } from "@/domain/sticker-sku";
import { requirePermission } from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

/**
 * Aanvullingen op artikelnummers die de Excel niet kon leveren. Zie migratie
 * 0022 voor waarom dit náást de bron staat en niet erin.
 */

const setSchema = z.object({
  catalogKey: z.string().regex(/^hangmap-\d{3}$/, "Onbekende hangmap."),
  sku: z.string().min(1).max(64),
  actorId: databaseUuidSchema,
});

export type SetSkuOverrideInput = z.input<typeof setSchema>;

export async function readSkuOverrides() {
  const sql = database();
  const rows = await sql<{ catalog_key: string; sku: string }[]>`
    select catalog_key, sku from sku_overrides
  `;
  return Object.fromEntries(rows.map((row) => [row.catalog_key, row.sku]));
}

export async function setSkuOverride(rawInput: SetSkuOverrideInput) {
  const input = setSchema.parse(rawInput);
  await requirePermission(input.actorId, "imports.manage");
  const sku = input.sku.trim().toUpperCase();
  if (!stickerSkuPattern.test(sku)) {
    throw new StickerSkuError(
      "Een artikelnummer ziet eruit als NB10052E1NL: NB, cijfers, de entervorm en het land.",
    );
  }

  const sql = database();
  await sql`
    insert into sku_overrides (catalog_key, sku, updated_by)
    values (${input.catalogKey}, ${sku}, ${input.actorId})
    on conflict (catalog_key) do update
    set sku = excluded.sku,
        updated_by = excluded.updated_by,
        updated_at = now()
  `;
  return { catalogKey: input.catalogKey, sku };
}
