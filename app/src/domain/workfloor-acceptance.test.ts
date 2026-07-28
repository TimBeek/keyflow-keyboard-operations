import { describe, expect, it } from "vitest";
import {
  createWorkfloorTrialRecord,
  workfloorTrialSummary,
  type WorkfloorTrialInput,
} from "./workfloor-acceptance";

const passedInput: WorkfloorTrialInput = {
  trialReference: "WF-ACCEPT-2026-01",
  location: "Productievloer A",
  deviceType: "desktop",
  deviceName: "Werkstation KBD-01",
  scannerName: "Zebra DS2208",
  participants: 3,
  ordersTested: 8,
  startedAt: "2026-07-28T08:00:00.000Z",
  completedAt: "2026-07-28T10:00:00.000Z",
  averageHandlingSeconds: 145,
  methods: {
    loose_stickers: true,
    noviply_sheet: true,
    printed_sticker: true,
    direct_reprint: true,
  },
  errorScenarioTested: true,
  checks: {
    orderScanWithoutMouse: true,
    modelResolution: true,
    hangingFileMatched: true,
    keyboardGuideReadable: true,
    deductionAfterVerification: true,
    mismatchStopsDeduction: true,
  },
  result: "passed",
  evidenceReference: "TICKET-WF-2026-01",
  notes: "Volledige acceptatieproef uitgevoerd.",
};

const metadata = {
  id: "trial-1",
  recordedAt: "2026-07-28T10:15:00.000Z",
  recordedBy: "Tim Beek",
};

describe("werkvloeracceptatieproef", () => {
  it("registreert een volledig onderbouwde geslaagde proef", () => {
    expect(createWorkfloorTrialRecord(passedInput, metadata)).toMatchObject({
      trialReference: "WF-ACCEPT-2026-01",
      result: "passed",
      ordersTested: 8,
    });
  });

  it("blokkeert een geslaagde proef wanneer één methode ontbreekt", () => {
    expect(() => createWorkfloorTrialRecord({
      ...passedInput,
      methods: { ...passedInput.methods, loose_stickers: false },
    }, metadata)).toThrow("alle vier methoden");
  });

  it("blokkeert een ongeldige tijdlijn", () => {
    expect(() => createWorkfloorTrialRecord({
      ...passedInput,
      completedAt: "2026-07-28T07:59:00.000Z",
    }, metadata)).toThrow("na de start");
  });

  it("vereist oorzaak en vervolgactie bij een mislukte proef", () => {
    expect(() => createWorkfloorTrialRecord({
      ...passedInput,
      result: "failed",
      notes: "mislukt",
    }, metadata)).toThrow("oorzaak en vervolgactie");
  });

  it("vat open, mislukte en geslaagde proeven samen", () => {
    const passed = createWorkfloorTrialRecord(passedInput, metadata);
    const open = createWorkfloorTrialRecord({
      ...passedInput,
      trialReference: "WF-OPEN-2026-02",
      completedAt: null,
      averageHandlingSeconds: null,
      ordersTested: 0,
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
      notes: "",
    }, {
      ...metadata,
      id: "trial-2",
      recordedAt: "2026-07-29T08:00:00.000Z",
    });
    expect(workfloorTrialSummary([passed, open])).toMatchObject({
      total: 2,
      passed: 1,
      open: 1,
      latest: open,
      latestPassed: passed,
    });
  });
});
