import { describe, expect, it } from "vitest";
import {
  listGoLiveAcceptanceRecords,
  recordGoLiveAcceptance,
} from "./go-live-acceptance-service";
import { GET } from "@/app/api/operations/go-live-acceptance/route";

const databaseConfigured = Boolean(process.env.DATABASE_URL);

describe.skipIf(!databaseConfigured)("centraal go-live-acceptatiedossier", () => {
  it("registreert idempotent een open CI-controle zonder externe goedkeuring te simuleren", async () => {
    const actorId = process.env.KEYFLOW_IMPORT_ACTOR_ID;
    if (!actorId) throw new Error("KEYFLOW_IMPORT_ACTOR_ID ontbreekt.");
    const runReference = process.env.GITHUB_SHA?.slice(0, 40) ?? "local-integration";
    const idempotencyKey = `ci-go-live-acceptance:${runReference}`;
    const input = {
      gate: "database_recovery" as const,
      ownerName: "CI runtimecontrole",
      evidenceReference: "",
      evidenceDate: null,
      checks: {
        scopeConfirmed: true,
        testCompleted: false,
        evidenceAttached: false,
        ownerApproved: false,
      },
      decision: "pending" as const,
      notes: "Alleen het centrale registratiepad is getest; externe acceptatie blijft open.",
      idempotencyKey,
      actorId,
    };

    const first = await recordGoLiveAcceptance(input);
    const duplicate = await recordGoLiveAcceptance(input);
    const history = await listGoLiveAcceptanceRecords(actorId);
    const statusResponse = await GET(new Request(
      `http://localhost/api/operations/go-live-acceptance?actorId=${actorId}`,
    ));
    const status = await statusResponse.json();

    expect(first.duplicate).toBe(false);
    expect(first.record).toMatchObject({
      gate: "database_recovery",
      decision: "pending",
      evidenceReference: "",
      checks: {
        scopeConfirmed: true,
        testCompleted: false,
        evidenceAttached: false,
        ownerApproved: false,
      },
    });
    expect(duplicate).toEqual({
      record: first.record,
      duplicate: true,
    });
    expect(history).toContainEqual(first.record);
    expect(statusResponse.status).toBe(200);
    expect(status).toMatchObject({
      summary: {
        total: 5,
        canRelease: false,
      },
    });
  });
});
