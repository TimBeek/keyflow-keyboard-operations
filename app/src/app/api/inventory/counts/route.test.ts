import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const validRequest = {
  locationCode: "HANGMAPPENWAGEN",
  storageNumber: 75,
  countedQuantity: 24,
  notes: "Eén vel ontbreekt",
  idempotencyKey: "count-hangmap-75-20260728",
  actorId: "00000000-0000-0000-0000-000000000001",
};

describe("POST /api/inventory/counts", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("weigert ongeldige invoer voordat de database wordt benaderd", async () => {
    const response = await POST(new Request("http://localhost/api/inventory/counts", {
      method: "POST",
      body: JSON.stringify({ ...validRequest, countedQuantity: -1 }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("meldt expliciet wanneer de centrale database nog niet is aangesloten", async () => {
    delete process.env.DATABASE_URL;
    const response = await POST(new Request("http://localhost/api/inventory/counts", {
      method: "POST",
      body: JSON.stringify(validRequest),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "DATABASE_NOT_CONFIGURED" });
  });
});
