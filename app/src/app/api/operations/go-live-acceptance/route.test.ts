import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const validRequest = {
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
  idempotencyKey: "acceptance-database-2026-07-28",
  actorId: "00000000-0000-0000-0000-000000000001",
};

describe("POST /api/operations/go-live-acceptance", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("blokkeert een onvolledige goedkeuring vóór databasegebruik", async () => {
    const response = await POST(new Request(
      "http://localhost/api/operations/go-live-acceptance",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...validRequest,
          checks: { ...validRequest.checks, evidenceAttached: false },
        }),
      },
    ));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "APPROVAL_CHECKS_INCOMPLETE",
    });
  });

  it("meldt expliciet wanneer de centrale database niet is aangesloten", async () => {
    delete process.env.DATABASE_URL;
    const response = await POST(new Request(
      "http://localhost/api/operations/go-live-acceptance",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validRequest),
      },
    ));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "DATABASE_NOT_CONFIGURED",
    });
  });
});
