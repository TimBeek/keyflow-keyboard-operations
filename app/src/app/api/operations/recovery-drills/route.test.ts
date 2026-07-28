import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const validRequest = {
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
  idempotencyKey: "recovery-azure-2026-07-28",
  actorId: "00000000-0000-0000-0000-000000000001",
};

describe("POST /api/operations/recovery-drills", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("blokkeert een onvolledige geslaagde proef vóór databasegebruik", async () => {
    const response = await POST(new Request(
      "http://localhost/api/operations/recovery-drills",
      {
        method: "POST",
        body: JSON.stringify({
          ...validRequest,
          checks: { ...validRequest.checks, transactionLedger: false },
        }),
        headers: { "content-type": "application/json" },
      },
    ));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "PASSED_CHECKS_INCOMPLETE",
    });
  });

  it("weigert productie als hersteldoel", async () => {
    const response = await POST(new Request(
      "http://localhost/api/operations/recovery-drills",
      {
        method: "POST",
        body: JSON.stringify({
          ...validRequest,
          targetEnvironment: "production",
        }),
        headers: { "content-type": "application/json" },
      },
    ));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("meldt expliciet wanneer de centrale database nog niet is aangesloten", async () => {
    delete process.env.DATABASE_URL;
    const response = await POST(new Request(
      "http://localhost/api/operations/recovery-drills",
      {
        method: "POST",
        body: JSON.stringify(validRequest),
        headers: { "content-type": "application/json" },
      },
    ));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "DATABASE_NOT_CONFIGURED",
    });
  });
});
