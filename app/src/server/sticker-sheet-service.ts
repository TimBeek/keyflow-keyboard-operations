import "server-only";
import { z } from "zod";
import { stickerSkuPattern, StickerSkuError } from "@/domain/sticker-sku";
import { requirePermission } from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

/**
 * Een nieuw stickervel in de voorraad zetten.
 *
 * De 148 hangmappen kwamen uit de Excel. Maar er komen nieuwe modellen bij, en
 * die moesten tot nu toe wachten op een nieuwe import — of erger, buiten het
 * systeem om in een hangmap belanden. Dan klopt de voorraad niet meer.
 */

const addSchema = z.object({
  storageNumber: z.number().int().positive().max(9999),
  sku: z.string().min(1).max(64),
  model: z.string().min(2).max(200),
  layout: z.string().min(2).max(80),
  /** Wat er nu fysiek in de hangmap ligt. */
  quantity: z.number().int().nonnegative().max(100_000),
  notes: z.string().max(300).default(""),
  idempotencyKey: z.string().min(8).max(200),
  actorId: databaseUuidSchema,
});

export type AddStickerSheetInput = z.input<typeof addSchema>;

export class StickerSheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StickerSheetError";
  }
}

export async function addStickerSheet(rawInput: AddStickerSheetInput) {
  const input = addSchema.parse(rawInput);
  await requirePermission(input.actorId, "imports.manage");

  const sku = input.sku.trim().toUpperCase();
  if (!stickerSkuPattern.test(sku)) {
    throw new StickerSkuError(
      "Een artikelnummer ziet eruit als NB10052E1NL: NB, cijfers, de entervorm en het land.",
    );
  }

  const sql = database();
  return sql.begin(async (transaction) => {
    // Twee keer op opslaan mag geen tweede hangmap opleveren.
    const [existingKey] = await transaction<{ id: string }[]>`
      select id from inventory_transactions
      where idempotency_key = ${input.idempotencyKey} limit 1
    `;
    if (existingKey) {
      return { duplicate: true as const, storageNumber: input.storageNumber, sku };
    }

    const [takenNumber] = await transaction<{ sku: string }[]>`
      select sku from sticker_skus where hanging_file_number = ${input.storageNumber} limit 1
    `;
    if (takenNumber) {
      throw new StickerSheetError(
        `Hangmap ${input.storageNumber} is al in gebruik voor ${takenNumber.sku}.`,
      );
    }
    const [takenSku] = await transaction<{ hanging_file_number: number }[]>`
      select hanging_file_number from sticker_skus where sku = ${sku} limit 1
    `;
    if (takenSku) {
      throw new StickerSheetError(
        `${sku} ligt al in hangmap ${takenSku.hanging_file_number}.`,
      );
    }

    const layoutCode = input.layout.trim().toUpperCase().replace(/[\s/]+/g, "_");
    const [layout] = await transaction<{ id: string }[]>`
      select id from keyboard_layouts where code = ${layoutCode} limit 1
    `;
    if (!layout) {
      throw new StickerSheetError(`Layout ${input.layout} is onbekend.`);
    }

    const [inserted] = await transaction<{ id: string }[]>`
      insert into sticker_skus (sku, name, layout_id, method_code, hanging_file_number, notes)
      values (
        ${sku},
        ${`${input.model.trim()} · ${input.layout.trim()}`},
        ${layout.id},
        'noviply_sheet',
        ${input.storageNumber},
        ${input.notes.trim() || null}
      )
      returning id
    `;

    const [location] = await transaction<{ id: string }[]>`
      select id from locations where code = 'HANGMAPPENWAGEN' limit 1
    `;
    await transaction`
      insert into inventory_balances (sku_id, location_id, on_hand)
      values (${inserted.id}, ${location.id}, ${input.quantity})
    `;

    // Een beginstand is geen dagverbruik: hij hoort niet als levering in het
    // verloop op te duiken.
    if (input.quantity > 0) {
      await transaction`
        insert into inventory_transactions (
          sku_id, location_id, type, quantity_delta, reason_code,
          notes, idempotency_key, performed_by
        )
        values (
          ${inserted.id}, ${location.id}, 'opening', ${input.quantity},
          'new_sheet', ${input.notes.trim() || null},
          ${input.idempotencyKey}, ${input.actorId}
        )
      `;
    }

    return { duplicate: false as const, storageNumber: input.storageNumber, sku };
  });
}

/** Het eerste vrije hangmapnummer, zodat niemand hoeft te zoeken. */
export async function nextStorageNumber() {
  const sql = database();
  const [row] = await sql<{ next: number }[]>`
    select coalesce(max(hanging_file_number), 0) + 1 as next from sticker_skus
  `;
  return row.next;
}
