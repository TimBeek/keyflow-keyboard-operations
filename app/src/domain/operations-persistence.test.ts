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
      catalogQuantities: { "hangmap-075": 24 },
      transactions: initialInventoryTransactions.slice(0, 2),
      operationsPolicy: defaultOperationsPolicy,
      verificationReports: [],
      stockCounts: [{
        id: "count-75",
        occurredAt: "2026-07-27T17:55:00.000Z",
        catalogKey: "hangmap-075",
        storageNumber: 75,
        sku: "NB10172E1NL",
        model: "Dell Latitude 5420",
        expectedQuantity: 25,
        countedQuantity: 24,
        difference: -1,
        status: "shortage",
        notes: "Eén beschadigd vel",
        actor: "Tim Beek",
      }],
      modelGroupDecisions: [{
        id: "decision-75",
        proposalId: "modelgroep-hangmap-075",
        decidedAt: "2026-07-27T17:58:00.000Z",
        reviewer: "Tim Beek",
        status: "approved",
        manufacturerPartNumber: "0A12345",
        photoReference: "FOTO-75",
        notes: "Droge pastest uitgevoerd.",
        evidence: {
          exactVariantConfirmed: true,
          manufacturerPartNumberConfirmed: true,
          photoConfirmed: true,
          dryFitPassed: true,
        },
      }],
      compatibilityEvidenceRecords: [{
        id: "evidence-75",
        recordedAt: "2026-07-27T17:59:00.000Z",
        reviewer: "Tim Beek",
        catalogKey: "hangmap-075",
        model: "Dell Latitude 5420",
        sku: "NB10172E1NL",
        storageNumber: 75,
        layout: "QWERTY US",
        variant: "E1",
        status: "approved",
        manufacturerPartNumber: "0A12345",
        photoReference: "FOTO-5420-E1",
        keyboardWidthMm: 285,
        keyboardHeightMm: 105,
        checkpoints: {
          enterShape: true,
          shiftKeys: true,
          arrowKeys: true,
          functionRow: true,
          pointingStickAndNumpad: true,
        },
        notes: "Droge pastest uitgevoerd.",
      }],
    }, "2026-07-27T18:00:00.000Z");

    const restored = parseOperationsSnapshot(serializeOperationsSnapshot(snapshot));
    expect(restored.success).toBe(true);
    if (restored.success) {
      expect(restored.state.catalogQuantities["hangmap-075"]).toBe(24);
      expect(restored.state.version).toBe(1);
      expect(restored.state.stockCounts).toHaveLength(1);
      expect(restored.state.stockCounts[0]).toMatchObject({
        storageNumber: 75,
        difference: -1,
        status: "shortage",
      });
      expect(restored.state.modelGroupDecisions[0]).toMatchObject({
        proposalId: "modelgroep-hangmap-075",
        status: "approved",
      });
      expect(restored.state.compatibilityEvidenceRecords[0]).toMatchObject({
        catalogKey: "hangmap-075",
        model: "Dell Latitude 5420",
        status: "approved",
      });
    }
  });

  it("weigert een beschadigde of onbekende back-up", () => {
    expect(parseOperationsSnapshot("{kapot").success).toBe(false);
    expect(parseOperationsSnapshot(JSON.stringify({ version: 99 })).success).toBe(false);
  });

  it("herstelt bestaande versie-1-back-ups zonder controlehistorie", () => {
    const legacyBackup = {
      format: "keyflow-operations",
      version: 1,
      savedAt: "2026-07-27T18:00:00.000Z",
      catalogQuantities: {},
      transactions: [],
      operationsPolicy: defaultOperationsPolicy,
    };

    const restored = parseOperationsSnapshot(JSON.stringify(legacyBackup));
    expect(restored.success).toBe(true);
    if (restored.success) {
      expect(restored.state.verificationReports).toEqual([]);
      expect(restored.state.stockCounts).toEqual([]);
      expect(restored.state.modelGroupDecisions).toEqual([]);
      expect(restored.state.compatibilityEvidenceRecords).toEqual([]);
    }
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
      verificationReports: [],
      stockCounts: [],
      modelGroupDecisions: [],
      compatibilityEvidenceRecords: [],
    });

    writeOperationsState(storage, snapshot);
    expect(values.has(OPERATIONS_STORAGE_KEY)).toBe(true);
    expect(readOperationsState(storage).success).toBe(true);
    clearOperationsState(storage);
    expect(readOperationsState(storage)).toEqual({ success: true, state: null });
  });
});
