import "server-only";
import type { TransactionSql } from "postgres";
import { z } from "zod";
import {
  calculateInventoryMutation,
  InventoryRuleError,
} from "@/domain/inventory";
import { database } from "@/server/database";
import {
  AuthorizationError,
  requirePermission,
} from "@/server/authorization-service";
import { databaseUuidSchema } from "@/server/validation";

export const recordMutationSchema = z.object({
  sku: z.string().min(1).max(64),
  locationCode: z.string().min(1).max(64),
  type: z.enum(["issue", "receipt", "adjustment"]),
  quantity: z.number().int().positive().max(100_000),
  reasonCode: z.string().min(2).max(64),
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8).max(200),
  actorId: databaseUuidSchema,
});

export type RecordMutationInput = z.input<typeof recordMutationSchema>;

export async function recordInventoryMutation(rawInput: RecordMutationInput) {
  const input = recordMutationSchema.parse(rawInput);
  await requirePermission(input.actorId, "inventory.mutate");
  const sql = database();

  return sql.begin(async (transaction) => {
    const existing = await transaction<{
      id: string;
      quantity_delta: number;
    }[]>`
      select id, quantity_delta
      from inventory_transactions
      where idempotency_key = ${input.idempotencyKey}
      limit 1
    `;

    if (existing[0]) {
      const balance = await findBalance(transaction, input.sku, input.locationCode, false);
      return {
        transactionId: existing[0].id,
        quantityDelta: existing[0].quantity_delta,
        newQuantity: balance.on_hand,
        duplicate: true,
        requiresApproval: false,
      };
    }

    const balance = await findBalance(transaction, input.sku, input.locationCode, true);
    const calculation = calculateInventoryMutation({
      sku: input.sku,
      currentQuantity: balance.on_hand,
      type: input.type,
      quantity: input.quantity,
      reasonCode: input.reasonCode,
      notes: input.notes,
      idempotencyKey: input.idempotencyKey,
    });

    const [created] = await transaction<{ id: string }[]>`
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
        ${mapTransactionType(input.type)},
        ${calculation.quantityDelta},
        ${input.reasonCode},
        ${input.notes ?? null},
        ${input.idempotencyKey},
        ${input.actorId}::uuid
      )
      returning id
    `;

    await transaction`
      update inventory_balances
      set
        on_hand = ${calculation.newQuantity},
        version = version + 1,
        updated_at = now()
      where sku_id = ${balance.sku_id}::uuid
        and location_id = ${balance.location_id}::uuid
    `;

    return {
      transactionId: created.id,
      quantityDelta: calculation.quantityDelta,
      newQuantity: calculation.newQuantity,
      duplicate: false,
      requiresApproval: calculation.requiresApproval,
    };
  });
}

async function findBalance(
  transaction: TransactionSql,
  sku: string,
  locationCode: string,
  lock: boolean,
) {
  const lockClause = lock ? transaction`for update` : transaction``;
  const rows = await transaction<{
    sku_id: string;
    location_id: string;
    on_hand: number;
  }[]>`
    select
      balance.sku_id,
      balance.location_id,
      balance.on_hand
    from inventory_balances balance
    inner join sticker_skus item on item.id = balance.sku_id
    inner join locations location on location.id = balance.location_id
    where item.sku = ${sku}
      and location.code = ${locationCode}
    ${lockClause}
  `;

  if (!rows[0]) {
    throw new InventoryPersistenceError(
      "BALANCE_NOT_FOUND",
      `Geen voorraadbalans gevonden voor ${sku} op locatie ${locationCode}.`,
    );
  }

  return rows[0];
}

function mapTransactionType(type: RecordMutationInput["type"]) {
  if (type === "issue") return "issue";
  if (type === "receipt") return "receipt";
  return "adjustment";
}

export class InventoryPersistenceError extends Error {
  constructor(
    public readonly code: "BALANCE_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "InventoryPersistenceError";
  }
}

export function inventoryErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return { status: 400, body: { error: "INVALID_INPUT", details: error.flatten() } };
  }
  if (error instanceof InventoryRuleError) {
    return { status: 409, body: { error: error.code, message: error.message } };
  }
  if (error instanceof InventoryPersistenceError) {
    return { status: 404, body: { error: error.code, message: error.message } };
  }
  if (error instanceof AuthorizationError) {
    return { status: 403, body: { error: error.code, message: error.message } };
  }
  throw error;
}
