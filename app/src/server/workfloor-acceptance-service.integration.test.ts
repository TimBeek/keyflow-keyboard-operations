import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/operations/workfloor-trials/route";
import {
  listWorkfloorTrials,
  recordWorkfloorTrial,
} from "./workfloor-acceptance-service";

const databaseConfigured = Boolean(process.env.DATABASE_URL);

describe.skipIf(!databaseConfigured)("centrale werkvloeracceptatieproef", () => {
  it("registreert idempotent een open CI-proef zonder werkvloeracceptatie te simuleren", async () => {
    const actorId = process.env.KEYFLOW_IMPORT_ACTOR_ID;
    if (!actorId) throw new Error("KEYFLOW_IMPORT_ACTOR_ID ontbreekt.");
    const runReference = process.env.GITHUB_SHA?.slice(0, 40) ?? "local-integration";
    const input = {
      trialReference: `CI-WF-${runReference.slice(0, 12)}`,
      location: "Tijdelijke CI-database",
      deviceType: "desktop" as const,
      deviceName: "Geen fysiek apparaat",
      scannerName: "Geen fysieke scanner",
      participants: 1,
      ordersTested: 0,
      startedAt: "2026-07-28T08:00:00.000Z",
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
      result: "open" as const,
      evidenceReference: "",
      notes: "Alleen het centrale registratiepad wordt gecontroleerd.",
      idempotencyKey: `ci-workfloor-trial:${runReference}`,
      actorId,
    };

    const first = await recordWorkfloorTrial(input);
    const duplicate = await recordWorkfloorTrial(input);
    const history = await listWorkfloorTrials(actorId);
    const statusResponse = await GET(new Request(
      `http://localhost/api/operations/workfloor-trials?actorId=${actorId}`,
    ));
    const status = await statusResponse.json();

    expect(first.duplicate).toBe(false);
    expect(first.record).toMatchObject({
      result: "open",
      ordersTested: 0,
      errorScenarioTested: false,
    });
    expect(duplicate).toEqual({
      record: first.record,
      duplicate: true,
    });
    expect(history).toContainEqual(first.record);
    expect(statusResponse.status).toBe(200);
    expect(status).toMatchObject({
      summary: {
        total: 1,
        passed: 0,
        open: 1,
      },
    });
  });
});
