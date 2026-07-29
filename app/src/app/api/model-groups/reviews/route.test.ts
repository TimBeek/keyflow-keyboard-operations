import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const validRequest = {
  proposalId: "modelgroep-hangmap-001",
  status: "approved",
  manufacturerPartNumber: "DELL-KB-001",
  photoReference: "FOTO-HANGMAP-1",
  notes: "Bronconflicten zijn gecontroleerd en verklaard.",
  evidence: {
    exactVariantConfirmed: true,
    manufacturerPartNumberConfirmed: true,
    photoConfirmed: true,
    dryFitPassed: true,
  },
  excludedModels: [],
  addedModels: [],
  idempotencyKey: "model-group-review-hangmap-1",
  actorId: "00000000-0000-0000-0000-000000000001",
};

describe("POST /api/model-groups/reviews", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("laat een goedkeuring zonder bewijs door tot aan de database", async () => {
    delete process.env.DATABASE_URL;
    const response = await POST(new Request(
      "http://localhost/api/model-groups/reviews",
      {
        method: "POST",
        body: JSON.stringify({
          ...validRequest,
          manufacturerPartNumber: "",
          photoReference: "",
          notes: "",
          evidence: {
            exactVariantConfirmed: false,
            manufacturerPartNumberConfirmed: false,
            photoConfirmed: false,
            dryFitPassed: false,
          },
        }),
        headers: { "content-type": "application/json" },
      },
    ));

    // Bewijs blokkeert de beslissing niet meer; het verzoek strandt pas op de database.
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "DATABASE_NOT_CONFIGURED",
    });
  });

  it("weigert onbekende voorstellen vóór databasegebruik", async () => {
    const response = await POST(new Request(
      "http://localhost/api/model-groups/reviews",
      {
        method: "POST",
        body: JSON.stringify({
          ...validRequest,
          proposalId: "modelgroep-onbekend",
        }),
        headers: { "content-type": "application/json" },
      },
    ));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: "MODEL_GROUP_PROPOSAL_NOT_FOUND",
    });
  });

  it("meldt expliciet wanneer de centrale database nog niet is aangesloten", async () => {
    delete process.env.DATABASE_URL;
    const response = await POST(new Request(
      "http://localhost/api/model-groups/reviews",
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
