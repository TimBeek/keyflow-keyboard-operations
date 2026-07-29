import "server-only";
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import type { UserRole } from "@/domain/access-control";
import {
  afterFailedAttempt,
  afterSuccess,
  isLockedOut,
  lockoutMessage,
  type LockoutState,
} from "@/domain/pin-lockout";
import { pilotActorFor } from "@/domain/pilot-actors";
import { database } from "./database";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export const ACCESS_COOKIE = "keyflow_access";

/** Een werkdag lang; daarna opnieuw aanmelden. */
const sessionSeconds = 24 * 60 * 60;

/** De werkvloer heeft geen slot; die staat aan een tafel met een laptop. */
export const openRole: UserRole = "employee";
export const lockedRoles: UserRole[] = ["management", "noviply"];

export class AccessCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessCodeError";
  }
}

function sessionSecret() {
  const secret = process.env.KEYFLOW_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new AccessCodeError(
      "KEYFLOW_SESSION_SECRET ontbreekt of is te kort; een aanmelding kan niet veilig worden vastgehouden.",
    );
  }
  return secret;
}

/* ---------- de pincode ---------- */

export async function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(pin, salt, 32);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function pinMatches(pin: string, stored: string) {
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const derived = await scryptAsync(pin, salt, 32);
  const expectedBuffer = Buffer.from(expected, "hex");
  // Vergelijken in vaste tijd: de duur mag niet verraden hoeveel cijfers kloppen.
  return derived.length === expectedBuffer.length
    && timingSafeEqual(derived, expectedBuffer);
}

/** Wie er kan aanmelden. Alleen namen en rollen — nooit iets geheims. */
export async function listPilotAccounts() {
  const sql = database();
  const rows = await sql<{ id: string; display_name: string; role_code: UserRole }[]>`
    select u.id, u.display_name, ur.role_code
    from pilot_credentials c
    join users u on u.id = c.user_id
    join user_roles ur on ur.user_id = u.id
    where u.active
    order by ur.role_code, u.display_name
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.display_name,
    role: row.role_code,
  }));
}

export async function setPin(userId: string, pin: string) {
  if (!/^\d{4}$/.test(pin.trim())) {
    throw new AccessCodeError("Een pincode bestaat uit vier cijfers.");
  }
  const sql = database();
  await sql`
    insert into pilot_credentials (user_id, pin_hash)
    values (${userId}, ${await hashPin(pin.trim())})
    on conflict (user_id) do update
    set pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = null,
        updated_at = now()
  `;
}

export type SignInResult =
  | { ok: true; userId: string; role: UserRole; name: string }
  | { ok: false; message: string };

export async function signInWithPin(userId: string, pin: string): Promise<SignInResult> {
  const sql = database();
  const [row] = await sql<{
    pin_hash: string;
    failed_attempts: number;
    locked_until: Date | null;
    display_name: string;
    role_code: UserRole;
  }[]>`
    select c.pin_hash, c.failed_attempts, c.locked_until, u.display_name, ur.role_code
    from pilot_credentials c
    join users u on u.id = c.user_id
    join user_roles ur on ur.user_id = u.id
    where c.user_id = ${userId} and u.active
    limit 1
  `;
  // Onbekende gebruiker en verkeerde pincode geven dezelfde melding: het
  // verschil zou verraden welke accounts bestaan.
  if (!row) return { ok: false, message: "Die pincode klopt niet." };

  const now = new Date();
  const state: LockoutState = {
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
  };
  if (isLockedOut(state, now)) {
    return { ok: false, message: lockoutMessage(state, now) };
  }

  if (!(await pinMatches(pin.trim(), row.pin_hash))) {
    const next = afterFailedAttempt(state, now);
    await sql`
      update pilot_credentials
      set failed_attempts = ${next.failedAttempts}, locked_until = ${next.lockedUntil}
      where user_id = ${userId}
    `;
    return { ok: false, message: lockoutMessage(next, now) };
  }

  const cleared = afterSuccess();
  await sql`
    update pilot_credentials
    set failed_attempts = ${cleared.failedAttempts}, locked_until = ${cleared.lockedUntil}
    where user_id = ${userId}
  `;
  return { ok: true, userId, role: row.role_code, name: row.display_name };
}

/* ---------- het bewijs dat je binnen bent ---------- */

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createAccessToken(userId: string, role: UserRole, nowSeconds: number) {
  const payload = `${userId}.${role}.${nowSeconds + sessionSeconds}`;
  return `${payload}.${sign(payload)}`;
}

export type AccessClaim = { userId: string; role: UserRole };

export function readAccessToken(
  token: string | undefined,
  nowSeconds: number,
): AccessClaim | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, role, expiry, signature] = parts;
  const expected = sign(`${userId}.${role}.${expiry}`);
  // Ongeldige handtekening betekent geknoei, verlopen betekent opnieuw
  // aanmelden. Allebei: geen toegang.
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  if (Number(expiry) <= nowSeconds) return null;
  if (!lockedRoles.includes(role as UserRole)) return null;
  return { userId, role: role as UserRole };
}

/**
 * Wie de server aan dit verzoek toekent. Niet wat de browser beweert: zonder
 * geldig bewijs is iedereen werkvloer, en die mag niets van management.
 */
export async function resolvePilotClaim(): Promise<AccessClaim> {
  const jar = await cookies();
  return readAccessToken(jar.get(ACCESS_COOKIE)?.value, Math.floor(Date.now() / 1000))
    ?? { userId: pilotActorFor(openRole), role: openRole };
}

export async function resolvePilotActorId() {
  return (await resolvePilotClaim()).userId;
}
