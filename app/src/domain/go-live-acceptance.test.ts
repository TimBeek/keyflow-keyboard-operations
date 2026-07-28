import { describe, expect, it } from "vitest";
import {
  createGoLiveAcceptanceDossier,
  createGoLiveAcceptanceRecord,
  goLiveAcceptanceGateRequirements,
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

  it("maakt een overdraagbaar dossier met actuele poorten en volledige historie", () => {
    const approved = createGoLiveAcceptanceRecord(approvedInput, metadata);
    const dossier = createGoLiveAcceptanceDossier([approved], {
      generatedAt: "2026-07-28T15:00:00.000Z",
      generatedBy: "Tim Beek",
      storageMode: "central",
    });

    expect(dossier).toMatchObject({
      format: "keyflow-go-live-acceptance",
      version: 1,
      generatedBy: "Tim Beek",
      storageMode: "central",
      summary: {
        approved: 1,
        pending: 4,
        canRelease: false,
      },
    });
    expect(dossier.gates).toHaveLength(5);
    expect(dossier.gates[0]).toMatchObject({
      gate: "database_recovery",
      currentDecision: approved,
    });
    expect(dossier.history).toEqual([approved]);
  });

  it("beschrijft voor iedere poort concrete bewijseisen", () => {
    expect(Object.values(goLiveAcceptanceGateRequirements)).toHaveLength(5);
    expect(Object.values(goLiveAcceptanceGateRequirements)
      .every((requirements) => requirements.length >= 4)).toBe(true);
    expect(goLiveAcceptanceGateRequirements.workfloor_acceptance)
      .toContain("Hangmapnummer tegen de fysieke wagen gecontroleerd");
  });
});
