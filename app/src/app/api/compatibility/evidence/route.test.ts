import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const validRequest = {
  catalogKey: "hangmap-075",
  model: "Dell Latitude 5420",
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
  idempotencyKey: "evidence-5420-e1-20260728",
  actorId: "00000000-0000-0000-0000-000000000001",
};

describe("POST /api/compatibility/evidence", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("blokkeert een incomplete goedkeuring vóór databasegebruik", async () => {
    const response = await POST(new Request(
      "http://localhost/api/compatibility/evidence",
      {
        method: "POST",
        body: JSON.stringify({
          ...validRequest,
          checkpoints: { ...validRequest.checkpoints, functionRow: false },
        }),
        headers: { "content-type": "application/json" },
      },
    ));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "COMPATIBILITY_EVIDENCE_INCOMPLETE",
    });
  });

  it("weigert een model dat niet bij de gekozen hangmap hoort", async () => {
    const response = await POST(new Request(
      "http://localhost/api/compatibility/evidence",
      {
        method: "POST",
        body: JSON.stringify({
          ...validRequest,
          model: "HP EliteBook 850 G7",
        }),
        headers: { "content-type": "application/json" },
      },
    ));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "COMPATIBILITY_EVIDENCE_INCOMPLETE",
    });
  });

  it("meldt expliciet wanneer de centrale database nog niet is aangesloten", async () => {
    delete process.env.DATABASE_URL;
    const response = await POST(new Request(
      "http://localhost/api/compatibility/evidence",
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
