import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

// De pilotrol komt uit een ondertekende cookie op de server, niet uit het
// verzoek. In een test is er geen verzoekcontext, dus zetten we hem hier.
const pilotClaimMock = vi.hoisted(() => vi.fn());
vi.mock("./access-session", () => ({ resolvePilotActorId: pilotClaimMock }));

import {
  RequestIdentityError,
  resolveRequestActorId,
} from "./request-identity";

const previousAuthMode = process.env.KEYFLOW_AUTH_MODE;

afterEach(() => {
  authMock.mockReset();
  pilotClaimMock.mockReset();
  if (previousAuthMode === undefined) delete process.env.KEYFLOW_AUTH_MODE;
  else process.env.KEYFLOW_AUTH_MODE = previousAuthMode;
});

describe("persoonlijke API-actor", () => {
  it("negeert wat de browser meestuurt en volgt de aanmelding op de server", async () => {
    // Anders kon iedereen zich als management voordoen door een ander id mee
    // te sturen, en waren de rechten alleen een gordijn.
    process.env.KEYFLOW_AUTH_MODE = "pilot";
    pilotClaimMock.mockResolvedValue("00000000-0000-0000-0000-000000000002");

    await expect(resolveRequestActorId("00000000-0000-0000-0000-000000000001"))
      .resolves.toBe("00000000-0000-0000-0000-000000000002");
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
