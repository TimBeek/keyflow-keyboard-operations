import { describe, expect, it } from "vitest";
import { initialInventoryTransactions } from "../data/operations-demo";
import { defaultOperationsPolicy } from "./operations";
import {
  clearOperationsState,
  createOperationsSnapshot,
  OPERATIONS_STORAGE_KEY,
  parseOperationsSnapshot,
  readOperationsState,
  serializeOperationsSnapshot,
  writeOperationsState,
} from "./operations-persistence";

describe("operationele pilotopslag", () => {
  it("maakt een versieerbare en herstelbare snapshot", () => {
    const snapshot = createOperationsSnapshot({
      catalogQuantities: { NB10172E1NL: 24 },
      transactions: initialInventoryTransactions.slice(0, 2),
      operationsPolicy: defaultOperationsPolicy,
    }, "2026-07-27T18:00:00.000Z");

    const restored = parseOperationsSnapshot(serializeOperationsSnapshot(snapshot));
    expect(restored.success).toBe(true);
    if (restored.success) {
      expect(restored.state.catalogQuantities.NB10172E1NL).toBe(24);
      expect(restored.state.version).toBe(1);
    }
  });

  it("weigert een beschadigde of onbekende back-up", () => {
    expect(parseOperationsSnapshot("{kapot").success).toBe(false);
    expect(parseOperationsSnapshot(JSON.stringify({ version: 99 })).success).toBe(false);
  });

  it("schrijft, leest en wist via een storage-adapter", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const snapshot = createOperationsSnapshot({
      catalogQuantities: {},
      transactions: [],
      operationsPolicy: defaultOperationsPolicy,
    });

    writeOperationsState(storage, snapshot);
    expect(values.has(OPERATIONS_STORAGE_KEY)).toBe(true);
    expect(readOperationsState(storage).success).toBe(true);
    clearOperationsState(storage);
    expect(readOperationsState(storage)).toEqual({ success: true, state: null });
  });
});
