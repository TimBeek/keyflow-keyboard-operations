import { describe, expect, it } from "vitest";
import {
  createRecoveryDrill,
  latestRecoveryDrill,
  productionReadinessGates,
  productionReadinessSummary,
  RecoveryDrillError,
  type RecoveryDrillInput,
} from "./production-readiness";

const passedInput: RecoveryDrillInput = {
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
};

describe("productiecontinuïteit", () => {
  it("registreert een volledige geslaagde herstelproef", () => {
    expect(createRecoveryDrill(passedInput, {
      id: "drill-1",
      recordedAt: "2026-07-28T09:00:00.000Z",
      recordedBy: "Tim Beek",
    })).toMatchObject({
      id: "drill-1",
      backupReference: "azure-backup-2026-07-28",
      targetEnvironment: "recovery",
      result: "passed",
      rtoMinutes: 42,
    });
  });

  it("weigert een geslaagde status als een integriteitscontrole ontbreekt", () => {
    expect(() => createRecoveryDrill({
      ...passedInput,
      checks: { ...passedInput.checks, transactionLedger: false },
    }, {
      id: "drill-2",
      recordedAt: "2026-07-28T09:00:00.000Z",
      recordedBy: "Tim Beek",
    })).toThrowError(expect.objectContaining<Partial<RecoveryDrillError>>({
      code: "PASSED_CHECKS_INCOMPLETE",
    }));
  });

  it("vereist oorzaak en vervolgactie bij een mislukte proef", () => {
    expect(() => createRecoveryDrill({
      ...passedInput,
      result: "failed",
      checks: { ...passedInput.checks, accessControl: false },
      notes: "mislukt",
    }, {
      id: "drill-3",
      recordedAt: "2026-07-28T09:00:00.000Z",
      recordedBy: "Tim Beek",
    })).toThrowError(expect.objectContaining<Partial<RecoveryDrillError>>({
      code: "FAILED_NOTES_REQUIRED",
    }));
  });

  it("weigert een eindtijd vóór de starttijd", () => {
    expect(() => createRecoveryDrill({
      ...passedInput,
      completedAt: "2026-07-28T07:59:00.000Z",
    }, {
      id: "drill-4",
      recordedAt: "2026-07-28T09:00:00.000Z",
      recordedBy: "Tim Beek",
    })).toThrowError(expect.objectContaining<Partial<RecoveryDrillError>>({
      code: "INVALID_TIME_RANGE",
    }));
  });

  it("maakt een geslaagde herstelproef zichtbaar in de go-livepoorten", () => {
    const drill = createRecoveryDrill(passedInput, {
      id: "drill-5",
      recordedAt: "2026-07-28T09:00:00.000Z",
      recordedBy: "Tim Beek",
    });
    expect(latestRecoveryDrill([drill])).toEqual(drill);
    expect(productionReadinessGates([drill]).find(({ id }) => id === "recovery_drill"))
      .toMatchObject({ status: "ready" });
    expect(productionReadinessSummary([drill])).toEqual({
      total: 7,
      ready: 3,
      actionRequired: 0,
      external: 4,
    });
  });
});
