import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("lekt geen database- of authenticatiesecrets in de configuratiecontrole", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousAuthSecret = process.env.AUTH_SECRET;
    process.env.DATABASE_URL = "postgres://keyflow:zeer-geheim@database/keyflow";
    process.env.AUTH_SECRET = "ook-zeer-geheim";

    try {
      const response = await GET();
      const serialized = JSON.stringify(await response.json());

      expect(response.status).toBe(200);
      expect(serialized).not.toContain("zeer-geheim");
      expect(serialized).not.toContain("postgres://");
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousAuthSecret === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = previousAuthSecret;
    }
  });
});
