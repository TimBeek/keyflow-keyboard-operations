import "server-only";
import { z } from "zod";
import {
  calculateStockCount,
  StockCountRuleError,
} from "../domain/cycle-count";
import {
  AuthorizationError,
  requirePermission,
} from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

export const recordStockCountSchema = z.object({
  locationCode: z.string().min(1).max(64),
  storageNumber: z.number().int().positive().max(1_000_000),
  countedQuantity: z.number().int().nonnegative().max(1_000_000),
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8).max(200),
  actorId: databaseUuidSchema,
});

export type RecordStockCountInput = z.input<typeof recordStockCountSchema>;

export async function recordStockCount(rawInput: RecordStockCountInput) {
  const input = recordStockCountSchema.parse(rawInput);
  await requirePermission(input.actorId, "inventory.mutate");
  const sql = database();

  return sql.begin(async (transaction) => {
    // Serialiseer gelijke verzoeken vóór de duplicaatcontrole. Daardoor kan een
    // gelijktijdige retry nooit tweemaal dezelfde fysieke telling toepassen.
    await transaction`
      select pg_advisory_xact_lock(
        hashtextextended(${input.idempotencyKey}, 0)
      )
    `;

    const [existing] = await transaction<{
      line_id: string;
      count_id: string;
      transaction_id: string | null;
      expected_quantity: number;
      counted_quantity: number;
      difference: number;
      hanging_file_number: number;
      sku: string | null;
    }[]>`
      select
        line.id as line_id,
        line.count_id,
        line.inventory_transaction_id as transaction_id,
        line.expected_quantity,
        line.counted_quantity,
        line.difference,
        line.hanging_file_number,
        item.sku
      from stock_count_lines line
      left join sticker_skus item on item.id = line.sku_id
      where line.idempotency_key = ${input.idempotencyKey}
      limit 1
    `;

    if (existing) {
      return {
        countId: existing.count_id,
        lineId: existing.line_id,
        transactionId: existing.transaction_id,
        storageNumber: existing.hanging_file_number,
        sku: existing.sku,
        expectedQuantity: existing.expected_quantity,
        countedQuantity: existing.counted_quantity,
        difference: existing.difference,
        status: stockCountStatus(existing.difference),
        duplicate: true,
      };
    }

    const [balance] = await transaction<{
      sku_id: string;
      location_id: string;
      sku: string;
      on_hand: number;
    }[]>`
      select
        balance.sku_id,
        balance.location_id,
        item.sku,
        balance.on_hand
      from inventory_balances balance
      inner join sticker_skus item on item.id = balance.sku_id
      inner join locations location on location.id = balance.location_id
      where item.hanging_file_number = ${input.storageNumber}
        and location.code = ${input.locationCode}
      for update
    `;

    if (!balance) {
      throw new StockCountPersistenceError(
        "COUNT_BALANCE_NOT_FOUND",
        `Geen voorraadbalans gevonden voor hangmap ${input.storageNumber} op locatie ${input.locationCode}.`,
      );
    }

    const result = calculateStockCount(
      balance.on_hand,
      input.countedQuantity,
      input.notes,
    );
    let transactionId: string | null = null;

    if (result.difference !== 0) {
      const [createdTransaction] = await transaction<{ id: string }[]>`
        insert into inventory_transactions (
          sku_id,
          location_id,
          type,
          quantity_delta,
          reason_code,
          notes,
          idempotency_key,
          performed_by
        )
        values (
          ${balance.sku_id}::uuid,
          ${balance.location_id}::uuid,
          'adjustment',
          ${result.difference},
          ${result.difference < 0 ? "cycle_count_shortage" : "cycle_count_overage"},
          ${result.notes ?? null},
          ${`${input.idempotencyKey}:adjustment`},
          ${input.actorId}::uuid
        )
        returning id
      `;
      transactionId = createdTransaction.id;

      await transaction`
        update inventory_balances
        set
          on_hand = ${result.countedQuantity},
          version = version + 1,
          updated_at = now()
        where sku_id = ${balance.sku_id}::uuid
          and location_id = ${balance.location_id}::uuid
      `;
    }

    const [count] = await transaction<{ id: string }[]>`
      insert into stock_counts (
        location_id,
        status,
        started_by,
        completed_by,
        notes,
        completed_at
      )
      values (
        ${balance.location_id}::uuid,
        'completed',
        ${input.actorId}::uuid,
        ${input.actorId}::uuid,
        ${result.notes ?? null},
        now()
      )
      returning id
    `;

    const [line] = await transaction<{ id: string }[]>`
      insert into stock_count_lines (
        count_id,
        idempotency_key,
        sku_id,
        hanging_file_number,
        source_sku_text,
        expected_quantity,
        counted_quantity,
        difference,
        reason_code,
        notes,
        inventory_transaction_id,
        counted_by
      )
      values (
        ${count.id}::uuid,
        ${input.idempotencyKey},
        ${balance.sku_id}::uuid,
        ${input.storageNumber},
        ${balance.sku},
        ${result.expectedQuantity},
        ${result.countedQuantity},
        ${result.difference},
        ${result.difference === 0 ? "count_match" : result.difference < 0 ? "cycle_count_shortage" : "cycle_count_overage"},
        ${result.notes ?? null},
        ${transactionId}::uuid,
        ${input.actorId}::uuid
      )
      returning id
    `;

    return {
      countId: count.id,
      lineId: line.id,
      transactionId,
      storageNumber: input.storageNumber,
      sku: balance.sku,
      expectedQuantity: result.expectedQuantity,
      countedQuantity: result.countedQuantity,
      difference: result.difference,
      status: result.status,
      duplicate: false,
    };
  });
}

export function stockCountErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return { status: 400, body: { error: "INVALID_INPUT", details: error.flatten() } };
  }
  if (error instanceof StockCountRuleError) {
    return { status: 409, body: { error: "INVALID_STOCK_COUNT", message: error.message } };
  }
  if (error instanceof StockCountPersistenceError) {
    return { status: 404, body: { error: error.code, message: error.message } };
  }
  if (error instanceof AuthorizationError) {
    return { status: 403, body: { error: error.code, message: error.message } };
  }
  throw error;
}

export class StockCountPersistenceError extends Error {
  constructor(
    public readonly code: "COUNT_BALANCE_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "StockCountPersistenceError";
  }
}

function stockCountStatus(difference: number) {
  return difference === 0 ? "matched" : difference < 0 ? "shortage" : "overage";
}
