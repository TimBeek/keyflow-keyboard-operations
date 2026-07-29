import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const cookiesMock = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import {
  ACCESS_COOKIE,
  createAccessToken,
  readAccessToken,
  resolvePilotClaim,
  resolveSignedClaim,
} from "./access-session";

function signedInWith(token: string) {
  cookiesMock.mockResolvedValue({
    get: (name: string) => (name === ACCESS_COOKIE ? { value: token } : undefined),
  });
}

/**
 * Dit ondertekende briefje is het enige dat management en Noviply scheidt van
 * de open werkvloer. Er stond nog geen test op, terwijl elke regel hier het
 * verschil is tussen "aangemeld" en "iemand heeft wat in de cookie getypt".
 */

const previousSecret = process.env.KEYFLOW_SESSION_SECRET;
const now = 1_800_000_000;
const user = "42f85ddd-00a1-41b2-9a4b-70f4e3f09d3b";

beforeAll(() => {
  process.env.KEYFLOW_SESSION_SECRET = "x".repeat(48);
});
afterAll(() => {
  process.env.KEYFLOW_SESSION_SECRET = previousSecret;
});

describe("het aanmeldbewijs", () => {
  it("geeft terug wie er is aangemeld", () => {
    const token = createAccessToken(user, "management", now);

    expect(readAccessToken(token, now + 60)).toEqual({
      userId: user,
      role: "management",
      provisional: false,
    });
  });

  it("weigert een omgeschreven rol", () => {
    // Wie 'noviply' in 'management' verandert, breekt de handtekening.
    const token = createAccessToken(user, "noviply", now).replace("noviply", "management");

    expect(readAccessToken(token, now + 60)).toBeNull();
  });

  it("weigert een verlopen bewijs", () => {
    const token = createAccessToken(user, "management", now);

    expect(readAccessToken(token, now + 60 * 60 * 24 * 400)).toBeNull();
  });

  it("weigert onzin en niets", () => {
    expect(readAccessToken(undefined, now)).toBeNull();
    expect(readAccessToken("", now)).toBeNull();
    expect(readAccessToken("a.b.c.d.e", now)).toBeNull();
  });

  it("weigert de werkvloerrol; die heeft geen bewijs nodig", () => {
    const token = createAccessToken(user, "employee", now);

    expect(readAccessToken(token, now + 60)).toBeNull();
  });
});

describe("een tijdelijke pincode", () => {
  it("levert een halve sessie op", () => {
    const token = createAccessToken(user, "management", now, true);

    expect(readAccessToken(token, now + 60)).toMatchObject({ provisional: true });
  });

  it("laat zich niet naar een volledige sessie ompennen", () => {
    // Zonder handtekening over de vlag zou dit precies de omweg zijn: aanmelden
    // met de rondgestuurde code, de 't' in een 'f' veranderen, en nooit meer
    // een eigen code hoeven kiezen.
    const token = createAccessToken(user, "management", now, true);
    const parts = token.split(".");
    const vervalst = [parts[0], parts[1], parts[2], "f", parts[4]].join(".");

    expect(readAccessToken(vervalst, now + 60)).toBeNull();
  });

  it("geeft nog geen managementrechten", async () => {
    // Dit is waar het om gaat: de code uit het mailtje opent nog niets. Voor de
    // rest van de app ben je gewoon werkvloer tot je een eigen code kiest.
    signedInWith(createAccessToken(user, "management", Math.floor(Date.now() / 1000), true));

    await expect(resolvePilotClaim()).resolves.toMatchObject({ role: "employee" });
  });

  it("laat wél zien wie er bezig is met het kiezen van een code", async () => {
    // Anders zou de route die de pincode wijzigt niet weten voor wie.
    signedInWith(createAccessToken(user, "management", Math.floor(Date.now() / 1000), true));

    await expect(resolveSignedClaim()).resolves.toMatchObject({
      userId: user,
      role: "management",
      provisional: true,
    });
  });

  it("geeft na het kiezen van een eigen code wel de volle rol", async () => {
    signedInWith(createAccessToken(user, "management", Math.floor(Date.now() / 1000)));

    await expect(resolvePilotClaim()).resolves.toMatchObject({
      userId: user,
      role: "management",
    });
  });
});
