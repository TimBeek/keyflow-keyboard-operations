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
      recoveryDrills: [{
        id: "recovery-75",
        backupReference: "azure-backup-2026-07-28",
        targetEnvironment: "recovery",
        startedAt: "2026-07-28T08:00:00.000Z",
        completedAt: "2026-07-28T08:42:00.000Z",
        rpoMinutes: 15,
        rtoMinutes: 42,
        checks: {
          migrations: true,
          sourceSnapshot: true,
          inventoryBalances: true,
          transactionLedger: true,
          accessControl: true,
        },
        result: "passed",
        notes: "Herstel buiten productie volledig gecontroleerd.",
        recordedAt: "2026-07-28T09:00:00.000Z",
        recordedBy: "Tim Beek",
      }],
      goLiveAcceptanceRecords: [{
        id: "acceptance-75",
        gate: "database_recovery",
        ownerName: "Tim Beek",
        evidenceReference: "AZURE-RESTORE-2026-07-28",
        evidenceDate: "2026-07-28T12:00:00.000Z",
        checks: {
          scopeConfirmed: true,
          testCompleted: true,
          evidenceAttached: true,
          ownerApproved: true,
        },
        decision: "approved",
        notes: "Restore en integriteitscontrole uitgevoerd.",
        recordedAt: "2026-07-28T13:00:00.000Z",
        reviewedBy: "Tim Beek",
      }],
      workfloorTrials: [{
        id: "workfloor-75",
        trialReference: "WF-PILOT-2026-01",
        location: "Productievloer A",
        deviceType: "desktop",
        deviceName: "Werkstation KBD-01",
        scannerName: "Zebra DS2208",
        participants: 2,
        ordersTested: 0,
        startedAt: "2026-07-28T14:00:00.000Z",
        completedAt: null,
        averageHandlingSeconds: null,
        methods: {
          loose_stickers: false,
          noviply_sheet: false,
          printed_sticker: false,
          direct_reprint: false,
        },
        errorScenarioTested: false,
        checks: {
          orderScanWithoutMouse: false,
          modelResolution: false,
          hangingFileMatched: false,
          keyboardGuideReadable: false,
          deductionAfterVerification: false,
          mismatchStopsDeduction: false,
        },
        result: "open",
        evidenceReference: "",
        notes: "Proef ingepland.",
        recordedAt: "2026-07-28T13:00:00.000Z",
        recordedBy: "Tim Beek",
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
      expect(restored.state.recoveryDrills[0]).toMatchObject({
        backupReference: "azure-backup-2026-07-28",
        result: "passed",
        rtoMinutes: 42,
      });
      expect(restored.state.goLiveAcceptanceRecords[0]).toMatchObject({
        gate: "database_recovery",
        decision: "approved",
      });
      expect(restored.state.workfloorTrials[0]).toMatchObject({
        trialReference: "WF-PILOT-2026-01",
        result: "open",
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
      expect(restored.state.recoveryDrills).toEqual([]);
      expect(restored.state.goLiveAcceptanceRecords).toEqual([]);
      expect(restored.state.workfloorTrials).toEqual([]);
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
