/**
 * Vier cijfers zijn tienduizend mogelijkheden — in een seconde door te rekenen
 * als je onbeperkt mag proberen. Wat een pincode veilig maakt is niet de
 * lengte maar het slot: na een paar misslagen kan er even niets meer.
 */

export const maxAttempts = 5;
export const lockoutMinutes = 15;

export type LockoutState = {
  failedAttempts: number;
  lockedUntil: Date | null;
};

export function isLockedOut(state: LockoutState, now: Date) {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

export function afterFailedAttempt(state: LockoutState, now: Date): LockoutState {
  const failedAttempts = state.failedAttempts + 1;
  if (failedAttempts < maxAttempts) {
    return { failedAttempts, lockedUntil: null };
  }
  // Op slot, en de teller terug: anders zou elke volgende poging meteen weer
  // een kwartier kosten.
  return {
    failedAttempts: 0,
    lockedUntil: new Date(now.getTime() + lockoutMinutes * 60_000),
  };
}

export function afterSuccess(): LockoutState {
  return { failedAttempts: 0, lockedUntil: null };
}

export function attemptsLeft(state: LockoutState) {
  return Math.max(0, maxAttempts - state.failedAttempts);
}

/** Wat de gebruiker hierover moet lezen. */
export function lockoutMessage(state: LockoutState, now: Date) {
  if (isLockedOut(state, now)) {
    const minutes = Math.max(1, Math.ceil((state.lockedUntil!.getTime() - now.getTime()) / 60_000));
    return `Te vaak mis geprobeerd. Wacht ${minutes} ${minutes === 1 ? "minuut" : "minuten"} en probeer het opnieuw.`;
  }
  const left = attemptsLeft(state);
  if (left <= 2) {
    return `Die pincode klopt niet. Nog ${left} ${left === 1 ? "poging" : "pogingen"}.`;
  }
  return "Die pincode klopt niet.";
}
