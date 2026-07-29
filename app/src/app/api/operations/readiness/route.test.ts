import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/operations/readiness", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalActorId = process.env.KEYFLOW_IMPORT_ACTOR_ID;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalActorId === undefined) delete process.env.KEYFLOW_IMPORT_ACTOR_ID;
    else process.env.KEYFLOW_IMPORT_ACTOR_ID = originalActorId;
  });

  it("valt zonder aanmelding terug op de werkvloer in plaats van op een meegestuurd id", async () => {
    // Vroeger mocht de browser zeggen wie hij was; dat was geen slot maar een
    // gordijn. Zonder geldige aanmelding is iedereen werkvloer, en die komt
    // niet verder dan de rechtencontrole in de database.
    delete process.env.KEYFLOW_IMPORT_ACTOR_ID;
    const response = await GET(new Request(
      "http://localhost/api/operations/readiness?actorId=00000000-0000-0000-0000-000000000001",
    ));
    expect(response.status).not.toBe(200);
  });

  it("meldt expliciet wanneer de centrale database niet is aangesloten", async () => {
    delete process.env.DATABASE_URL;
    const response = await GET(new Request(
      "http://localhost/api/operations/readiness?actorId=00000000-0000-0000-0000-000000000001",
    ));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "DATABASE_NOT_CONFIGURED",
    });
  });
});
