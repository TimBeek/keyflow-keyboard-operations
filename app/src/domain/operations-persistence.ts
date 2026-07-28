import { z } from "zod";
import type { CompatibilityEvidenceRecord } from "@/domain/compatibility-evidence";
import type {
  InventoryTransactionEntry,
  OperationsPolicy,
} from "@/domain/operations";
import type { StockCountRecord } from "@/domain/cycle-count";
import type { ModelGroupDecision } from "@/domain/model-grouping";
import type { StickerVerificationReport } from "@/domain/sticker-verification";
import type { RecoveryDrillRecord } from "@/domain/production-readiness";

export const OPERATIONS_STORAGE_KEY = "keyflow.operations-state.v1";

const transactionSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().min(10),
  catalogKey: z.string().min(1).optional(),
  storageNumber: z.number().int().positive().optional(),
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

const stickerVerificationReportSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().min(10),
  orderReference: z.string().min(1),
  sku: z.string().min(1),
  storageNumber: z.number().int().positive(),
  model: z.string().min(1),
  targetLayout: z.string().min(1),
  variant: z.string().min(1),
  outcome: z.enum(["passed", "blocked_unused", "scrapped"]),
  failureReason: z.enum([
    "wrong_storage",
    "wrong_sku",
    "wrong_layout",
    "wrong_variant",
    "position_mismatch",
    "other",
  ]).optional(),
  actor: z.string().min(1),
});

const stockCountRecordSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().min(10),
  catalogKey: z.string().min(1),
  storageNumber: z.number().int().positive(),
  sku: z.string(),
  model: z.string().min(1),
  expectedQuantity: z.number().int().nonnegative(),
  countedQuantity: z.number().int().nonnegative(),
  difference: z.number().int(),
  status: z.enum(["matched", "shortage", "overage"]),
  notes: z.string().optional(),
  actor: z.string().min(1),
});

const modelGroupDecisionSchema = z.object({
  id: z.string().min(1),
  proposalId: z.string().min(1),
  decidedAt: z.string().min(10),
  reviewer: z.string().min(1),
  status: z.enum(["approved", "rejected"]),
  manufacturerPartNumber: z.string(),
  photoReference: z.string(),
  notes: z.string(),
  evidence: z.object({
    exactVariantConfirmed: z.boolean(),
    manufacturerPartNumberConfirmed: z.boolean(),
    photoConfirmed: z.boolean(),
    dryFitPassed: z.boolean(),
  }),
});

const compatibilityEvidenceRecordSchema = z.object({
  id: z.string().min(1),
  recordedAt: z.string().min(10),
  reviewer: z.string().min(1),
  catalogKey: z.string().min(1),
  model: z.string().min(1),
  sku: z.string().min(1),
  storageNumber: z.number().int().positive(),
  layout: z.string().min(1),
  variant: z.string().min(1),
  status: z.enum(["approved", "rejected"]),
  manufacturerPartNumber: z.string().min(1),
  photoReference: z.string().min(1),
  keyboardWidthMm: z.number().min(150).max(500),
  keyboardHeightMm: z.number().min(50).max(250),
  checkpoints: z.object({
    enterShape: z.boolean(),
    shiftKeys: z.boolean(),
    arrowKeys: z.boolean(),
    functionRow: z.boolean(),
    pointingStickAndNumpad: z.boolean(),
  }),
  notes: z.string(),
});

const recoveryDrillRecordSchema = z.object({
  id: z.string().min(1),
  backupReference: z.string().min(3).max(200),
  targetEnvironment: z.enum(["staging", "recovery"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  rpoMinutes: z.number().int().nonnegative().max(43_200),
  rtoMinutes: z.number().int().nonnegative().max(10_080),
  checks: z.object({
    migrations: z.boolean(),
    sourceSnapshot: z.boolean(),
    inventoryBalances: z.boolean(),
    transactionLedger: z.boolean(),
    accessControl: z.boolean(),
  }),
  result: z.enum(["passed", "failed"]),
  notes: z.string().max(1000),
  recordedAt: z.string().datetime(),
  recordedBy: z.string().min(1),
});

const persistedOperationsStateSchema = z.object({
  format: z.literal("keyflow-operations"),
  version: z.literal(1),
  savedAt: z.string().min(10),
  catalogQuantities: z.record(z.string(), z.number().int().nonnegative()),
  transactions: z.array(transactionSchema).max(2500),
  operationsPolicy: policySchema,
  verificationReports: z.array(stickerVerificationReportSchema).max(2500).default([]),
  stockCounts: z.array(stockCountRecordSchema).max(2500).default([]),
  modelGroupDecisions: z.array(modelGroupDecisionSchema).max(2500).default([]),
  compatibilityEvidenceRecords: z.array(compatibilityEvidenceRecordSchema).max(2500).default([]),
  recoveryDrills: z.array(recoveryDrillRecordSchema).max(250).default([]),
});

export type PersistedOperationsState = {
  format: "keyflow-operations";
  version: 1;
  savedAt: string;
  catalogQuantities: Record<string, number>;
  transactions: InventoryTransactionEntry[];
  operationsPolicy: OperationsPolicy;
  verificationReports: StickerVerificationReport[];
  stockCounts: StockCountRecord[];
  modelGroupDecisions: ModelGroupDecision[];
  compatibilityEvidenceRecords: CompatibilityEvidenceRecord[];
  recoveryDrills: RecoveryDrillRecord[];
};

export type OperationsStateInput = Omit<
  PersistedOperationsState,
  "format" | "version" | "savedAt" | "recoveryDrills"
> & {
  recoveryDrills?: RecoveryDrillRecord[];
};

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
