import { z } from "zod";

export const inventoryMutationSchema = z.object({
  sku: z.string().min(1),
  currentQuantity: z.number().int().nonnegative(),
  type: z.enum(["issue", "receipt", "adjustment"]),
  quantity: z.number().int().positive(),
  reasonCode: z.string().min(2),
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8),
});

export type InventoryMutation = z.input<typeof inventoryMutationSchema>;

export type InventoryMutationResult = {
  previousQuantity: number;
  quantityDelta: number;
  newQuantity: number;
  requiresApproval: boolean;
};

export function calculateInventoryMutation(rawMutation: InventoryMutation): InventoryMutationResult {
  const mutation = inventoryMutationSchema.parse(rawMutation);
  const quantityDelta = mutation.type === "issue" ? -mutation.quantity : mutation.quantity;
  const newQuantity = mutation.currentQuantity + quantityDelta;

  if (newQuantity < 0) {
    throw new InventoryRuleError(
      "INSUFFICIENT_STOCK",
      `Onvoldoende voorraad: beschikbaar ${mutation.currentQuantity}, gevraagd ${mutation.quantity}.`,
    );
  }

  return {
    previousQuantity: mutation.currentQuantity,
    quantityDelta,
    newQuantity,
    requiresApproval: mutation.type === "adjustment" || mutation.quantity >= 25,
  };
}

export class InventoryRuleError extends Error {
  constructor(public readonly code: "INSUFFICIENT_STOCK", message: string) {
    super(message);
    this.name = "InventoryRuleError";
  }
}
