import { describe, expect, it } from "vitest";
import {
  afterFailedAttempt,
  afterSuccess,
  attemptsLeft,
  isLockedOut,
  lockoutMessage,
  lockoutMinutes,
  maxAttempts,
  type LockoutState,
} from "./pin-lockout";

const now = new Date("2026-07-29T15:00:00.000Z");
const clean: LockoutState = { failedAttempts: 0, lockedUntil: null };

describe("slot op de pincode", () => {
  it("laat de eerste misslagen nog toe", () => {
    const state = afterFailedAttempt(clean, now);

    expect(state.lockedUntil).toBeNull();
    expect(attemptsLeft(state)).toBe(maxAttempts - 1);
  });

  it("gaat op slot na de laatste poging", () => {
    let state = clean;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      state = afterFailedAttempt(state, now);
    }

    expect(isLockedOut(state, now)).toBe(true);
    expect(state.lockedUntil?.getTime()).toBe(now.getTime() + lockoutMinutes * 60_000);
  });

  it("zet de teller terug bij het op slot gaan, zodat de volgende ronde weer telt", () => {
    let state = clean;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      state = afterFailedAttempt(state, now);
    }

    expect(state.failedAttempts).toBe(0);
  });

  it("gaat na een kwartier weer open", () => {
    let state = clean;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      state = afterFailedAttempt(state, now);
    }
    const later = new Date(now.getTime() + (lockoutMinutes + 1) * 60_000);

    expect(isLockedOut(state, later)).toBe(false);
  });

  it("wist alles na een geslaagde aanmelding", () => {
    expect(afterSuccess()).toEqual({ failedAttempts: 0, lockedUntil: null });
  });
});

describe("wat de gebruiker leest", () => {
  it("waarschuwt pas als het bijna misgaat", () => {
    expect(lockoutMessage({ failedAttempts: 1, lockedUntil: null }, now))
      .toBe("Die pincode klopt niet.");
    expect(lockoutMessage({ failedAttempts: 4, lockedUntil: null }, now))
      .toContain("Nog 1 poging");
  });

  it("zegt hoe lang het slot er nog op zit", () => {
    const locked = { failedAttempts: 0, lockedUntil: new Date(now.getTime() + 5 * 60_000) };

    expect(lockoutMessage(locked, now)).toContain("Wacht 5 minuten");
  });
});
