import { describe, expect, it } from "vitest";
import { databaseUuidSchema } from "./validation";

describe("PostgreSQL UUID-validatie", () => {
  it("accepteert gewone UUID's en de gedocumenteerde lokale auditidentiteit", () => {
    expect(databaseUuidSchema.safeParse("11111111-1111-4111-8111-111111111111").success).toBe(true);
    expect(databaseUuidSchema.safeParse("00000000-0000-0000-0000-000000000001").success).toBe(true);
  });

  it("weigert niet-canonieke identifiers", () => {
    expect(databaseUuidSchema.safeParse("geen-uuid").success).toBe(false);
    expect(databaseUuidSchema.safeParse("11111111-1111-4111").success).toBe(false);
  });
});
