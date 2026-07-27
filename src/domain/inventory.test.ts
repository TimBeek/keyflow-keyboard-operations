import { describe, expect, it } from "vitest";
import { calculateInventoryMutation, InventoryRuleError } from "./inventory";

const base = {
  sku: "NB10060E1NL",
  currentQuantity: 12,
  quantity: 1,
  reasonCode: "refurbish_usage",
  idempotencyKey: "test-key-0001",
} as const;

describe("calculateInventoryMutation", () => {
  it("issues stock without losing the previous balance", () => {
    expect(calculateInventoryMutation({ ...base, type: "issue" })).toEqual({
      previousQuantity: 12,
      quantityDelta: -1,
      newQuantity: 11,
      requiresApproval: false,
    });
  });

  it("adds a receipt", () => {
    const result = calculateInventoryMutation({ ...base, type: "receipt", quantity: 20 });
    expect(result.newQuantity).toBe(32);
    expect(result.quantityDelta).toBe(20);
  });

  it("rejects an issue that would make stock negative", () => {
    expect(() => calculateInventoryMutation({ ...base, type: "issue", quantity: 13 }))
      .toThrow(InventoryRuleError);
  });

  it("requires approval for adjustments and large mutations", () => {
    expect(calculateInventoryMutation({ ...base, type: "adjustment" }).requiresApproval).toBe(true);
    expect(calculateInventoryMutation({ ...base, type: "receipt", quantity: 25 }).requiresApproval).toBe(true);
  });
});
