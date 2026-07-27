import { z } from "zod";
import type {
  InventoryTransactionEntry,
  OperationsPolicy,
} from "@/domain/operations";

export const OPERATIONS_STORAGE_KEY = "keyflow.operations-state.v1";

const transactionSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().min(10),
  sku: z.string().min(1),
  model: z.string().min(1),
  layout: z.string().min(1),
  type: z.enum(["issue", "receipt", "adjustment"]),
  quantityDelta: z.number().int().refine((value) => value !== 0),
  reasonCode: z.string().min(1),
  notes: z.string().optional(),
  actor: z.string().min(1),
  reference: z.string().optional(),
});

const policySchema = z.object({
  thresholdEur: z.number().positive(),
  workload: z.enum(["normal", "busy", "critical"]),
  methodEnabled: z.object({
    loose_stickers: z.boolean(),
    noviply_sheet: z.boolean(),
    printed_sticker: z.boolean(),
    direct_reprint: z.boolean(),
  }),
  employeeCanReceive: z.boolean(),
  employeeCanBookMismatch: z.boolean(),
  abcAThreshold: z.number().int().min(1).max(98),
  abcBThreshold: z.number().int().min(2).max(99),
}).refine((policy) => policy.abcAThreshold < policy.abcBThreshold, {
  message: "ABC A-grens moet lager zijn dan de B-grens.",
});

const persistedOperationsStateSchema = z.object({
  format: z.literal("keyflow-operations"),
  version: z.literal(1),
  savedAt: z.string().min(10),
  catalogQuantities: z.record(z.string(), z.number().int().nonnegative()),
  transactions: z.array(transactionSchema).max(2500),
  operationsPolicy: policySchema,
});

export type PersistedOperationsState = {
  format: "keyflow-operations";
  version: 1;
  savedAt: string;
  catalogQuantities: Record<string, number>;
  transactions: InventoryTransactionEntry[];
  operationsPolicy: OperationsPolicy;
};

export type OperationsStateInput = Omit<
  PersistedOperationsState,
  "format" | "version" | "savedAt"
>;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createOperationsSnapshot(
  input: OperationsStateInput,
  savedAt = new Date().toISOString(),
): PersistedOperationsState {
  return persistedOperationsStateSchema.parse({
    format: "keyflow-operations",
    version: 1,
    savedAt,
    ...input,
  }) as PersistedOperationsState;
}

export function serializeOperationsSnapshot(snapshot: PersistedOperationsState) {
  return JSON.stringify(persistedOperationsStateSchema.parse(snapshot), null, 2);
}

export function parseOperationsSnapshot(rawValue: string) {
  try {
    const parsed = persistedOperationsStateSchema.safeParse(JSON.parse(rawValue));
    return parsed.success
      ? { success: true as const, state: parsed.data as PersistedOperationsState }
      : { success: false as const, error: "Het bestand heeft geen geldige KeyFlow-structuur." };
  } catch {
    return { success: false as const, error: "Het bestand bevat geen geldige JSON." };
  }
}

export function readOperationsState(storage: StorageLike) {
  const rawValue = storage.getItem(OPERATIONS_STORAGE_KEY);
  if (!rawValue) return { success: true as const, state: null };
  return parseOperationsSnapshot(rawValue);
}

export function writeOperationsState(
  storage: StorageLike,
  snapshot: PersistedOperationsState,
) {
  storage.setItem(OPERATIONS_STORAGE_KEY, serializeOperationsSnapshot(snapshot));
}

export function clearOperationsState(storage: StorageLike) {
  storage.removeItem(OPERATIONS_STORAGE_KEY);
}
