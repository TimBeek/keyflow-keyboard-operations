import { describe, expect, it } from "vitest";
import {
  createGoLiveAcceptanceRecord,
  goLiveAcceptanceSummary,
  latestGoLiveAcceptanceByGate,
  type GoLiveAcceptanceInput,
} from "./go-live-acceptance";

const approvedInput: GoLiveAcceptanceInput = {
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
};

const metadata = {
  id: "acceptance-1",
  recordedAt: "2026-07-28T13:00:00.000Z",
  reviewedBy: "Tim Beek",
};

describe("go-live acceptatiedossier", () => {
  it("registreert een volledig onderbouwde goedkeuring", () => {
    expect(createGoLiveAcceptanceRecord(approvedInput, metadata)).toMatchObject({
      gate: "database_recovery",
      decision: "approved",
      evidenceReference: "AZURE-RESTORE-2026-07-28",
    });
  });

  it("blokkeert goedkeuring met een ontbrekende controle", () => {
    expect(() => createGoLiveAcceptanceRecord({
      ...approvedInput,
      checks: { ...approvedInput.checks, ownerApproved: false },
    }, metadata)).toThrow("alle vier vrijgavecontroles");
  });

  it("blokkeert goedkeuring zonder herleidbaar bewijs", () => {
    expect(() => createGoLiveAcceptanceRecord({
      ...approvedInput,
      evidenceReference: "",
      evidenceDate: null,
    }, metadata)).toThrow("bewijsreferentie en bewijsdatum");
  });

  it("vereist oorzaak en vervolgactie bij afwijzing", () => {
    expect(() => createGoLiveAcceptanceRecord({
      ...approvedInput,
      decision: "rejected",
      notes: "mislukt",
    }, metadata)).toThrow("oorzaak en vervolgactie");
  });

  it("gebruikt per poort alleen het nieuwste besluit", () => {
    const approved = createGoLiveAcceptanceRecord(approvedInput, metadata);
    const pending = createGoLiveAcceptanceRecord({
      ...approvedInput,
      decision: "pending",
      checks: { ...approvedInput.checks, ownerApproved: false },
    }, {
      ...metadata,
      id: "acceptance-2",
      recordedAt: "2026-07-28T14:00:00.000Z",
    });
    expect(latestGoLiveAcceptanceByGate([approved, pending])
      .get("database_recovery")?.decision).toBe("pending");
    expect(goLiveAcceptanceSummary([approved, pending])).toEqual({
      total: 5,
      approved: 0,
      rejected: 0,
      pending: 5,
      canRelease: false,
    });
  });
});
