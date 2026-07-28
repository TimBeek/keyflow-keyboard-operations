import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import {
  RequestIdentityError,
  resolveRequestActorId,
} from "./request-identity";

const previousAuthMode = process.env.KEYFLOW_AUTH_MODE;

afterEach(() => {
  authMock.mockReset();
  if (previousAuthMode === undefined) delete process.env.KEYFLOW_AUTH_MODE;
  else process.env.KEYFLOW_AUTH_MODE = previousAuthMode;
});

describe("persoonlijke API-actor", () => {
  it("behoudt de expliciete lokale actor in pilotmodus", async () => {
    process.env.KEYFLOW_AUTH_MODE = "pilot";
    await expect(resolveRequestActorId("pilot-user")).resolves.toBe("pilot-user");
    expect(authMock).not.toHaveBeenCalled();
  });

  it("negeert een meegestuurde actor en gebruikt de Entra-sessie", async () => {
    process.env.KEYFLOW_AUTH_MODE = "entra";
    authMock.mockResolvedValue({
      user: {
        id: "10000000-0000-4000-8000-000000000001",
      },
    });

    await expect(resolveRequestActorId(
      "99999999-9999-4999-8999-999999999999",
    )).resolves.toBe("10000000-0000-4000-8000-000000000001");
  });

  it("weigert een productiehandeling zonder persoonlijke sessie", async () => {
    process.env.KEYFLOW_AUTH_MODE = "entra";
    authMock.mockResolvedValue(null);

    await expect(resolveRequestActorId("fake-user")).rejects.toEqual(
      expect.objectContaining<Partial<RequestIdentityError>>({
        code: "AUTHENTICATION_REQUIRED",
        status: 401,
      }),
    );
  });
});
