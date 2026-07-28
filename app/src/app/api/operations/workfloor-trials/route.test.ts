import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const validRequest = {
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
  idempotencyKey: "workfloor-trial-2026-01",
  actorId: "00000000-0000-0000-0000-000000000001",
};

describe("POST /api/operations/workfloor-trials", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("blokkeert een onvolledige geslaagde proef vóór databasegebruik", async () => {
    const response = await POST(new Request(
      "http://localhost/api/operations/workfloor-trials",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...validRequest,
          checks: {
            ...validRequest.checks,
            mismatchStopsDeduction: false,
          },
        }),
      },
    ));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "PASSED_TRIAL_INCOMPLETE",
    });
  });

  it("meldt expliciet wanneer de centrale database niet is aangesloten", async () => {
    delete process.env.DATABASE_URL;
    const response = await POST(new Request(
      "http://localhost/api/operations/workfloor-trials",
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
